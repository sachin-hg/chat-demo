#!/usr/bin/env python3
import json
import time
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import urllib.parse
import urllib.request


BASE_URL = "https://platform-chatbot.housing.com/api/v1/chat/get-conversation-details"
OUT_FILE = Path("sample_conversation.json")


HEADERS = {
    "User-Agent": "Native/android",
    "app_name": "com.locon.housing",
    "app_version": "15.0.5",
    "price_ex": "false",
    "client_id": "6865536d276bc8b7",
    "login-auth-token": "JB_k2q3ucSgLpgbIy0L8QYcrWTuUqeKjHUUAVGrN8ZV4rBv30ABekSRgB6hi_5xmCA187RS0jqKnKwB_h-3qm-gV4lQz00FLFKN-g2TyKxnsuKvQwTkqlLZcDpmX-__m1tYpKHVilSpPy7vm9SZ0SSdtfLOBM9WSaYXEwO-gbOI",
    "ga_id": "6865536d276bc8b7",
    "token_id": "token_01KQ78BJY3Y0J02SRN6YDM3PYT",
    "tracestate": "@nr=0-2---46e11f736fcf4b0c----1777289031696",
    "traceparent": "00-740d1780b3af4ffb94c4ca4d6f2cd013-46e11f736fcf4b0c-01",
    "newrelic": "{\"v\":[0,2],\"d\":{\"ty\":\"Mobile\",\"ac\":\"\",\"ap\":\"\",\"tr\":\"740d1780b3af4ffb94c4ca4d6f2cd013\",\"id\":\"46e11f736fcf4b0c\",\"ti\":1777289031696,\"tk\":\"\"}}",
}


def _http_get(url: str, headers: Dict[str, str], timeout_s: int = 30) -> Dict[str, Any]:
    req = urllib.request.Request(url=url, method="GET")
    for k, v in headers.items():
        req.add_header(k, v)

    with urllib.request.urlopen(req, timeout=timeout_s) as resp:
        body = resp.read()
        try:
            return json.loads(body.decode("utf-8"))
        except Exception as e:
            raise RuntimeError(f"Failed to decode JSON (status={resp.status}): {body[:500]!r}") from e


def _build_url(page_size: int, messages_before: Optional[str]) -> str:
    params = {"pageSize": str(page_size)}
    if messages_before:
        params["messagesBefore"] = messages_before
    return f"{BASE_URL}?{urllib.parse.urlencode(params)}"


def _pick_oldest(messages: List[Dict[str, Any]]) -> Optional[Tuple[str, Any]]:
    """
    Returns (messageId, createdAt) of the oldest message in this page.
    We sort by createdAt, then messageId for stability.
    """
    candidates: List[Tuple[Any, str]] = []
    for m in messages:
        mid = m.get("messageId")
        created = m.get("createdAt")
        if mid is None or created is None:
            continue
        candidates.append((created, str(mid)))

    if not candidates:
        return None

    created_at, mid = sorted(candidates, key=lambda t: (t[0], t[1]))[0]
    return mid, created_at


def main() -> int:
    page_size = 20
    messages_before: Optional[str] = None

    all_messages: List[Dict[str, Any]] = []
    seen_ids: set[str] = set()

    has_more = True
    page = 0

    while has_more:
        page += 1
        url = _build_url(page_size=page_size, messages_before=messages_before)
        payload = _http_get(url, headers=HEADERS)

        data = payload.get("data") or {}
        messages = data.get("messages") or []
        has_more = bool(data.get("hasMore"))

        # De-dupe by messageId while preserving arrival order.
        for m in messages:
            mid = m.get("messageId")
            if mid is None:
                all_messages.append(m)
                continue
            mid_s = str(mid)
            if mid_s in seen_ids:
                continue
            seen_ids.add(mid_s)
            all_messages.append(m)

        oldest = _pick_oldest(messages)
        if has_more:
            if oldest is None:
                raise RuntimeError(
                    "API says hasMore=true but page has no usable (messageId, createdAt) to continue pagination."
                )
            next_before = oldest[0]
            if messages_before == next_before:
                raise RuntimeError(
                    f"Pagination appears stuck (messagesBefore would repeat: {messages_before})."
                )
            messages_before = next_before

        # Small delay to be gentle (tweak/remove as needed).
        time.sleep(0.05)

        print(
            f"page={page} fetched={len(messages)} total={len(all_messages)} hasMore={has_more} "
            f"messagesBefore={messages_before}"
        )

    OUT_FILE.write_text(json.dumps(all_messages, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {len(all_messages)} messages to {OUT_FILE.resolve()}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

