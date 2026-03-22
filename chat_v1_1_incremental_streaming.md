# Chat Platform Specification — v1.1 (Incremental Token Streaming)

Draft specification for incremental bot text streaming (word/phrase/sentence chunks) with full backward compatibility for existing v1 clients.

This document is additive to `chat_v1.md` and only defines v1.1 deltas.

**Turn vs part state (aligned with `chat_v1.md` Appendix A §A.0):** Incremental **`message_done`** and subsequent **`chat_event`** payloads should carry **`sourceMessageState`** for ML turn progress; each materialized bot **part** uses **`messageState: "COMPLETED"`** when stored (see `lib/contract-types.ts`).

---

## 0) v1 model (recap — prerequisite for v1.1)

This section restates behaviour that is **already implemented in v1** (`chat_v1.md`, `ChatEventFromML` / `ChatEventToUser`) and does **not** change in v1.1 except where v1.1 adds **streaming transport** for a subset of bot text.

- For **one user message**, ML may emit **multiple bot responses** (“parts” / “partial responses”). Each part is a distinct logical unit with its own persisted **`messageId`** once materialized to the client/DB.
- Every part includes **`sourceMessageId`** linking it to the **user message** that triggered the turn.
- **`sourceMessageState`** describes **ML’s progress on the whole turn** for that **`sourceMessageId`**, not the lifecycle of an individual part row:
  - **`IN_PROGRESS`** — ML may still send **further parts** for this turn (e.g. intro text then template).
  - **`COMPLETED`** or **`ERRORED_AT_ML`** — terminal from ML for that turn (subject to v1 rules).
- In storage, the **original user message’s** **`messageState`** is updated from the **last** relevant ML signal (**`sourceMessageState`** on the ML envelope / persisted bot row per v1 — see `chat_v1.md` Appendix A §A.0).

v1.1 **does not replace** this model; it adds **optional token-level streaming** for a **single text/markdown part** before that part is finalized and, where applicable, still followed by atomic **`chat_event`** parts (e.g. templates).

---

## 1) Scope and Goals

### In scope
- Incremental streaming for bot `messageType: "text"` and `messageType: "markdown"`.
- Backward-compatible transport behavior so v1 clients continue to work unchanged.
- Provider-agnostic SSE contract from BE to FE.
- Clear fallback rules when FE does not support incremental streaming.

### Out of scope (v1.1)
- Partial streaming for `messageType: "template"` (templates remain atomic).
- Provider-specific contracts exposed to FE.
- Multi-modal token streaming (audio/image).

---

## 2) Backward Compatibility and Capability Negotiation

Incremental (v1.1) streaming is negotiated **only** via the **query parameter** on `POST /chats/send-message-streamed`:

- `streamingEnabled=true` — request v1.1 incremental SSE (`message_start` / `message_delta` / `message_done`) when the BE feature flag allows.
- Omitted or `streamingEnabled=false` — **v1 behavior**: SSE uses full `chat_event` bot messages only (no delta events).

No separate API version header is used; clients rely on this query flag only.

### Effective behavior matrix

| Query parameter | BE behavior |
|---|---|
| `streamingEnabled` absent or `false` (legacy / default) | v1 only: `chat_event` full messages, no `message_*` delta events |
| `streamingEnabled=true` | v1.1 incremental mode if `ENABLE_INCREMENTAL_STREAMING` allows; otherwise v1 `chat_event` fallback |

### Recommended BE feature flag
- `ENABLE_INCREMENTAL_STREAMING=true|false`
- If disabled, BE must gracefully fall back to v1 `chat_event` streaming even when FE requests v1.1.

---

## 3) Endpoint Changes

No new endpoint is required.

- `POST /chats/send-message` remains non-streaming JSON-only.
- `POST /chats/send-message-streamed` remains SSE, with optional v1.1 incremental semantics.

### 3.1 `POST /chats/send-message-streamed`

Request body remains identical to v1.

Additional optional request control:
- Query: `streamingEnabled=true|false` (default `false`) — **only** signal for v1.1 incremental SSE (see §2).

Required header:
- `Accept: text/event-stream`

