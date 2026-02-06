# Chat System Architecture & API Specification  
## **Frozen v1.0**

This document is the **canonical, frozen v1.0 specification** for the Chat system, covering:
- API contracts
- Request lifecycle & state machine
- ML ↔ BE envelopes
- SSE framing & connection rules
- Backend database schemas
- System invariants

This file is intended to be **downloaded, versioned, and committed** as a single source of truth.

---

## 1. Formal Request State Machine

### Lifecycle Diagram (Request-Centric)

```
REQUEST_CREATED
      |
      v
   PENDING
      |
      |-------------------------------|
      |               |               |
      v               v               v
 COMPLETED     ERRORED_AT_ML   TIMED_OUT_BY_BE
                                       |
                                       v
                             (cancel signal to ML)

      |
      v
CANCELLED_BY_USER
(soft delete user event)
```

---

## 2. State Semantics

| State | Meaning |
|------|--------|
| PENDING | Awaiting ML response |
| COMPLETED | ML response processed successfully |
| ERRORED_AT_ML | ML returned explicit error |
| TIMED_OUT_BY_BE | No ML response within BE timeout (120s) |
| CANCELLED_BY_USER | User cancelled request |

---

## 3. Hard Invariants (Request Handling)

- Only **PENDING** requests may accept ML responses
- All other ML responses are **discarded and alerted**
- Cancellation is **advisory** to ML
- Requests never transition out of terminal states
- User request event is soft-deleted only for `CANCELLED_BY_USER`

---

## 4. API Contracts

### 4.1 `GET /chats/get-conversation-id`

Returns the active conversation ID (single chat in Phase 1).

**Response**
```json
{
  "conversationId": "conv_1",
  "isNew": false
}
```

---

### 4.2 `GET /chats/get-chats`

Returns all chats for the user.

```json
{
  "chats": [
    {
      "conversationId": "conv_1",
      "createdAt": "2026-02-06T09:00:00Z",
      "lastActivityAt": "2026-02-06T10:05:00Z"
    }
  ]
}
```

---

### 4.3 `GET /chats/get-history`

**Pagination**
```
/chats/get-history?conversationId=conv_1&page=0&page_size=3
```

**Response**
```json
{
  "conversationId": "conv_1",
  "messages": [
    {
      "eventId": "evt_201",
      "eventType": "message",
      "sender": { "type": "bot", "id": "re_bot" },
      "payload": { ... },
      "createdAt": "2026-02-06T10:00:01Z"
    }
  ],
  "hasMore": true
}
```

**After Event**
```
/chats/get-history?conversationId=conv_1&messages_after=evt_401
```

**Response**
```json
{
  "conversationId": "conv_1",
  "messages": [ { "eventId": "evt_401", "payload": {} } ]
}
```

---

### 4.4 `POST /chats/send-message`

```json
{
  "event": {
    "eventType": "message",
    "sender": { "type": "user" },
    "payload": {
      "messageType": "text",
      "content": { "text": "show me properties" }
    }
  }
}
```

**Response**
```json
{
  "eventId": "evt_301",
  "requestId": "req_901",
  "expectResponse": true,
  "timeoutMs": 15000
}
```

---

### 4.5 `POST /chats/cancel`

```json
{ "requestId": "req_901" }
```

---

### 4.6 `GET /chats/stream` (SSE)

```
GET /chats/stream?conversationId=conv_1
Accept: text/event-stream
```

**Chat event format** (see §6.1 for all event types)
```txt
id: evt_401
event: chat_event
data: {JSON_CHAT_EVENT}
```

Other event types and comment lines are defined in **§6.1 SSE event types**.

---

## 5. ML ↔ BE Envelopes

### 5.1 ML Input (BE → ML)

```json
{
  "requestId": "req_123",
  "conversationId": "conv_1",
  "userEventId": "evt_456",
  "event": { "...": "ChatEvent" },
  "expectResponse": true,
  "ttlMs": 120000
}
```

---

### 5.2 ML Success Output

