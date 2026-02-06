# Chat API Contract — **Frozen v1.0 (Updated: Rich Text Support)**

This document defines the **final, frozen v1.0** contract for an LLM-powered real-estate chatbot.
It is intended to be committed directly into a repository and used as the single source of truth for **FE, BE, LLM, and Analytics**.

> **Update Summary**
> - `preText`, `fallbackText`, and `followUpText` are explicitly defined as **renderable rich text**.
> - These fields may contain **plain text, Markdown, or HTML**. HTML is not preferred though. try limiting to markdown
> - Schema descriptions, examples, and FE renderer pseudocode have been updated accordingly.

---

## 0. Core Principles (v1.0)

- **Only two enums**
  - `eventType`: `message | info`
  - `messageType`: `context | text | template | user_action | markdown | html | analytics`
- **Every bot message MUST have `messageId`**
- **Every user_action MUST reference the originating `messageId`**
- **Templates are FE-owned** (custom rendering is allowed and expected)
- **Templates MUST provide a `fallbackText`**
- **Analytics & context are informational, not conversational**
- **All future changes must be additive (v1.x)**

---

## 1. JSON Schema (Draft 7)

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "ChatEvent",
  "type": "object",
  "required": ["eventType", "sender", "payload"],
  "properties": {
    "conversationId": { "type": "string" },

    "eventType": {
      "type": "string",
      "enum": ["message", "info"]
    },
    "loginAuthToken": {
      "type": "string"
    },
    "sender": {
      "type": "object",
      "required": ["type"],
      "properties": {
        "type": { "type": "string", "enum": ["user", "bot", "system"] },
        "id": { "type": "string" }
      }
    },

    "payload": {
      "type": "object",
      "required": ["messageType", "content"],
      "properties": {
        "messageId": {
          "type": "string",
          "description": "Required when sender.type = bot"
        },

        "messageType": {
          "type": "string",
          "enum": [
            "context",
            "text",
            "template",
            "user_action",
            "markdown",
            "html",
            "analytics"
          ]
        },

        "visibility": {
          "type": "string",
          "enum": ["shown", "hidden"],
          "description": "Only applicable when eventType = info"
        },

        "content": {
          "type": "object",
          "properties": {
            "text": {
              "type": "string",
              "description": "Plain text or Markdown/HTML depending on messageType"
            },
            "templateId": { "type": "string" },
            "data": { "type": "object" },

            "preText": {
              "type": "string",
              "description": "Renderable rich text (plain text | Markdown | HTML)"
            },
            "fallbackText": {
              "type": "string",
              "description": "Renderable rich text used when template is unsupported"
            },
            "followUpText": {
              "type": "string",
              "description": "Renderable rich text shown after main content"
            },

            "derivedLabel": {
              "type": "string",
              "description": "User-visible text for a user_action"
            }
          },
          "additionalProperties": false
        },

        "actions": {
          "type": "array",
          "items": {
            "type": "object",
            "required": ["id", "label", "replyType", "scope"],
            "properties": {
              "id": { "type": "string" },
              "label": { "type": "string" },
              "replyType": {
                "type": "string",
                "enum": ["visible", "hidden"]
              },
              "scope": {
                "type": "string",
                "enum": ["message", "template_item"]
              }
            }
          }
        }
      }
    },

    "metadata": { "type": "object" }
  },

  "allOf": [
    {
      "if": {
        "properties": {
          "sender": { "properties": { "type": { "const": "bot" } } }
        }
      },
      "then": {
        "properties": {
          "payload": { "required": ["messageId"] }
        }
      }
    },
    {
      "if": {
        "properties": {
          "payload": {
            "properties": { "messageType": { "const": "user_action" } }
          }
        }
      },
      "then": {
        "properties": {
          "payload": {
            "properties": {
              "content": {
                "required": ["data", "derivedLabel"],
                "properties": {
                  "data": { "required": ["messageId"] }
                }
              }
            }
          }
        }
      }
    }
  ]
}
```

---

## 2. Allowed `messageType` by Sender

| messageType | user | bot | system |
|------------|------|-----|--------|
| context | ❌ | ❌ | ✅ |
| text | ✅ | ✅ | ❌ |
| markdown | ❌ | ✅ | ❌ |
| html | ❌ | ✅ | ❌ |
| template | ❌ | ✅ | ❌ |
| user_action | ✅ | ❌ | ❌ |
| analytics | ❌ | ⚠️ | ✅ |

---

## 3. FE Rendering Rules (Decision Table)

| Condition | FE Behavior |
|---------|-------------|
| info + analytics | Never render |
| info + visibility != shown | Do not render |
| context | Do not render |
| template supported | Render template |
| template unsupported | Render fallbackText (rich text) |
| markdown/html | Safe render |
| user_action | Render derivedLabel |
| action scope = template_item | Render per item |
| action scope = message | Render once |
| replyType = hidden | No echo, no LLM |

---

## 4. Examples

### 4.1 Context on Chat Open (SRP)

```json
{
  "eventType": "info",
  "sender": { "type": "system" },
  "payload": {
    "messageType": "context",
    "content": {
      "data": {
        "page": "SRP",
        "service": "buy",
        "category": "residential",
        "city": "526acdc6c33455e9e4e9",
        "filters": {
          "apartment_type_id": [1, 2],
          "contact_person_id": [1, 2],
          "facing": ["east", "west"],
          "has_lift": true,
          "is_gated_community": true,
          "is_verified": true,
          "max_area": 4000,
          "max_poss": 0,
          "max_price": 4800000,
          "radius": 3000,
          "routing_range": 10,
          "routing_range_type": "time",
          "min_price": 100,
          "property_type_id": [1, 2],
          "type": "project",
          "poly": ["dce9290ec3fe8834a293"],
          "est": 194298,
          "region_entity_id": 31817,
          "region_entity_type": "project",
          "uuid": []
        }
      }
    }
  }
}
```

---

### 4.2 User Text

```json
{
  "eventType": "message",
  "sender": { "type": "user" },
  "payload": {
    "messageType": "text",
    "content": { "text": "hi" }
  }
}
```

---

### 4.3 Bot Greeting

```json
{
  "eventType": "message",
  "conversationId": "conv_1",
  "sender": { "type": "bot" },
  "payload": {
    "messageId": "msg_001",
    "messageType": "markdown",
    "content": {
      "text": "Hey! I see you’re looking for **residential properties** to **buy**. How can I help?"
    }
  }
}
```
---

### 4.4 User Text

```json
{
  "eventType": "message",
  "sender": { "type": "user" },
  "payload": {
    "messageType": "text",
    "content": { "text": "show me properties" }
  }
}
```
---

### 4.5 Property Carousel

```json
{
  "eventType": "message",
  "sender": { "type": "bot" },
  "payload": {
    "messageId": "msg_002",
    "messageType": "template",
    "content": {
      "preText": "### Properties you may like",
      "templateId": "property_carousel",
      "data": {
        "properties": [
          { "id": "p1", "title": "2BHK · 80L" },
          { "id": "p2", "title": "3BHK · 70L" }
        ]
      },
      // doubt, should preText, followUpText be rendered if template is not yet handled on UI, and fallback is being rendered?
      "fallbackText": "**P1**: 2bhk indepedent House @ 80L  **P2**: 3bhk indepdent floor @ 70L",
      "followUpText": "<i>Tap a card to take action</i>"
    },
    "actions": [ // might not be required on-platform, wherever we are using templates. we can work with actions hardcoded in templates, and use analytics to send info to ML. but required for off platform things
      { "id": "shortlist", "label": "Shortlist", "replyType": "visible", "scope": "template_item" },
      { "id": "contact", "label": "Contact Seller", "replyType": "visible", "scope": "template_item" }
    ]
  }
}
```

---

### 4.6 User Action (shortlisted) [clicked on ml provided action]

```json
{
  "eventType": "info",
  "sender": { "type": "user" },
  "payload": {
    "messageType": "user_action",
    "content": {
      "data": {
        "actionId": "shortlist",
        "propertyId": "p2",
        "messageId": "msg_002"
      },
      "derivedLabel": "Shortlist P2: 2BHK · 90L"
    }
  }
}
```

---

### 4.6 Bot reply

```json
{
  "eventType": "message",
  "conversationId": "conv_1",
  "sender": { "type": "bot" },
  "payload": {
    "messageId": "msg_003",
    "messageType": "template",
    "content": {
      "preText": "You need to login first.",
      "templateId": "login_screen", // shows phone number/whatsapp/truecaller login
      "data": {},
      "fallbackText": "Please enter your phone number, so that I can sent otp for login"
    }
  }
}
```

--- 

### 4.6 Analytics (User logged in using phone & otp => using FE hardcoded actions)

```json
{
  "eventType": "info",
  "loginAuthToken": "", // should be here??
  "sender": { "type": "system" },
  "payload": {
    "messageType": "analytics",
    "content": {
      "data": {
        "category": "login",
        "action": "logged_in",
        "label": "logged in using phone"
      }
    }
  }
}
```
---

### 4.7 Bot Reply (shortlisted)

```json
{
  "eventType": "message",
  "conversationId": "conv_1",
  "sender": { "type": "bot" },
  "payload": {
    "messageId": "msg_004",
    "messageType": "text",
    "content": {
      "text": "Shortlisted this property"
    }
  }
}
```
---

### 4.8 User Action (contact P1's seller) [clicked on ml provided action]

```json
{
  "eventType": "info",
  "loginAuthToken": "", // should be here??
  "sender": { "type": "user" },
  "payload": {
    "messageType": "user_action",
    "content": {
      "data": {
        // or do we just want text here: "Contact #p1" => this could work for both free text user reply and cta click
        "actionId": "contact",
        "propertyId": "p1", 
        "messageId": "msg_002"
      },
      "derivedLabel": "Contact P1: 2BHK · 90L"
    }
  }
}
```

---

### 4.9 Bot replies

```json
{
  "eventType": "message",
  "sender": { "type": "bot" },
  "payload": {
    "messageId": "msg_005",
    "messageType": "template",
    "content": {
      "preText": "### Here are contact details of **Nadeem**",
      "templateId": "seller_info",
      "data": {
        "id": "s1",
        "name": "Nadeem",
        "image": "https://images.housing.com/s1.jpg"
      },
      // doubt, should preText, followUpText be rendered if template is not yet handled on UI, and fallback is being rendered?
      "fallbackText": "**### Here are contact details of **Nadeem**.  📞 [Call +91-98989898](tel:+9198989898)"
    },
    "actions": [ // might not be required on-platform, wherever we are using templates. we can work with actions hardcoded in templates, and use analytics to send info to ML. but required for off platform things
      { "id": "call_now", "label": "Call Now", "replyType": "hidden", "scope": "message" }
    ]
  }
}
```
---

### 4.10 Analytics (User logged in using phone & otp => using FE hardcoded actions)

```json
{
  "eventType": "info",
  "loginAuthToken": "", // should be here??
  "sender": { "type": "system" },
  "payload": {
    "messageType": "analytics",
    "content": {
      "data": {
        "category": "crf_submit",
        "action": "called",
        "label": "called using phone"
      }
    }
  }
}
```
---


### 4.11 User Text (random query)

```json
{
  "eventType": "message",
  "sender": { "type": "user" },
  "payload": {
    "messageType": "text",
    "content": { "text": "can you tell me where this seller lives?" }
  }
}
```
---

### 4.12 Bot reply 

```json
{
  "eventType": "message",
  "conversationId": "conv_1",
  "sender": { "type": "bot" },
  "payload": {
    "messageId": "msg_006",
    "messageType": "text",
    "content": {
      "text": "Cant help you with that, do you need anything else?"
    }
  }
}
```
---


### 4.13 User Text (new pivot)

```json
{
  "eventType": "message",
  "sender": { "type": "user" },
  "payload": {
    "messageType": "text",
    "content": { "text": "can you tell me about sector 32?" }
  }
}
```
---

### 4.14 Bot replies

```json
{
  "eventType": "message",
  "sender": { "type": "bot" },
  "payload": {
    "messageId": "msg_007",
    "messageType": "template",
    "content": {
      "preText": "### Which sector 32 are you referring to?",
      "templateId": "list_selection",
      "data": {
        "properties": [
          { "id": "uuid1", "title": "sector 32 gurgaon" },
          { "id": "uuid2", "title": "sector 32 faridabad" }
        ]
      },
      // doubt, should preText, followUpText be rendered if template is not yet handled on UI, and fallback is being rendered?
      "fallbackText": "**Which sector 32 are you referring to?**: sector 32 gurgaon or sector 32 faridabad",
      "followUpText": "<i>Select a card to take action</i>"
    },
    "actions": [     ]
  }
}
```
---
### 4.15 User Text (user types instead of selection)

```json
{
  "eventType": "message",
  "sender": { "type": "user" },
  "payload": {
    "messageType": "text",
    "content": { "text": "faridabad" }
  }
}
```
---
### 4.16 Bot reply 


```json
{
  "eventType": "message",
  "sender": { "type": "bot" },
  "payload": {
    "messageId": "msg_007",
    "messageType": "template",
    "content": {
      "preText": "### Are you looking for rent or buy? or dont care, and what a generic info about locality?",
      "templateId": "list_selection",
      "data": {
        "properties": [
          { "id": "rent_id", "title": "rent" },
          { "id": "buy_id", "title": "buy" },
          { "id": "dont_care", "title": "dont care" }
        ]
      },
      // doubt, should preText, followUpText be rendered if template is not yet handled on UI, and fallback is being rendered?
      "fallbackText": "**are you looking for rent or buy? or dont care, and what a generic info about locality?",
      "followUpText": "<i>Select a card to take action</i>"
    },
    "actions": [     ]
  }
}
```
---
### 4.17 User Action (Selects a pill)

```json
{
  "eventType": "info",
  "loginAuthToken": "", // should be here??
  "sender": { "type": "user" },
  "payload": {
    "messageType": "user_action",
    "content": {
      "data": {
        // or do we just want text here: "Contact #p1" => this could work for both free text user reply and cta click
        // actionId will not be present here
        "selectedId": "rent_id", 
        "messageId": "msg_007"
      },
      "derivedLabel": "Rent"
    }
  }
}
```
---
### 4.18 Bot replies

```json
{
  "eventType": "message",
  "sender": { "type": "bot" },
  "payload": {
    "messageId": "msg_009",
    "messageType": "template",
    "content": {
      "preText": "### Here's all you need to know about sector 32 faridabad",
      "templateId": "locality_info",
      "data": {
        "id": "l1",
        "name": "Sector 32",
        "image": "https://images.housing.com/l1.jpg",
        "description": "sector 32 is a bustling localtiy in faridabad with a population of 25K.",
        "highlights": ["highlight 1", "highlight 2"],
        "pros": ["pro1", "pro2"],
        "cons": ["con1"]
      },
      // doubt, should preText, followUpText be rendered if template is not yet handled on UI, and fallback is being rendered?
      "fallbackText": "**### Here's all you need to know about sector 32 faridabad.  sector 32 is a bustling localtiy in faridabad with a population of 25K. Few highlights: highlight 1, highlight 2. It has pro1, pro 2. but lacks: con1, con2"
    },
    "actions": [ // might not be required on-platform, wherever we are using templates. we can work with actions hardcoded in templates, and use analytics to send info to ML. but required for off platform things
      { "id": "show_reviews", "label": "Show review", "replyType": "visible", "scope": "message" }
    ]
  }
}
```
---


---
## 5. FE Renderer Pseudocode

```ts
function renderRichText(value: string) {
  // Detect and safely render plain text / markdown / HTML
}