---

## 4) SSE Event Contract (v1.1)

v1.1 introduces 3 incremental message events:
- `message_start`
- `message_delta`
- `message_done`

`message_delta` may include **optional** `chunkId` — see **§4.4.1**.

Existing v1 events remain valid:
- `connection_ack`
- `chat_event`
- `connection_close`
- `error`

### 4.1 Event ordering rules

For each bot message stream unit (`messageId`):
1. `message_start` exactly once
2. `message_delta` zero or more times
3. `message_done` exactly once

`messageId` values must be unique within conversation history.

### 4.2 Correlation fields

Shared across `message_start`, `message_delta`, and `message_done` for a given streaming unit:

- **`messageId`** — BE-assigned id for the **resulting bot message**. Announced in **`message_start`** and repeated on **`message_done`**; this is the **persisted** message id (same as in `get-history` / `ChatEventToUser.messageId`). **Do not** use a separate `eventId` on `message_done` for persistence identity — **`messageId` is the final persisted id.**

**Intermediate (non-persistent) fragments** are **`message_delta`** payloads only. They are **not** stored as separate history rows; each fragment may carry **`chunkId`** (optional but recommended for dedup) to identify that ephemeral chunk across retries/reconnects.

Also included where applicable:

- `sourceMessageId`
- `sequenceNumber`
- `messageType` (`text` or `markdown`)

### 4.2.1 Part identity, `messageId`, and ML envelope alignment (v1.1)

- **One streamed bot part = one `messageId`.** All **`message_start` / `message_delta` / `message_done`** lines for that token stream reuse the **same** **`messageId`**. That id is the id the **final** persisted bot row will use (same as v1 **part** semantics; see §0).
- **`sourceMessageId`** is repeated on deltas (and on **`message_done`**) so each chunk is traceable back to the **user message** and consistent with v1 **`ChatEventFromML`**.
- **`sourceMessageState`** on deltas (when present) still means **turn-level** ML progress for **`sourceMessageId`**, not “this chunk’s row state” (same semantic as v1; see §0 and `chat_v1.md` Appendix A §A.0). BE continues to use it to update the **user row** in DB as in v1.
- **Envelope shape:** Each **`message_delta`** payload may be treated as carrying the **same logical information as a v1 `ChatEventFromML`** would for this fragment — i.e. fields needed for tracing and normalization (`conversationId`, `sourceMessageId`, `sourceMessageState`, `sequenceNumber`, `messageType`, etc.), while **token content** is carried in **`deltaText`** (and ordering in **`chunkIndex`** / **`chunkId`**). Wire format is still SSE `event: message_delta`, not `event: chat_event` (see **§4.4.2**).
- **Storage:** BE **does not** persist individual chunks as separate **`ChatEvent`** / DB rows; persistence of the text part happens when the part is **finalized** (see **§4.5**, **§6.2**, and final **`chat_event`** in **§4.6**).

### 4.3 `message_start`

```txt
event: message_start
data: {"messageId":"msg_b_101","sourceMessageId":"msg_u_99","sequenceNumber":0,"messageType":"markdown","context":{"user_intent":"SRP","service":"buy","category":"residential","city":"526acdc6c33455e9e4e9","poly":["dce9290ec3fe8834a293"],"est":194298,"properties":[{"id":123,"type":"project"}],"uuid":[],"filters":{"type":"project"}}}
```

Notes:
- Announces a new incremental bot message.
- `context` is optional by schema, but recommended to include (aligned with current strategy).

### 4.4 `message_delta`

```txt
event: message_delta
data: {"messageId":"msg_b_101","chunkIndex":3,"deltaText":" in Sector 32 Gurgaon"}
```

Rules:
- `deltaText` is append-only fragment (word/phrase/sentence).
- `chunkIndex` starts at `0` and increments by 1.
- FE must ignore duplicate or out-of-order chunks (`chunkIndex <= lastAppliedIndex`).

#### 4.4.1 Optional chunk identity (`chunkId`)