```json
{
  "requestId": "req_123",
  "respondingToEventId": "evt_456",
  "status": "success",
  "event": { "...": "Bot ChatEvent" }
}
```

---

### 5.3 ML Error Output

```json
{
  "requestId": "req_123",
  "respondingToEventId": "evt_456",
  "status": "error",
  "error": {
    "code": "500",
    "message": "Cannot process request"
  }
}
```

---

### 5.4 Cancel Signal (BE → ML)

```json
{
  "type": "cancel_request",
  "requestId": "req_123",
  "reason": "TIMED_OUT_BY_BE"
}
```

---

## 6. SSE Rules

- SSE is **BE → FE only**
- `id` always equals `eventId` for chat events
- Ordering strictly by creation time
- Analytics & context events are **never sent**
- FE uses history APIs for replay

### 6.1 SSE event types

The stream uses the following **event** values and comment lines:

| Event / line | When | Format | FE handling |
|--------------|------|--------|-------------|
| **`event: chat_event`** | Bot (or visible info) event to display | `id: <eventId>\nevent: chat_event\ndata: <JSON ChatEvent>\n\n` | Parse `data` as `ChatEvent`; append to messages; `id` equals `eventId`. |
| **`event: connection_close`** | BE closing the stream (lifecycle: idle or max activity) | `event: connection_close\ndata: {"reason":"lifecycle"}\n\n` | Treat connection as closed; set error state; reconnect if awaiting ML or on-demand. |
| **Comment** (no event) | On open | `: connected\n\n` | Keeps connection alive; client detects stream open. |
| **Comment** (no event) | Keepalive while pending ML | `: keepalive\n\n` | Not delivered to EventSource listeners; used to refresh activity so BE does not close at 60s. |

**Chat events (`event: chat_event`)**  
- Only events that should be shown in the chat (e.g. bot messages, visible info) are sent with `event: chat_event`.
- Each line: `id: <eventId>\nevent: chat_event\ndata: <JSON ChatEvent>\n\n`.
- `data` is a single JSON object: the full `ChatEvent` (including `eventId`, `eventType`, `sender`, `payload`, `createdAt`, etc.).

**Other event values**  
- **`connection_close`**: Sent by the BE once, immediately before closing the stream when closing due to lifecycle (no activity > 15s and no pending ML, or no activity > 60s). Not sent when the client aborts. FE should treat the connection as closed and update UI (e.g. error state, reconnect as per §7).

**Comments** (lines starting with `:`) do not set an `event` type and are not delivered to `EventSource` message listeners; they are used for connection liveness and keepalive only.

---

## 7. Connection Lifecycle Rules

### BE
- Close SSE if:
  - No activity > 15s AND no pending ML
  - No activity > 60s overall

### FE
- Close SSE if no activity > 60s
- Reconnect:
  - Immediately if awaiting ML
  - On-demand otherwise

---

## 8. Backend Database Schemas

### 8.1 `conversations`

```sql
conversation_id VARCHAR PK
user_id VARCHAR
ga_id VARCHAR
created_at TIMESTAMP
updated_at TIMESTAMP
```

---

### 8.2 `chat_events` (Immutable)

```sql
event_id VARCHAR PK
conversation_id VARCHAR
sender_type ENUM('user','bot','system')
event_type ENUM('message','info')
message_type VARCHAR
payload JSONB
source ENUM('FE','ML','SYSTEM')
visibility ENUM('active','soft_deleted')
created_at TIMESTAMP
```

---

### 8.3 `chat_requests` (Mutable)

```sql
request_id VARCHAR PK
conversation_id VARCHAR
user_event_id VARCHAR
state ENUM(
  'PENDING',
  'COMPLETED',
  'ERRORED_AT_ML',
  'TIMED_OUT_BY_BE',
  'CANCELLED_BY_USER'
)
retry_of_request_id VARCHAR
created_at TIMESTAMP
updated_at TIMESTAMP
```

---

## 9. System Invariants (Non-Negotiable)

1. One user message → one request
2. Only PENDING requests accept ML output
3. Event log is append-only
4. Request table is mutable
5. FE never talks to ML
6. ML never talks to FE
7. BE is the single source of truth
8. Late ML responses are discarded and logged