function renderEvent(event) {
  const { eventType, payload } = event;

  if (eventType === "info") {
    if (payload.messageType === "analytics") return;
    if (payload.visibility !== "shown") return;
  }

  if (payload.messageType === "context") return;

  // should this be rendered if template is not supported?
  if (payload.content?.preText) renderRichText(payload.content.preText);

  switch (payload.messageType) {
    case "text":
      renderText(payload.content.text);
      break;

    case "markdown":
      renderMarkdown(payload.content.text);
      break;

    case "html":
      renderHTMLSafely(payload.content.text);
      break;

    case "template":
      if (isTemplateSupported(payload.content.templateId)) {
        renderTemplate(
          payload.content.templateId,
          payload.content.data,
          payload.actions?.filter(a => a.scope === "template_item")
        );
      } else {
        renderRichText(payload.content.fallbackText || "");
      }
      break;

    case "user_action":
      renderUserBubble(payload.content.derivedLabel);
      break;
  }

  const footerActions = payload.actions?.filter(a => a.scope === "message") || [];
  if (footerActions.length) renderActions(footerActions);

  if (payload.content?.followUpText) renderRichText(payload.content.followUpText);
}
```

---

## Status

**Chat API Contract v1.0 — FROZEN (Rich Text Clarified) ✅**