On each `message_delta`, **`chunkId`** is **optional**. Clients that ignore it remain fully compatible; **`chunkIndex`** stays **required** and **authoritative for ordering**.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `chunkIndex` | number | **Yes** | Monotonic sequence `0, 1, 2, …` within this `messageId`. |
| `deltaText` | string | **Yes** | Append-only UTF-8 fragment (word / phrase / sentence). |
| `chunkId` | string | No | **Identity for this intermediate, non-persisted chunk** (e.g. ULID/UUID). Deltas are not separate `ChatEvent` rows; `chunkId` identifies the fragment for dedup/observability. If the same `chunkId` is received twice (retries, reconnect), FE **must** apply **at most once** (idempotent dedup). |

**Completion (persistence boundary):** **`message_done`** remains the canonical signal for **final `fullText`**, part-level completion flags, and alignment with **`get-history`**. Optionally, the **last** **`message_delta`** may declare that the **token stream** for this `messageId` is complete — see **§4.4.2** — without replacing **`message_done`** (see **§12** for trade-offs).

- **Why optional `chunkId`:** BE may normalize provider streams that emit per-chunk ids; exposing them helps idempotency and observability.

#### 4.4.2 Per-chunk streaming state & `ChatEventFromML`-shaped fields (proposal)

For **tracing**, analytics, and alignment with v1 ML contracts, each **`message_delta`** **may** include:

| Field | Required | Description |
|-------|----------|-------------|
| `messageId` | **Yes** | Same id for all chunks of this streamed part (§4.2). |
| `sourceMessageId` | **Yes** | User message id for the turn (v1 semantics). |
| `chunkIndex` | **Yes** | Monotonic fragment index (§4.4.1). |
| `deltaText` | **Yes** | Append-only fragment. |
| `chunkId` | No | Optional dedup id (§4.4.1). |
| `sourceMessageState` | Recommended | Turn-level ML state (`IN_PROGRESS` \| …) — same meaning as v1 `ChatEventFromML.sourceMessageState`. |
| **Streaming part progress** | Recommended | Indicates whether **more token chunks** may follow for **this `messageId`**. |

**Streaming part progress (naming — open):** The following avoids overloading v1 **`messageState`** on stored **`ChatEventToUser`** rows (`COMPLETED`, `PENDING`, …):

- **Recommended field name:** **`streamingPartState`** with values such as **`STREAMING`** (more deltas may follow) and **`COMPLETE`** (last token chunk for this **`messageId`** has been sent).

**Alternative (explicitly requested in product discussion):** reuse the name **`messageState`** on deltas only with values like **`INTERMEDIATE`** / **`STREAMING`** / **`COMPLETE`** for the **chunk stream**. That **collides** with v1 **`MessageState`** naming and is easy to confuse with **part row** / **user row** state — if adopted, implementations **must** scope this to **SSE `message_delta` only** and never persist these values as the DB **`messageState`** without a transform (see **§12**).

**Relationship to `ChatEventFromML`:** Conceptually, each delta can be viewed as a **non-persisted** fragment of what would be a single ML → BE message; the wire JSON may include the same top-level fields as **`ChatEventFromML`** where useful, with **`deltaText`** carrying the incremental text. **BE does not** append a **`chat_event`** per chunk.

**FE handling summary:**

1. If `chunkIndex` is not strictly `lastAppliedChunkIndex + 1`, apply §4.4 duplicate/out-of-order rules.
2. If `chunkId` is present and already in `seenChunkIds`, skip (duplicate).
3. Append `deltaText` to `bufferText` for accepted chunks.
4. On **`message_done`**, verify `fullText` matches `bufferText` (or replace buffer with `fullText` if policy allows repair), then finalize.

Optional example with `chunkId`:

```txt
event: message_delta
data: {"messageId":"msg_b_101","chunkIndex":3,"chunkId":"01ARZ3NDEKTSV4RRFFQ69G2FAV","deltaText":" in Sector 32 Gurgaon"}
```

### 4.5 `message_done`

```txt
event: message_done
data: {"messageId":"msg_b_101","sourceMessageId":"msg_u_99","sequenceNumber":0,"messageType":"markdown","messageState":"COMPLETED","sourceMessageState":"IN_PROGRESS","fullText":"# Top picks\nHere are 2BHK options in Sector 32 Gurgaon."}
```