---

## 10. Sequence Diagrams (Non-Negotiable)

### 10.1 User Message → ML → FE (Happy Path)

![Sequence Diagram](./sd1.png)
```
sequenceDiagram
    participant FE as Web FE
    participant BE as Chat BE
    participant ML as ML Engine

    FE->>BE: POST /chats/send-message
    BE->>BE: persist user event (PENDING)
    BE->>ML: enqueue request (Kafka)
    BE-->>FE: 202 Accepted (requestId)

    ML->>BE: success response
    BE->>BE: create bot event, mark request COMPLETED
    BE-->>FE: SSE chat_event
```
---

### 10.2 Timeout at BE (No ML Response)
![Sequence Diagram](./sd2.png)
```
sequenceDiagram
    participant FE
    participant BE
    participant ML

    FE->>BE: send-message
    BE->>ML: enqueue request

    Note over BE: 120s timeout reached
    BE->>BE: mark TIMED_OUT_BY_BE
    BE->>ML: cancel_request (advisory)
    BE-->>FE: SSE timeout message

```
---

### 10.3 Cancel by User
![Sequence Diagram](./sd3.png)
```
sequenceDiagram
    participant FE
    participant BE
    participant ML

    FE->>BE: send-message
    BE->>ML: enqueue request

    FE->>BE: cancel(requestId)
    BE->>BE: mark CANCELLED_BY_USER
    BE->>ML: cancel_request

    ML->>BE: late response
    BE->>BE: discard + alert

```

---

### 10.4 SSE Reconnect Flow
![Sequence Diagram](./sd4.png)
```
sequenceDiagram
    participant FE
    participant BE

    FE->>BE: GET /chats/stream
    BE-->>FE: SSE events

    Note over FE: connection drops

    FE->>BE: GET /chats/get-history?messages_after=evt_401
    BE-->>FE: missed messages

    FE->>BE: GET /chats/stream (resume)

```

---

## Appendix A: Implementation diversions (this app)

This section records how the **chat-demo** implementation diverges from or extends the frozen spec above. The spec remains canonical; these notes describe actual behaviour in this codebase.

### A.1 get-history

- **Pagination**: In addition to `page`, `page_size`, and `messages_after`, the implementation supports:
  - **`messages_before`** + **`page_size`**: returns up to `page_size` messages *before* the given event ID (for “Load older messages”).
  - **`last`**: returns the last N messages (e.g. initial load with `last=6`).
- **Soft-deleted events**: Events that are the user request event for a request in state **CANCELLED_BY_USER** are excluded from history (soft-deleted per §3). No other event types are filtered.

### A.2 FE reply timeout and UI

- **FE timeout**: The FE uses a 25s reply timeout (spec does not define FE timeout). After 25s without a bot reply, the FE shows “Request timed out” with **Retry** and **Dismiss**.
- **Awaiting phases**: While awaiting, the FE shows phased messages: 0–5s “thinking”, 5–10s “Still Thinking”, 10–15s “Analysing”, 15–25s “It’s taking longer than usual, but I’m trying.”
- **Input and CTAs disabled**: While `replyStatus === "awaiting"`, the text input and template CTAs (e.g. Shortlist, Contact Seller, list pills) are disabled; only **Cancel** (in the form) and **Retry** / **Dismiss** (after timeout/error) are allowed.

### A.3 SSE

- **connection_close**: The BE sends `event: connection_close` with `data: {"reason":"lifecycle"}` immediately before closing the stream when closing due to lifecycle rules (§7). Not sent when the client aborts.
- **Liveness**: The FE does not rely on application-level keepalive events; it uses `EventSource.readyState` (e.g. periodic check for `CLOSED`) and the native `error` event to detect a closed connection.

### A.4 Cancel

- **Cancel button**: A **Cancel** button is shown next to **Send** while awaiting a reply. It calls `POST /chats/cancel` with the current `requestId` and then clears the awaiting state so the user can send again.

---