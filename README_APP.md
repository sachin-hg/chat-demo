# Chat Demo App

Next.js demo implementing the **Chat System Architecture v1.0** and **Chat API Contract v1.0** (rich text), with a richer mock flow covering property discovery, locality QnA, location permission, and brochure download.

## Run

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), then **Open Chat** to go to `/chat`.

### Mock ML delays (optional)

Set `ENABLE_MOCK_ML_DELAYS=true` (or `1`) when starting the dev server to slow the mock ML stream:

- **~6s** after `connection_ack` before the first bot `chat_event` (see `MOCK_ML_INITIAL_DELAYS_MS` in `app/api/chats/send-message-streamed/route.ts`).
- **5s** between each subsequent `chat_event` in the same turn (`MOCK_ML_PER_CHAT_EVENT_MS`).

When unset, the first bot chunk is delayed **100ms** and all `chat_event` lines are sent back-to-back.

Canonical write-up: **`chat_v1.md` Appendix A §A.3.1**.

### Mock SSE abrupt disconnect (optional)

Use these **server** env vars when starting `npm run dev` to simulate the stream ending without a `connection_close` event (e.g. proxy/network failure). The mock still **persists** the first bot message; the client detects the incomplete stream and **refetches `GET /api/chats/get-history`** to reconcile the UI.

| Variable | Effect |
|----------|--------|
| `ENABLE_MOCK_SSE_RANDOM_DROP=true` or `1` | After the first persisted bot part, always close the SSE stream without sending `chat_event` / `connection_close`. |
| `MOCK_SSE_RANDOM_DROP_PROBABILITY` | e.g. `0.3` → 30% chance of the same behavior each request (use `0`–`1`; values `≥ 1` behave like always-on). Ignored when `ENABLE_MOCK_SSE_RANDOM_DROP` is set. |

### Demo Mode

Use `/chat?demo=true` to run an auto-played scripted demo.

- One step at a time with 2s spacing.
- Mix of user text and real UI clicks (heart/contact/learn more/locality actions/nested-qna/brochure).
- Handles auth popup auto-fill (phone + OTP) when login is required.
- Pauses on location-permission steps and resumes after user interaction (deny/allow).
- Emits `[demo] ...` logs in browser console for traceability.

## Current Flow Coverage

- **Context on open**: each chat-open sends a hidden `context` event (fire-and-forget).
- **Greeting and non-real-estate intent**:
  - `hi`/`hello`/`hey` (word-level match) → greeting markdown.
  - `tell me about modiji`/generic off-domain prompts → fallback response.
- **Property discovery**:
  - `show me properties` / `show me properties according to my preference` → intro text + `property_carousel`.
  - Carousel cards support shortlist, contact, and learn-more actions.
  - `property_carousel` payload also includes `property_count`, `service`, `category`, `city`, `filters` to support SRP deep-linking from FE.
- **Shortlist/contact/brochure**:
  - Shortlist and contact actions are primarily FE-driven (with hidden/shown `user_action` events).
  - Text fallback `shortlist this property` returns `shortlist_property`.
  - Text `contact seller ...` returns `contact_seller`.
  - `show me brochure` returns `download_brochure`; brochure click sends hidden `brochure_downloaded`.
- **Locality and nested QnA**:
  - `locality comparison` → `locality_carousel` (except explicit `sector 32/21` ambiguity).
  - Locality carousel items include sample `url`; locality name opens it in a new tab.
  - `sector 32 + sector 21` (or explicit ambiguity) → `nested_qna`.
  - `learn more about sector 32` (without sector 21) → single-question `nested_qna`.
  - `nested_qna_selection` returns locality learn-more markdown in mock flow.
- **Locality analytics/info requests**:
  - `price trend`, `rating reviews`, `transaction data` return markdown report templates.