Rules:
- **`messageId`** is the persisted bot message id (matches `message_start` for this unit). No separate `eventId` field is required on `message_done` for storage correlation.
- `fullText` must equal concatenation of all accepted deltas (after applying `chunkIndex` ordering and optional `chunkId` dedup per §4.4.1).
- **`messageState`** on `message_done` reflects the **part** row (typically **`COMPLETED`** once finalized); **`sourceMessageState`** carries **turn** progress (e.g. **`IN_PROGRESS`** when a template `chat_event` still follows).
- `message_done` is idempotent; FE may receive duplicates and should upsert by **`messageId`**.

### 4.6 Existing `chat_event` in v1.1

`chat_event` is still used for:
- `messageType: "template"` events (atomic only)
- non-incremental fallback behavior
- **Final materialization of a streamed text/markdown part** for **`get-history`** and for clients that only understand full rows: once ML has produced the **complete** part, BE emits a **`chat_event`** whose **`messageId`** matches the id announced in **`message_start`** for that stream (same **`messageId`** as **`message_done`** for that part).

**FE behaviour (proposal):** While **`message_delta`** lines are arriving, FE shows a **transient** buffer keyed by **`messageId`**. When FE receives the final **`chat_event`** for that **`messageId`** (and/or after **`message_done`** — see **§12**), FE **removes** the transient streaming UI and **renders** the final message from the **`chat_event`** payload (equivalently: replace buffered text with the canonical **`ChatEventToUser`**). This keeps a single logical message in the thread and matches **`get-history`** after refresh.

Example:
```txt
id: evt_602
event: chat_event
data: {"sender":{"type":"bot"},"payload":{"messageId":"msg_b_102","sourceMessageId":"msg_u_99","sequenceNumber":1,"messageState":"COMPLETED","sourceMessageState":"COMPLETED","messageType":"template","content":{"templateId":"property_carousel","data":{"property_count":15,"service":"buy","category":"residential","city":"526acdc6c33455e9e4e9","filters":{"poly":["dce9290ec3fe8834a293"]},"properties":[{"id":"p1"}]}}}}
```

### 4.7 `connection_close`

No change from v1 reasons:
- `response_complete`
- `request_not_pending`
- `inactivity_timeout`
- `error`

---

## 5) Canonical FE Handling Rules

### 5.1 Capability detection
- FE adds `streamingEnabled=true` to the `send-message-streamed` URL only when the client implements incremental (`message_start` / `message_delta` / `message_done`) handling.

### 5.2 Incremental render state

Maintain per-`messageId` transient state:
- `bufferText: string`
- `lastAppliedChunkIndex: number`
- `seenChunkIds: Set<string>` (optional; only if BE emits `chunkId` on `message_delta`)
- `sourceMessageId`, `sequenceNumber`, `messageType`
- `startedAt`, `updatedAt`

### 5.3 Event handling
- `message_start`: create transient message slot if missing.
- `message_delta`: append `deltaText` when `chunkIndex` is the next expected index; if `chunkId` is present, skip when already in `seenChunkIds` (§4.4.1). Optionally read **`streamingPartState`** / **`sourceMessageState`** (§4.4.2). Completion of the **token stream** is signaled by **`message_done`** and/or final **`chat_event`** (§4.6, §12).
- `message_done`: finalize buffered text for this **`messageId`**; align with **`fullText`**; clear transient streaming state when appropriate.
- `chat_event` **for the same `messageId`**: replace transient streaming UI with the canonical **`ChatEventToUser`** row (§4.6).
- `chat_event` **template** (different `messageId`): append directly (no transient buffer for that event).

### 5.4 Rendering cadence
- FE should batch UI updates (recommended 30-80ms throttle) for smoothness/performance.

### 5.5 Reconnect and recovery
- On disconnect before `connection_close`, FE calls:
  - `GET /chats/get-history?conversationId=<id>&messages_after=<lastSeenEventId>`
