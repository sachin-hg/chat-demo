# Chat API Contract — **Frozen v1.0 (Updated: Rich Text Support)**

This document defines the **final, frozen v1.0** contract for an LLM-powered real-estate chatbot.
It is intended to be committed directly into a repository and used as the single source of truth for **FE, BE, LLM, and Analytics**.

> **Update Summary**
> - `preText` and `followUpText` have been **removed** from the contract.
> - `eventType` has been **removed** — it was redundant; rendering intent is fully derivable from `sender.type` + `messageType`.
> - `info` messageType added — hidden by default; rendered only when `visibility === "shown"` is explicitly set.
> - `fallbackText` and `actions` are **kept in schema and examples but deferred to Phase 2** — not implemented in Phase 1.
> - `fallbackText` may contain **plain text, Markdown, or HTML**. HTML is not preferred — limit to Markdown where possible.
> - Schema descriptions, examples, and FE renderer pseudocode have been updated accordingly.

---

## 0. Core Principles (v1.0)

- **One primary enum**: `messageType`: `context | text | template | user_action | markdown | html | analytics | info`
- **Every bot message MUST have `messageId`**
- **Every user_action MUST reference the originating `messageId`**
- **Templates are FE-owned** (custom rendering is allowed and expected)
- **Templates MUST provide a `fallbackText`** *(Phase 2 — not rendered in Phase 1)*
- **Analytics & context are informational, not conversational**
- **All future changes must be additive (v1.x)**

---

