# Chat API Contract — **Frozen v1.0**
## Rich Text Rendering Guide (Web, Android, iOS)

This document extends the **Chat API Contract v1.0** with **platform-specific implementations**
for rendering rich text fields:
- `content.text`
- `preText`
- `fallbackText`
- `followUpText`

These fields may contain **plain text, Markdown, or HTML**.

---

## 1. Rendering Strategy (All Platforms)

### Detection Rules
1. If the content **looks like HTML** → sanitize & render as HTML
2. Otherwise → treat as **Markdown**
3. Markdown renderer must gracefully handle plain text

### Security Rules
- HTML **must be sanitized**
- JavaScript execution is **never allowed**
- Allowed link schemes:
  - `https:`
  - `http:`
  - `tel:`
  - `whatsapp:`

---

## 2. Web (React / TypeScript)

### Dependencies

```bash
npm install dompurify marked
```

### Implementation

```ts
import DOMPurify from "dompurify";
import { marked } from "marked";

function looksLikeHTML(value: string): boolean {
  return /<\/?[a-z][\s\S]*>/i.test(value);
}

export function renderRichText(value: string) {
  if (!value) return null;

  if (looksLikeHTML(value)) {
    const safeHTML = DOMPurify.sanitize(value, {
      USE_PROFILES: { html: true },
      ADD_ATTR: ["target", "rel"]
    });

    return (
      <div
        className="rich-text"
        dangerouslySetInnerHTML={{ __html: safeHTML }}
      />
    );
  }

  const html = marked.parse(value, {
    breaks: true,
    mangle: false,
    headerIds: false
  });

  const safeMarkdownHTML = DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true }
  });

  return (
    <div
      className="rich-text"
      dangerouslySetInnerHTML={{ __html: safeMarkdownHTML }}
    />
  );
}
```

---

## 3. Android (Native Kotlin)

### Dependencies

```gradle
implementation "io.noties.markwon:core:4.6.2"
implementation "org.jsoup:jsoup:1.16.1"
```

### Implementation

```kotlin
import android.content.Context
import android.text.Spanned
import android.text.method.LinkMovementMethod
import android.widget.TextView
import io.noties.markwon.Markwon
import org.jsoup.Jsoup
import org.jsoup.safety.Safelist

fun looksLikeHtml(value: String): Boolean {
    return Regex("</?[a-z][\s\S]*>", RegexOption.IGNORE_CASE)
        .containsMatchIn(value)
}

fun renderRichText(
    context: Context,
    textView: TextView,
    value: String
) {
    if (value.isBlank()) {
        textView.text = ""
        return
    }

    val markwon = Markwon.create(context)

    val rendered: Spanned = if (looksLikeHtml(value)) {
        val safeHtml = Jsoup.clean(
            value,
            Safelist.basic()
                .addProtocols("a", "href", "tel", "https", "http")
        )
        markwon.toMarkdown(safeHtml)
    } else {
        markwon.toMarkdown(value)
    }

    textView.text = rendered
    textView.movementMethod = LinkMovementMethod.getInstance()
}
```

---

## 4. iOS (Native Swift)

### HTML Detection

```swift
func looksLikeHTML(_ value: String) -> Bool {
    let pattern = "</?[a-z][\s\S]*>"
    return value.range(of: pattern, options: .regularExpression) != nil
}
```

---

### Markdown Rendering (iOS 15+)

```swift
func renderMarkdown(label: UILabel, markdown: String) {
    if let attributed = try? AttributedString(
        markdown: markdown,
        options: AttributedString.MarkdownParsingOptions(
            allowsExtendedAttributes: false,
            interpretedSyntax: .full
        )
    ) {
        label.attributedText = NSAttributedString(attributed)
    } else {
        label.text = markdown
    }
}
```

---

### HTML Sanitization

```swift
func sanitizeHTML(_ html: String) -> String {
    return html
        .replacingOccurrences(
            of: "<script[\s\S]*?</script>",
            with: "",
            options: .regularExpression
        )
        .replacingOccurrences(
            of: "on\w+="[^"]*"",
            with: "",
            options: .regularExpression
        )
}
```

---

### HTML Rendering

```swift
func renderHTML(label: UILabel, html: String) {
    let sanitized = sanitizeHTML(html)

    guard let data = sanitized.data(using: .utf8) else {
        label.text = sanitized
        return
    }

    let options: [NSAttributedString.DocumentReadingOptionKey: Any] = [
        .documentType: NSAttributedString.DocumentType.html,
        .characterEncoding: String.Encoding.utf8.rawValue
    ]

    if let attributed = try? NSAttributedString(
        data: data,
        options: options,
        documentAttributes: nil
    ) {
        label.attributedText = attributed
    } else {
        label.text = sanitized
    }
}
```

---

### Unified Entry Point (iOS)

```swift
func renderRichText(label: UILabel, value: String) {
    guard !value.isEmpty else {
        label.text = ""
        return
    }

    label.isUserInteractionEnabled = true
    label.numberOfLines = 0

    if looksLikeHTML(value) {
        renderHTML(label: label, html: value)
    } else {
        renderMarkdown(label: label, markdown: value)
    }
}
```

---

## 5. Link Handling Notes

- Markdown:
  ```md
  [Call +91-98989898](tel:+9198989898)
  ```
- Works across Web, Android, iOS
- Android requires `LinkMovementMethod`
- iOS: prefer `UITextView` for automatic link handling

---

## Status

**Rich Text Rendering Guide — FINAL (Aligned with Chat API Contract v1.0) ✅**