- History remains source of truth; FE reconciles transient partial text against persisted final events.

---

## 6) Canonical BE Handling Rules

### 6.1 Provider normalization
- BE adapts provider token stream into v1.1 normalized events.
- FE never receives provider-native chunk format.
- When upstream provides stable per-chunk ids, BE **may** emit optional `chunkId` on `message_delta` (§4.4.1); **`chunkIndex`** remains the canonical ordering key.

### 6.2 Persistence strategy
- **Chunks are not stored** as separate chat rows: **`message_delta`** fragments are **ephemeral** on the wire only.
- Persist the **final** bot **part** at **`message_done`** and/or when emitting the corresponding **`chat_event`** with full content (exact boundary is an **open decision** — see **§12**).
- Optional: checkpoint partial text in ephemeral cache (Redis/in-memory) for operational resilience or reconnect (**§5.5**).

### 6.3 Cancellation semantics
- If request is cancelled during stream:
  - stop upstream provider stream,
  - emit `connection_close` (`reason: "request_not_pending"` or `"error"` as appropriate),
  - do not emit further deltas.

### 6.4 Timeout semantics
- If BE times out waiting for upstream:
  - mark request terminal (`TIMED_OUT_BY_BE`),
  - close SSE with `connection_close`.
- FE may continue history polling per existing v1 behavior.
- FE clears awaiting / treats the turn as complete when `TIMED_OUT_BY_BE` is surfaced (same terminal semantics as bot `COMPLETED` / `ERRORED_AT_ML` on the stream per canonical `chat_v1.md` §4.5 / §6).

### 6.5 Mock stream pacing (chat-demo `send-message-streamed` only)

When testing the **v1** SSE path (full `chat_event` streaming, not incremental `message_*` deltas), the Next.js mock can slow multipart bot output: set **`ENABLE_MOCK_ML_DELAYS=true`** — see **`chat_v1.md` Appendix A §A.3.1** (initial delay ~6s, **5s** between each `chat_event`). Unrelated to v1.1 incremental token events but useful for observing staged awaiting copy (§4.7 / Appendix A §A.2).

---

## 7) Request/Response Examples

## 7.1 v1 legacy FE (no incremental support)

Request:
```http
POST /api/chats/send-message-streamed
Accept: text/event-stream
Content-Type: application/json
```

SSE response (unchanged v1 pattern):
```txt
event: connection_ack
data: {"eventId":"evt_u_11","messageState":"PENDING"}

id: evt_b_21
event: chat_event
data: {"sender":{"type":"bot"},"payload":{"messageId":"msg_b_21","sourceMessageId":"msg_u_11","sequenceNumber":0,"messageState":"COMPLETED","sourceMessageState":"COMPLETED","messageType":"markdown","content":{"text":"Here are options for you."}}}

event: connection_close
data: {"reason":"response_complete"}
```

## 7.2 v1.1 FE incremental markdown + template

Request:
```http
POST /api/chats/send-message-streamed?streamingEnabled=true
Accept: text/event-stream
Content-Type: application/json
```

SSE response:
```txt
event: connection_ack
data: {"eventId":"evt_u_12","messageState":"PENDING"}

event: message_start
data: {"messageId":"msg_b_31","sourceMessageId":"msg_u_12","sequenceNumber":0,"messageType":"markdown","context":{"user_intent":"SRP","service":"buy","category":"residential","city":"526acdc6c33455e9e4e9","poly":["dce9290ec3fe8834a293"],"est":194298,"properties":[{"id":123,"type":"project"}],"uuid":[],"filters":{"type":"project"}}}

event: message_delta
data: {"messageId":"msg_b_31","chunkIndex":0,"deltaText":"# Great options"}

event: message_delta
data: {"messageId":"msg_b_31","chunkIndex":1,"deltaText":" in Sector 32 Gurgaon"}

event: message_done
data: {"messageId":"msg_b_31","sourceMessageId":"msg_u_12","sequenceNumber":0,"messageType":"markdown","messageState":"COMPLETED","sourceMessageState":"IN_PROGRESS","fullText":"# Great options in Sector 32 Gurgaon"}

id: evt_b_32
event: chat_event
data: {"sender":{"type":"bot"},"payload":{"messageId":"msg_b_32","sourceMessageId":"msg_u_12","sequenceNumber":1,"messageState":"COMPLETED","sourceMessageState":"COMPLETED","messageType":"template","content":{"templateId":"property_carousel","data":{"property_count":15,"service":"buy","category":"residential","city":"526acdc6c33455e9e4e9","filters":{"poly":["dce9290ec3fe8834a293"]},"properties":[{"id":"p1"},{"id":"p2"}]}}}}

event: connection_close
data: {"reason":"response_complete"}
```

