# Chat API Contract — Frozen v1.0 (Phase 1)
## Rich Text Rendering Guide (Markdown Only)

This guide documents **Phase 1 rendering** for chat rich text in this repository.

## 1) Scope (Phase 1)

Only these payload fields are used for rich text rendering:

- `payload.content.text` for `messageType: "text"` and `messageType: "markdown"`

The following are **not used in Phase 1** and should be ignored in renderers:

- `preText`
- `fallbackText`
- `followUpText`

HTML rendering support is dropped for Phase 1; treat content as markdown/plain text only.

---

## 2) Web/FE Current Strategy

### Message-type handling

- `context` and `analytics`: never rendered.
- `text`:
  - user sender -> user bubble with plain text.
  - bot/system sender -> bot-side text block.
- `markdown`:
  - bot/system sender -> rendered through markdown renderer (`RichText` component).
- `user_action`:
  - render only when `visibility === "shown"` and `derivedLabel` exists.
  - sender `system`/`bot` -> bot-side text style.
  - sender `user` -> user bubble.
- `template`:
  - template components render FE-owned UI (carousel, nested_qna, location, brochure, etc.).
  - some transient templates render only for latest message.

### Markdown-only rendering behavior

- Input is treated as markdown (plain text is valid markdown and renders naturally).
- No HTML detection branch.
- No HTML sanitization branch in Phase 1 rendering guide.

---

## 3) Current Web Implementation Notes

### Feedback row integration

For final bot/system messages, FE may render a `FeedbackRow` (thumbs up/down + optional copy), based on message/template eligibility.

### Copy content source

- text/markdown: copy `content.text`
- property carousel: computed summary lines from property data
- locality carousel: computed locality summary lines
- download brochure: project/price/url summary string

### Sticky nested-qna behavior

- While latest message is `templateId: "nested_qna"`, the main composer is hidden.
- User completes nested selection flow in template UI.

---

## 4) Minimal Web Pseudocode

```ts
function renderEvent(event: ChatEvent) {
  const { sender, payload } = event;

  if (payload.messageType === "context" || payload.messageType === "analytics") return null;

  if (payload.messageType === "user_action") {
    if (payload.visibility !== "shown" || !payload.content.derivedLabel) return null;
    return sender.type === "user"
      ? renderUserBubble(payload.content.derivedLabel)
      : renderBotText(payload.content.derivedLabel);
  }

  if (sender.type === "user" && payload.messageType === "text") {
    return renderUserBubble(payload.content.text ?? "");
  }

  if (payload.messageType === "text") {
    return renderBotText(payload.content.text ?? "");
  }

  if (payload.messageType === "markdown") {
    return renderMarkdown(payload.content.text ?? "");
  }

  if (payload.messageType === "template") {
    return renderTemplate(payload.content.templateId, payload.content.data);
  }

  return null;
}
```

---

## Status

**Phase 1 Rich Text Guide — Markdown-only ✅**
