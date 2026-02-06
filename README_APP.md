# Chat Demo App

Next.js demo implementing the **Chat System Architecture v1.0** and **Chat API Contract v1.0** (rich text) for the real-estate chat flow (examples 4.1–4.18).

## Run

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), then **Open Chat** to go to `/chat`.

## Flow (4.1–4.18)

- **4.1** Context is injected when you first open the chat (get-conversation-id with new conversation).
- **4.2–4.3** Type **hi** → bot greeting (markdown).
- **4.4–4.5** Type **show me properties** → property carousel (2 cards: 2BHK · 80L, 3BHK · 70L) with Shortlist / Contact Seller.
- **4.6** Click **Shortlist** on a property → user action + bot **login_screen** (phone/OTP).
- **4.6 analytics** After entering phone and OTP and **Verify & Login** → analytics `logged_in` is sent; bot reply **4.7** arrives via SSE (“Shortlisted this property”).
- **4.8–4.9** Click **Contact Seller** on a property → user action + bot **seller_info** (Nadeem, Call link). **Call Now** sends analytics **4.10** (no visible bot reply).
- **4.11–4.12** Type e.g. “can you tell me where this seller lives?” → bot “Can’t help you with that…”.
- **4.13–4.14** Type **can you tell me about sector 32?** → list_selection (sector 32 gurgaon / sector 32 faridabad).
- **4.15–4.16** Type **faridabad** → list_selection (rent / buy / dont care).
- **4.17–4.18** Click a pill (e.g. **Rent**) → user action + bot **locality_info** (Sector 32 Faridabad, highlights, pros/cons, price trend).

## Stack

- **BE**: Next.js API routes (`/api/chats/*`): get-conversation-id, get-chats, get-history, send-message, cancel, **stream (SSE)**.
- **FE**: Single chat page; connects to SSE for new bot events; sends text and user_action events to send-message.
- **Mock**: In-memory event log and request state; mock “ML” in `lib/mock/ml-flow.ts` returns the next bot message(s) per contract examples.
- **Data**: Mock properties (image, price, built-up area, seller, BHK, type) and locality (image, name, city, highlights, pros/cons, price trend %) in `lib/mock/data.ts`.

## API (aligned with spec)

- `GET /api/chats/get-conversation-id` → `{ conversationId, isNew }`
- `GET /api/chats/get-history?conversationId=...` with `page` + `page_size`, or `messages_after=evt_xxx`, or `messages_before=evt_xxx` + `page_size`, or `last=N`.
- `POST /api/chats/send-message` body `{ event: ChatEvent }` → `{ eventId, requestId, expectResponse, timeoutMs }`; server appends user event, runs mock ML, appends bot event(s), broadcasts to SSE.
- `GET /api/chats/stream?conversationId=...` → SSE stream. **Event types** (see `chat_system_architecture_v1.md` §6.1):
  - **`event: chat_event`** — chat events to display: `id: <eventId>`, `data: <JSON ChatEvent>`.
  - **`event: connection_close`** — BE closing the stream; `data: {"reason":"lifecycle"}`.
  - Comments (`: connected`, `: keepalive`) — no event type; used for liveness only.

## Implementation diversions

See **Appendix A** in `chat_system_architecture_v1.md` for how this app diverges from the frozen spec: get-history params (`messages_before`, `last`) and soft-deleted CANCELLED_BY_USER events; FE 25s reply timeout and awaiting UI; SSE `connection_close` and liveness; Cancel button next to Send.