## 7.3 v1.1 request but BE feature flag disabled

Request:
```http
POST /api/chats/send-message-streamed?streamingEnabled=true
Accept: text/event-stream
Content-Type: application/json
```

SSE response:
- BE falls back to v1 `chat_event` only (no `message_start/message_delta/message_done`).
- FE must handle this without failure.

---

## 8) Updated Contract Types (v1.1 addenda)

These are transport event payload contracts (SSE `data` field), not stored `ChatEvent` replacements.

### 8.1 `MessageStartEvent`
```json
{
  "messageId": "string",
  "sourceMessageId": "string",
  "sequenceNumber": 0,
  "messageType": "text | markdown",
  "context": {
    "service": "buy",
    "category": "residential",
    "city": "526acdc6c33455e9e4e9",
    "filters": { "poly": ["dce9290ec3fe8834a293"] }
  }
}
```

### 8.2 `MessageDeltaEvent`
```json
{
  "messageId": "string",
  "sourceMessageId": "string",
  "sequenceNumber": 0,
  "chunkIndex": 0,
  "deltaText": "string",
  "chunkId": "string",
  "sourceMessageState": "IN_PROGRESS",
  "streamingPartState": "STREAMING"
}
```

- **`chunkId`** is **optional** (§4.4.1). When present, it identifies that **non-persisted** intermediate fragment.
- **`sourceMessageId`** / **`sourceMessageState`** — recommended for v1 alignment and tracing (§4.2.1, §4.4.2).
- **`streamingPartState`** — optional; **`STREAMING`** until the last token chunk, then **`COMPLETE`** (or use alternative naming — §4.4.2). **Last chunk** may use **`COMPLETE`**; **`message_done`** remains the persistence boundary unless otherwise agreed (§12).

### 8.3 `MessageDoneEvent`
```json
{
  "messageId": "string",
  "sourceMessageId": "string",
  "sequenceNumber": 0,
  "messageType": "text | markdown",
  "fullText": "string",
  "messageState": "COMPLETED",
  "sourceMessageState": "IN_PROGRESS | COMPLETED | ERRORED_AT_ML",
  "context": {
    "service": "buy",
    "category": "residential",
    "city": "526acdc6c33455e9e4e9",
    "filters": { "poly": ["dce9290ec3fe8834a293"] }
  }
}
```

**Persistence:** `messageId` is the sole id for the stored bot row; **`message_done` does not carry `eventId`** for that purpose.

---

## 9) Sequence Diagrams

## 9.1 Incremental happy path (v1.1-enabled FE)

```mermaid
sequenceDiagram
    participant FE as Frontend
    participant BE as Chat Backend
    participant ML as ML Provider

    FE->>BE: POST /chats/send-message-streamed?streamingEnabled=true
    BE-->>FE: SSE connection_ack
    BE->>ML: Start provider streaming call
    ML-->>BE: token chunks
    BE-->>FE: SSE message_start
    BE-->>FE: SSE message_delta (0..N)
    BE-->>FE: SSE message_done (messageState=COMPLETED, sourceMessageState=IN_PROGRESS)
    BE-->>FE: SSE chat_event (template, messageState=COMPLETED, sourceMessageState=COMPLETED)
    BE-->>FE: SSE connection_close(response_complete)
```

## 9.2 Backward-compatible fallback