- **Near-me flow**:
  - `near me`/`3bhk properties near me` → always `share_location` from ML.
  - `ShareLocation` (`components/chat/templates/ShareLocation.tsx`):
    - Auto: if Permissions API says **`granted`**, calls `getCurrentPosition` (non-zero **`maximumAge`**, module-level coordinate cache) → **`location_shared`** or **`location_not_available`**.
    - Button: same resolution; no Geolocation API or failed fix → **`location_not_available`** (same payload shape as deny).
  - **`location_shared`** — coordinates present; **`location_not_available`** — no fix / API error / timeout; **`location_denied`** — explicit user deny (reserved for that UI path). Mock ML treats **`location_denied`** and **`location_not_available`** with the same fallback reply (see `chat_v1.md` §4.3.10.33, §4.3.11, §4.3.10.39a).

## Stack (Phase 1)

- **BE/ML**: Co-located in the same service (method calls; **no Kafka** in Phase 1).
- **BE**: Next.js API routes (`/api/chats/*`): get-conversation-id, get-chats, get-history, **send-message (JSON)**, **send-message-streamed (SSE)**, cancel.
- **FE**:
  - uses `send-message-streamed` for `responseRequired=true` turns
  - uses `send-message` for `responseRequired=false` fire-and-forget turns
  - **Ack-only `user_action`** (`responseRequired=false`, e.g. shortlist/contact after property API success) is **not blocked** by an in-flight streamed user turn: it appends its own optimistic row and calls `send-message` without stealing the stream’s pending/abort refs or flipping the global `sending` flag for that path.
  - keeps request-scoped streams (no long-lived SSE subscription)
- **Mock**: In-memory event log and request state; mock “ML” in `lib/mock/ml-flow.ts` returns the next bot message(s) per contract examples.
- **Data**: Mock properties/localities and derived markdown data in `lib/mock/data.ts`.

## API (aligned with spec)

- `ChatEvent` is a **flat object** (no nested `payload` wrapper): top-level fields include `messageType`, `content`, `responseRequired`, `isVisible`, `sourceMessageId`, and `sequenceNumber`.
- **ML multi-part replies:** each bot **part** has its own `messageId`; **`sourceMessageState`** on ML → BE / bot rows is ML’s progress on the **user turn** (`sourceMessageId`), not the part row’s lifecycle. See **`chat_v1.md` Appendix A §A.0** and **`getTurnOrMessageState()`** in `lib/contract-types.ts`.
- In FE-facing events, `sourceMessageId` is optional and typically not required for rendering.
- `GET /api/chats/get-conversation-id` → `{ conversationId, isNew }` (`isNew` is demo-app convenience; not required for production clients)
- Phase 1 identity mapping: BE keeps a stable 1:1 `conversationId` per `userId` (or per `_ga` for anonymous users), so the same user consistently gets the same conversation.
- `GET /api/chats/get-history?conversationId=...` with optional `page_size` (default 6), and optional cursor `messages_before` or `messages_after`.
- `POST /api/chats/send-message` body `{ event: ChatEventFromUser }` (JSON-only)
  - `event.conversationId` is required in payload (not query param).
  - Used for `responseRequired=false` turns.
  - Returns JSON `{ messageId, messageState }` (current app returns `messageState: "COMPLETED"`).
- `POST /api/chats/send-message-streamed` body `{ event: ChatEventFromUser }` with `Accept: text/event-stream`
  - `event.conversationId` is required in payload (not query param).
  - Used for `responseRequired=true` turns.
  - If `login_auth_token` is present, BE authenticates first and forwards derived identifiers (`userId`, `gaId`) in `ChatEventToML.sender`.
  - `ChatEventToML.sender.userId` is derived by BE from auth/identity request headers.
  - SSE events:
    - **`event: connection_ack`** — immediate ack: `data: { "messageId": "...", "messageState": "PENDING" }`
    - **`event: chat_event`** — bot events streamed as they’re produced: `id: <messageId>`, `data: <JSON ChatEvent>`
    - **`event: connection_close`** — emitted when the turn reaches a terminal outcome (e.g. bot row **`sourceMessageState`: `COMPLETED` \| `ERRORED_AT_ML`**, or surfaced `TIMED_OUT_BY_BE`) or stream inactivity reaches 15s.