## 1. JSON Schema (Draft 7)

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "ChatEvent",
  "type": "object",
  "required": ["sender", "payload"],
  "properties": {
    "conversationId": { "type": "string" },

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
            "analytics",
            "info"
          ]
        },

        "visibility": {
          "type": "string",
          "enum": ["shown", "hidden"],
          "description": "Only meaningful for messageType = info. info messages are hidden by default; set to 'shown' to render them."
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

            // [Phase 2] fallbackText — not implemented in Phase 1
            "fallbackText": {
              "type": "string",
              "description": "[Phase 2] Renderable rich text used when template is unsupported (plain text | Markdown preferred)"
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

| messageType | user | bot | system | responseAwaited |
|------------|------|-----|--------|-----------------|
| context | ❌ | ❌ | ✅ | no |
| text | ✅ | ✅ | ❌ | yes for ``user`` messages |
| markdown | ❌ | ✅ | ❌ | NA |
| html | ❌ | ✅ | ❌ | NA |
| template | ❌ | ✅ | ❌ | NA |
| user_action | ✅ | ❌ | ✅ | ML instructs using responseAwaited flag. default ``false`` |
| analytics | ❌ | ⚠️ | ✅ | no |
| info | ❌ | ✅ | ✅ | no |

---

## 3. FE Rendering Rules (Decision Table)

| Condition | FE Behavior |
|---------|-------------|
| messageType = analytics | Never render |
| messageType = context | Do not render |
| messageType = info AND visibility != shown | Do not render (hidden by default) |
| messageType = info AND visibility = shown | Render as rich text |
| messageType = user_action AND visibility != shown | Do not render (hidden by default) |
| messageType = user_action AND visibility = shown | Render derivedLabel |
| template supported | Render template |
| template unsupported | Render fallbackText (rich text) — **[Phase 2]** |
| markdown/html | Safe render |
| action scope = template_item | Render per item |
| action scope = message | Render once |
| replyType = hidden | No echo, no LLM — **[Phase 2]**  |

---

## 4. Examples

### 4.1 Context on Chat Open (SRP)

> 📎 **Filter Reference:** See [`filterMap.js`](https://github.com/elarahq/housing.brahmand/blob/a17bf76ad06f0da180b270c840b1fb4ab14eb627/common/modules/filter-encoder/source/filterMap.js) for all possible filter keys.

```json
{
  "sender": { "type": "system" },
  "payload": {
    "messageType": "context",
    "content": {
      "data": {
        "page_type": "SRP",
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
          "uuid": [],
          "qv_resale_id": 1234,
          "qv_rent_id": 12345
        }
      }
    }
  }
}
```

---

### 4.2 Info Message (hidden by default)

```json
{
  "sender": { "type": "system" },
  "payload": {
    "messageType": "info",
    "content": {
      "data": {
        "action": "chat_start"
      }
    }
  }
}
```


### 4.3 User Text

```json
{
  "sender": { "type": "user" },
  "payload": {
    "messageType": "text",
    "content": { "text": "hi. tell me about modiji" }
  }
}
```

---
### 4.3.1 Bot reply - Not a real estate intent

```json
{
  "conversationId": "conv_1",
  "sender": { "type": "bot" },
  "payload": {
    "messageId": "msg_0011",
    "messageType": "text",
    "content": {
      "text": "Hey! I'm still learning. Wont be able to help you with this. Anything else?"
    }
  }
}
```
---


### 4.4 User Text

```json
{
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
  "sender": { "type": "bot" },
  "payload": {
    "messageId": "msg_002",
    "messageType": "template",
    "content": {
      "templateId": "property_carousel",
      "data": {
        "properties": [
          { "id": "p1", "type": "resale",  "title": "2BHK · 80L" },
          { "id": "p2", "type": "project", "title": "3BHK · 70L" }
        ],
        "page_type": "SRP", // page_type to be used in phase 2 if required
        "service": "buy",
        "category": "residential",
        "city": "526acdc6c33455e9e4e9", // city is optional?
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
          "uuid": [],
          "qv_resale_id": 1234,
          "qv_rent_id": 12345
        },

      },
      // [Phase 2] fallbackText — will be rendered when template is unsupported
      "fallbackText": "**P1**: 2bhk indepedent House @ 80L  **P2**: 3bhk indepdent floor @ 70L"
    },
    // [Phase 2] actions — will be implemented in Phase 2 if required. ignore for now
    "actions": [
      { "id": "shortlist", "label": "Shortlist", "replyType": "visible", "scope": "template_item" },
      { "id": "contact", "label": "Contact Seller", "replyType": "visible", "scope": "template_item" }
    ]
  }
}
```

---

### 4.5.1 User Action (shortlisted) [clicked UI icon to shortlist].

```json
{
  "sender": { "type": "system" },
  "payload": {
    "messageType": "user_action",
    // "visibility": "shown",
    "content": {
      "data": {
        
        "action": "shortlist",
        "messageId": "msg_002",
        "properties": [{
          "propertyId": "p2",
          "service": "buy",
          "category": "residential",
          "type": "project"
        }]
        
      },
      
      "derivedLabel": "You've shortlisted this property. check it out in User Profile -> Saved properties" 
    }
  }
}
```

---



### 4.6 Phase 2: Analytics (User logged in using phone & otp => using FE hardcoded actions)


```json
{
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

### 4.6.1 Phase 2:Analytics (User shortisted the property)

```json
{
  "loginAuthToken": "", // should be here??
  "sender": { "type": "system" },
  "payload": {
    "messageType": "analytics",
    "content": {
      "data": {
        "category": "click",
        "action": "shortlist",
        "label": "shortlist",
        "messageId": "msg_002",
        "properties": [
          {
            "propertyId": "p2",
            "service": "buy",
            "category": "residential",
            "type": "resale"
          }
        ]

      }
    }
  }
}
```
---

### 4.8 User Action (contact P1's seller) [clicked on FE hardcoded action]

```json
{
  "sender": { "type": "system" },
  "payload": {
    "messageType": "user_action",
    "visibility": "shown",
    "content": {
      "data": {
        
        "action": "crf_submitted",
        "messageId": "msg_002",
        "properties": [
          {
            "propertyId": "p1",
            "service": "buy",
            "category": "residential",
            "type": "resale"
          }
        ]
      },
      
      "derivedLabel": "The seller has been contacted, someone will reach out to you soon!" 
    }
  }
}
```

---


### 4.10 Analytics (User logged in using phone & otp => using FE hardcoded actions)

```json
{
  "loginAuthToken": "", // should be here??
  "sender": { "type": "system" },
  "payload": {
    "messageType": "analytics",
    "content": {
      "data": {
        "category": "crf_submit",
        "action": "called",
        "label": "called using phone",
        "properties": [
          {
            "propertyId": "p1",
            "service": "buy",
            "category": "residential",
            "type": "resale"
          }
        ]
      }
    }
  }
}
```
---


### 4.11 User Text (random query)

```json
{
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
  "sender": { "type": "user" },
  "payload": {
    "messageType": "text",
    "content": { "text": "can you tell me about sector 32, sector 21?" }
  }
}
```
---
### 4.13.1 Bot reply
```json
{
  "conversationId": "conv_1",
  "sender": { "type": "bot" },
  "payload": {
    "messageId": "msg_0061",
    "messageType": "text",
    "content": {
      "text": "I could only match 1 out of 2 areas you mentioned?"
    }
  }
}
```
---

### 4.14 Bot replies

```json
{
  "sender": { "type": "bot" },
  "payload": {
    "messageId": "msg_007",
    "messageType": "template",
    "content": {
      "templateId": "nested_qna", // select multiple
      "data": {
        "selections": [
          {
            "title": "what would you like to do?",
            "type": "single_select", // other values: locality_single_select multi-select in phase 2 if required
            "questionId": "main_intent",
            "options": [
              { 
                "id": "review", "title": "Review_to_search_in_all",
                "subSelections": [
                  {
                    
                    "title": "Which sector 32 are you referring to?",
                    "type": "locality_single_select", // multi-select in phase 2 if required
                    "questionId": "sub_intent_1",
                    "options": [
                      { "id": "uuid1", "title": "sector 32", "city": "Gurgaon", "type": "Locality" },
                      { "id": "uuid2", "title": "sector 32", "city": "Faridabad", "type": "Region" }
                    ]
                  },
                  {
                    "title": "Which sector 21 are you referring to?",
                    "type": "locality_single_select",
                    "entity": "sector 21",
                    "questionId": "sub_intent_2",
                    "options": [
                      { "id": "uuid3", "title": "sector 21 gurgaon" },
                      { "id": "uuid4", "title": "sector 21 faridabad" }
                    ]
                  }
                ]
              },
              { "id": "partial_search", "title": "Only search in phase 5" }
            ]
          }
        ]
      },
      // [Phase 2] fallbackText — will be rendered when template is unsupported
      "fallbackText": "**Which sector 32 are you referring to?**: sector 32 gurgaon or sector 32 faridabad. And **Which sector 21 are you referring to?**: sector 21 gurgaon or sector 21 faridabad"
    },
    // [Phase 2] actions — will be implemented in Phase 2
    "actions": []
  }
}
```
---
### 4.15 User Text (user types instead of selection)

```json
{
  "sender": { "type": "system" },
  "payload": {
    "messageType": "user_action",
    "visibility": "shown",
    "content": {
      "data": {
        
        "action": "nested_qna_selection",
        "selections": [
          {
            "questionId": "main_intent",
            "selection": "review",
            "subSelections": [
              {
                "questionId": "sub_intent_1",
                "selection": "uuid1",
              },
              {
                "questionId": "sub_intent_2",
                "text": "sector 21 gurgaon",
              }
            ]

          }
        ]
      },
      // derived label can be markdown??
      "derivedLabel": "Q. Which sector 32 are you referring to?\nA. sector 32 gurgaon\n\nQ. Which sector 21 are you referring to?\nA. sector 21 gurgaon" 
    }
  }
}
```
---
### 4.16 Bot reply 


```json
{
  "conversationId": "conv_1",
  "sender": { "type": "bot" },
  "payload": {
    "messageId": "msg_007",
    "messageType": "text",
    "content": {
      "text": "Are you looking for rent or buy?"
    }
  }
}
```
---
### 4.17 User Action 

```json
{
  "loginAuthToken": "", // should be here??
  "sender": { "type": "user" },
  "payload": {
    "messageType": "text",
    "content": {
      "text": "buy"
    }
  }
}
```
---
### 4.18 Bot replies

```json
{
  "sender": { "type": "bot" },
  "payload": {
    "messageId": "msg_009",
    "messageType": "template",
    "content": {
      "templateId": "locality_info",
      "data": {
        "id": "l1",
        "name": "Sector 32",
        "image": "https://images.housing.com/l1.jpg",
        "description": "sector 32 is a bustling localtiy in gurgaon with a population of 25K.",
        "highlights": ["highlight 1", "highlight 2"],
        "pros": ["pro1", "pro2"],
        "cons": ["con1"]
      },
      // [Phase 2] fallbackText — will be rendered when template is unsupported
      "fallbackText": "**### Here's all you need to know about sector 32 gurgaon.  sector 32 is a bustling localtiy in gurgaon with a population of 25K. Few highlights: highlight 1, highlight 2. It has pro1, pro 2. but lacks: con1, con2"
    },
    // [Phase 2] actions — will be implemented in Phase 2
    "actions": [
      { "id": "show_reviews", "label": "Show review", "replyType": "visible", "scope": "message" }
    ]
  }
}
```
---
### 4.18 Bot replies

```json
{
  "sender": { "type": "bot" },
  "payload": {
    "messageId": "msg_009",
    "messageType": "template",
    "content": {
      "templateId": "locality_info",
      "data": {
        "id": "l1",
        "name": "Sector 21",
        "image": "https://images.housing.com/l1.jpg",
        "description": "sector 21 is a bustling localtiy in gurgaon with a population of 25K.",
        "highlights": ["highlight 1", "highlight 2"],
        "pros": ["pro1", "pro2"],
        "cons": ["con1"]
      },
      // [Phase 2] fallbackText — will be rendered when template is unsupported
      "fallbackText": "**### Here's all you need to know about sector 21 grugaon.  sector 21 is a bustling localtiy in grugaon with a population of 25K. Few highlights: highlight 1, highlight 2. It has pro1, pro 2. but lacks: con1, con2"
    },
    // [Phase 2] actions — will be implemented in Phase 2
    "actions": [
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
  const { payload } = event;

  if (payload.messageType === "analytics") return;
  if (payload.messageType === "context") return;
  if (payload.messageType === "info" && payload.visibility !== "shown") return;

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
          // [Phase 2] template_item-scoped actions not yet passed through
        );
      } else {
        // [Phase 2] fallbackText rendering not yet implemented
        renderRichText(payload.content.fallbackText || "");
      }
      break;

    case "user_action":
      renderUserBubble(payload.content.derivedLabel);
      break;

    case "info":
      // only reached if visibility === "shown" (guarded above)
      renderRichText(payload.content.text);
      break;
  }

  // [Phase 2] message-scoped footer actions not yet implemented
  const footerActions = payload.actions?.filter(a => a.scope === "message") || [];
  if (footerActions.length) renderActions(footerActions);
}
```

---

## Status

**Chat API Contract v1.0 — FROZEN (Rich Text Clarified) ✅**