```mermaid
sequenceDiagram
    participant FE as Frontend (v1.1-capable)
    participant BE as Chat Backend (flag off)

    FE->>BE: POST /chats/send-message-streamed?streamingEnabled=true
    BE-->>FE: SSE connection_ack
    BE-->>FE: SSE chat_event (full bot message)
    BE-->>FE: SSE connection_close(response_complete)
```

---

## 10) Rollout Plan

1. Ship BE support behind `ENABLE_INCREMENTAL_STREAMING`.
2. FE adds parser for new events; keep v1 `chat_event` path intact.
3. Enable incremental mode for internal users first (`streamingEnabled=true` on the request URL).
4. Monitor:
   - time to first chunk
   - stream completion rate
   - chunk reorder/drop metrics
   - cancel/error rates
5. Gradually ramp traffic.

---

## 11) Open Decisions Before Implementation

1. Should `message_done.fullText` be mandatory (recommended) or optional when BE can guarantee exact reconstruction?
2. Should `context` be emitted only in `message_done`, or both `message_start` and `message_done` (current recommendation: both)?
3. **Final row on the wire:** Single **`chat_event`** after streaming vs **`message_done` only** vs **both** (risk of duplicate content if FE mishandles — see **§12**).
4. **Enum naming:** Adopt **`streamingPartState`** vs overloading **`messageState`** on deltas (§4.4.2).

---

## 12) Design review: proposed streaming model (risks & flaws)

This section records issues to resolve **before** implementation. It does **not** reject the approach; it tightens contracts.

### 12.1 Naming collision: `messageState` on chunks vs v1 `MessageState`

Reusing **`messageState`** with values like **`INTERMEDIATE`** / **`STREAMING`** / **`COMPLETE`** for **deltas** collides with the v1 **`MessageState`** enum (**`PENDING`**, **`COMPLETED`**, **`ERRORED_AT_ML`**, …) used on **stored** **`ChatEventToUser`** and **user** rows. Risk: bugs where a delta field is written to the DB or mis-rendered.

**Mitigation:** Prefer a **dedicated** field (e.g. **`streamingPartState`**) **only** on **`message_delta`** / transport payloads, and keep v1 enums for persisted events.

### 12.2 Two “completion” signals: last delta vs `message_done` vs `chat_event`

If the **last** delta carries “stream complete” **and** **`message_done`** carries **`fullText`**, **and** a final **`chat_event`** carries the full message, implementations need strict rules:

- **Order:** Can **`chat_event`** arrive **before** **`message_done`**? After? Same tick?
- **Authority:** Which object is canonical for **`get-history`**? (Typically the **`chat_event`** / stored row.)
- **Duplicates:** FE must not show **both** buffered stream **and** full message, or **double** text.

**Mitigation:** Specify a **single** ordering (e.g. `message_done` always immediately before `chat_event` with same `messageId`, or merge into one event type for the final materialization).

### 12.3 Redundant `sourceMessageState` on every delta

Repeating **`sourceMessageState`** on each chunk is **verbose** and usually **unchanged** for the whole token stream. Acceptable for tracing; optional compression (omit on intermediate deltas, send only on `message_start` / `message_done`) could be considered.

### 12.4 Full `ChatEventFromML` on every delta

Mirroring the **entire** ML envelope on each chunk increases payload size. Consider a **minimal** delta schema plus optional **enrichment** fields for debugging.

### 12.5 Reconnect without stored chunks

If BE **does not** persist chunks, after reconnect **`get-history`** may only show the **final** row once the part is committed. In-flight streams may **lose** partial text unless FE buffers locally or BE uses ephemeral recovery (**§6.2**). This is inherent; document UX (e.g. spinner until final row appears).

### 12.6 Multi-part turns

**`sourceMessageState: IN_PROGRESS`** on a streamed markdown part correctly allows a later **template** `chat_event` with another **`messageId`**. Chunk streaming state (**`streamingPartState`**) applies **only** within one **`messageId`**, not across parts.

### 12.7 Backward compatibility

Legacy clients ignore **`message_delta`**; they still need a **full** **`chat_event`** (or v1-only path). Ensure **`streamingEnabled=false`** path always delivers complete parts without requiring v1.1 fields.