- ML response handling:
  - each ML output is stored by BE as a new bot message with **`messageState: "COMPLETED"`** (per **part** row) and **`sourceMessageState`** echoing ML’s turn progress.
  - **`sourceMessageState`** from each ML event is mapped onto the **source user message** row’s **`messageState`** (see `chat_v1.md` Appendix A §A.0).
- `POST /api/migrate-chat?currentConversationId=c1` with `login_auth_token` header
  - When migration strategy is enabled, BE returns `{ newConversationId: "c2" }` and merges/moves c1-tagged history to c2 in mock DB.
  - FE switches to `c2` for all subsequent API calls; an immediate `get-history` refresh is **optional** (BE merges prior c2 + migrated c1 + new c2 on any `get-history` call with `conversationId=c2`).

## UI Notes

- **Older messages (history pagination)** (`app/chat/page.tsx`):
  - Uses `GET /api/chats/get-history` with `messages_before=<oldest visible messageId>` and `page_size` (see `LOAD_MORE_PAGE_SIZE`).
  - **Auto-load (first 4 successful prepends per conversation):** an **Intersection Observer** watches a 1px sentinel at the top of the thread (inside the scroll container, with a top `rootMargin` prefetch). Each time the user scrolls that sentinel into view, older messages load **once** (edge-triggered), until four successful prepends have run (`AUTO_LOAD_OLDER_MAX`).
  - **After 4 auto-loads:** only a **“View older messages”** button loads more (guards against accidental churn / BE abuse).
  - While a page is loading, a **spinner** is shown in that slot (no button label).
  - Auto-load budget resets when `conversationId` changes.
- **Scroll to bottom:** a floating control appears when the user scrolls away from the bottom (threshold ~100px / 20% of viewport height); the scroll listener is attached after the main chat layout mounts (not on the initial loading screen).
- Transient templates (`share_location`, `shortlist_property`, `contact_seller`, `nested_qna`) are rendered only for the latest bot message.
- Property carousel title opens `inventory_canonical_url` in a new tab.
- Property carousel shows a trailing **View all** card when `property_count > properties.length`; click opens `getSRPUrl(service, category, city, filters)` in a new tab.
- Locality carousel locality name opens locality `url` in a new tab.
- `context` and `analytics` messages are never rendered.
- Input is hidden while sticky `nested_qna` is active.
- **`NestedQna` template:** submitting the flow defers parent updates (`queueMicrotask`) so React does not update the chat page while `NestedQna` is rendering; hooks run unconditionally before any early return when `selections` is empty.
- **Awaiting reply** (`replyStatus === "awaiting"`): inline copy rotates by elapsed second (`getAwaitingFeedbackMessage` in `app/chat/page.tsx`): *Running through the details…* → *Thinking…* → *Making sure I find best answers for you.* → *This seems to be taking longer than usual…* (then stays on the last line until the turn completes or times out).
- Reply timeout is 25s with Retry/Dismiss; FE then relies on polling (`get-history` with `messages_after`) until response arrives for that message.

## Implementation divergences

See **Appendix A** in `chat_v1.md` for implementation-specific behavior. The file contains two “Appendix A” clusters (consolidated notes near the middle, and **Appendix A: Implementation Notes (chat-demo)** near the end). Highlights:

- **End-of-doc Appendix A §A.0** — `sourceMessageState` vs per-part `messageState` (`getTurnOrMessageState`).
- **Earlier Appendix A §A.2** — Staged awaiting copy (web + Android); **§A.3.1** — `ENABLE_MOCK_ML_DELAYS` / mock `send-message-streamed` pacing.
- **End-of-doc Appendix A §A.4 (Location flow)** — `ShareLocation` cache / `maximumAge`, `location_not_available`, mock ML handling.
