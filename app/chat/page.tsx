"use client";

import { Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  getConversationId,
  getHistory,
  sendMessage,
  cancelRequest,
  getStreamUrl,
} from "@/lib/api";
import type { ChatEvent } from "@/lib/contract-types";
import { ChatMessage } from "@/components/chat/ChatMessage";

interface StoredMessage extends ChatEvent {
  eventId: string;
  createdAt?: string;
}

const INITIAL_PAGE_SIZE = 6;
const LOAD_MORE_PAGE_SIZE = 5;
const MISSED_MESSAGES_POLL_INTERVAL_MS = 1500;
const STREAM_OPEN_WAIT_TIMEOUT_MS = 8000;
const REPLY_TIMEOUT_MS = 25000; // FE waits 25s for reply when expectResponse is true, then shows "Request timed out" + Retry/Dismiss
// Poll EventSource.readyState so we sync UI when browser has set connection to CLOSED (no extra traffic)
const SSE_READYSTATE_CHECK_MS = 10_000;

type ReplyStatus = "idle" | "sending" | "awaiting" | "timeout" | "error";

// 4.1 Context on chat open — FE sends this via send-message when conversation is new (e.g. from SRP)
function buildContextEvent(conversationId: string): ChatEvent {
  return {
    eventType: "info",
    conversationId,
    sender: { type: "system" },
    payload: {
      messageType: "context",
      content: {
        data: {
          page: "SRP",
          service: "buy",
          category: "residential",
          city: "526acdc6c33455e9e4e9",
          filters: {
            apartment_type_id: [1, 2],
            max_price: 4800000,
            min_price: 100,
            property_type_id: [1, 2],
            type: "project",
          },
        },
      },
    },
  };
}

function ChatPageContent() {
  const searchParams = useSearchParams();
  const isDemo = searchParams.get("demo") === "true";

  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<StoredMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [streamStatus, setStreamStatus] = useState<"connecting" | "open" | "error">("connecting");
  const [replyStatus, setReplyStatus] = useState<ReplyStatus>("idle");
  const [awaitingElapsedSec, setAwaitingElapsedSec] = useState(0);
  const [hasMoreOlder, setHasMoreOlder] = useState(false);
  const [loadingMoreOlder, setLoadingMoreOlder] = useState(false);
  const [input, setInput] = useState("");
  const [reconnectKey, setReconnectKey] = useState(0);

  const eventSourceRef = useRef<EventSource | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const knownEventIdsRef = useRef<Set<string>>(new Set());
  const streamStatusRef = useRef<"connecting" | "open" | "error">("connecting");
  const streamOpenResolveRef = useRef<(() => void) | null>(null);
  const replyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const awaitingElapsedIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastSentEventRef = useRef<ChatEvent | null>(null);
  const lastRequestIdRef = useRef<string | null>(null);
  const awaitingUserEventIdRef = useRef<string | null>(null);
  const messagesScrollRef = useRef<HTMLDivElement | null>(null);
  const scrollRestoreAfterPrependRef = useRef<{ scrollTop: number; scrollHeight: number } | null>(null);
  const lastMessageEventIdRef = useRef<string | undefined>(undefined);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  const clearReplyWaiting = useCallback(() => {
    if (replyTimeoutRef.current) {
      clearTimeout(replyTimeoutRef.current);
      replyTimeoutRef.current = null;
    }
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    if (awaitingElapsedIntervalRef.current) {
      clearInterval(awaitingElapsedIntervalRef.current);
      awaitingElapsedIntervalRef.current = null;
    }
    awaitingUserEventIdRef.current = null;
    setAwaitingElapsedSec(0);
    setReplyStatus("idle");
  }, []);

  // Load conversation and initial history (BE prewarms store when demo=true and new chat)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { conversationId: cid, isNew } = await getConversationId(isDemo);
        if (cancelled) return;
        setConversationId(cid);
        if (isNew) {
          sendMessage(buildContextEvent(cid)).catch(() => {});
        }
        const hist = await getHistory(cid, { last: INITIAL_PAGE_SIZE });
        if (cancelled) return;
        const list = hist.messages as StoredMessage[];
        setMessages(list);
        setHasMoreOlder(hist.hasMore);
        list.forEach((m) => m.eventId && knownEventIdsRef.current.add(m.eventId));
      } catch (e) {
        console.error(e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isDemo]);

  // SSE: subscribe when we have conversationId
  useEffect(() => {
    if (!conversationId) return;
    streamStatusRef.current = "connecting";
    setStreamStatus("connecting");
    const url = getStreamUrl(conversationId);
    const es = new EventSource(url);
    eventSourceRef.current = es;

    es.onopen = () => {
      streamStatusRef.current = "open";
      setStreamStatus("open");
      streamOpenResolveRef.current?.();
      streamOpenResolveRef.current = null;
    };

    es.addEventListener("chat_event", (e: MessageEvent) => {
      try {
        const event = JSON.parse(e.data) as StoredMessage;
        if (!event.eventId || knownEventIdsRef.current.has(event.eventId)) return;
        knownEventIdsRef.current.add(event.eventId);
        setMessages((prev) => [...prev, event]);
        if (event.sender?.type === "bot") clearReplyWaiting();
      } catch (_) {}
    });

    es.addEventListener("connection_close", () => {
      streamStatusRef.current = "error";
      setStreamStatus("error");
      es.close();
      eventSourceRef.current = null;
      if (awaitingUserEventIdRef.current) setReconnectKey((k) => k + 1);
    });

    es.onerror = () => {
      streamStatusRef.current = "error";
      setStreamStatus("error");
      es.close();
      eventSourceRef.current = null;
    };

    const readyStateInterval = setInterval(() => {
      if (eventSourceRef.current !== es) return;
      if (es.readyState === EventSource.CLOSED) {
        streamStatusRef.current = "error";
        setStreamStatus("error");
        eventSourceRef.current = null;
        if (awaitingUserEventIdRef.current) setReconnectKey((k) => k + 1);
      }
    }, SSE_READYSTATE_CHECK_MS);

    return () => {
      clearInterval(readyStateInterval);
      es.close();
      eventSourceRef.current = null;
    };
  }, [conversationId, reconnectKey, clearReplyWaiting]);

  useEffect(() => {
    const lastId = messages[messages.length - 1]?.eventId;
    if (lastId !== lastMessageEventIdRef.current) {
      lastMessageEventIdRef.current = lastId;
      scrollToBottom();
    }
  }, [messages, scrollToBottom]);

  useLayoutEffect(() => {
    const saved = scrollRestoreAfterPrependRef.current;
    const el = messagesScrollRef.current;
    if (saved && el) {
      el.scrollTop = saved.scrollTop + (el.scrollHeight - saved.scrollHeight);
      scrollRestoreAfterPrependRef.current = null;
    }
  }, [messages]);

  const ensureStreamConnected = useCallback((): Promise<void> => {
    return new Promise((resolve) => {
      if (streamStatusRef.current === "open") {
        resolve();
        return;
      }
      if (streamStatusRef.current === "error") setReconnectKey((k) => k + 1);
      streamOpenResolveRef.current = () => resolve();
      setTimeout(() => {
        if (streamOpenResolveRef.current) {
          streamOpenResolveRef.current = null;
          resolve();
        }
      }, STREAM_OPEN_WAIT_TIMEOUT_MS);
    });
  }, []);

  const syncHistory = useCallback(async () => {
    if (!conversationId) return;
    try {
      const hist = await getHistory(conversationId, { last: 100 });
      const list = hist.messages as StoredMessage[];
      const toAdd = list.filter(
        (m) => m.eventId && !knownEventIdsRef.current.has(m.eventId)
      );
      if (toAdd.length === 0) return;
      toAdd.forEach((m) => m.eventId && knownEventIdsRef.current.add(m.eventId));
      setMessages((prev) => {
        const existingIds = new Set(prev.map((x) => x.eventId));
        const missing = list.filter((m) => m.eventId && !existingIds.has(m.eventId));
        if (missing.length === 0) return prev;
        return [...prev, ...missing].sort(
          (a, b) => (a.createdAt ?? "").localeCompare(b.createdAt ?? "")
        );
      });
    } catch (_) {}
  }, [conversationId]);

  const fetchMissedMessages = useCallback(
    async (afterEventId: string): Promise<boolean> => {
      if (!conversationId) return false;
      try {
        const hist = await getHistory(conversationId, {
          messages_after: afterEventId,
        });
        const newOnes = (hist.messages as StoredMessage[]).filter(
          (m) => m.eventId && !knownEventIdsRef.current.has(m.eventId)
        );
        if (newOnes.length === 0) return false;
        newOnes.forEach((m) => m.eventId && knownEventIdsRef.current.add(m.eventId));
        setMessages((prev) => [...prev, ...newOnes]);
        const hasBot = newOnes.some((m) => m.sender?.type === "bot");
        if (hasBot) clearReplyWaiting();
        return hasBot;
      } catch (_) {
        return false;
      }
    },
    [conversationId, clearReplyWaiting]
  );

  function getAwaitingMessage(elapsedSec: number): string {
    if (elapsedSec < 5) return "thinking";
    if (elapsedSec < 10) return "Still Thinking";
    if (elapsedSec < 15) return "Analysing";
    return "It's taking longer than usual, but I'm trying.";
  }

  const loadMoreOlder = useCallback(async () => {
    if (!conversationId || loadingMoreOlder || messages.length === 0) return;
    const firstEventId = messages[0].eventId;
    if (!firstEventId) return;
    setLoadingMoreOlder(true);
    try {
      const hist = await getHistory(conversationId, {
        messages_before: firstEventId,
        page_size: LOAD_MORE_PAGE_SIZE,
      });
      const list = hist.messages as StoredMessage[];
      const toPrepend = list.filter(
        (m) => m.eventId && !knownEventIdsRef.current.has(m.eventId)
      );
      toPrepend.forEach((m) => m.eventId && knownEventIdsRef.current.add(m.eventId));
      setHasMoreOlder(hist.hasMore);
      if (toPrepend.length > 0) {
        const el = messagesScrollRef.current;
        if (el) {
          scrollRestoreAfterPrependRef.current = {
            scrollTop: el.scrollTop,
            scrollHeight: el.scrollHeight,
          };
        }
        setMessages((prev) => [...toPrepend, ...prev]);
      }
    } catch (_) {}
    finally {
      setLoadingMoreOlder(false);
    }
  }, [conversationId, loadingMoreOlder, messages]);

  const startAwaitingReply = useCallback(
    (userEventId: string) => {
      awaitingUserEventIdRef.current = userEventId;
      setAwaitingElapsedSec(0);
      setReplyStatus("awaiting");

      awaitingElapsedIntervalRef.current = setInterval(() => {
        setAwaitingElapsedSec((s) => (s >= 25 ? 25 : s + 1));
      }, 1000);

      replyTimeoutRef.current = setTimeout(() => {
        replyTimeoutRef.current = null;
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
        }
        if (awaitingElapsedIntervalRef.current) {
          clearInterval(awaitingElapsedIntervalRef.current);
          awaitingElapsedIntervalRef.current = null;
        }
        awaitingUserEventIdRef.current = null;
        setAwaitingElapsedSec(0);
        setReplyStatus("timeout");
      }, REPLY_TIMEOUT_MS);

      setTimeout(() => {
        if (awaitingUserEventIdRef.current === userEventId) {
          fetchMissedMessages(userEventId);
        }
      }, 400);

      pollIntervalRef.current = setInterval(() => {
        const afterId = awaitingUserEventIdRef.current;
        if (!afterId) return;
        fetchMissedMessages(afterId);
      }, MISSED_MESSAGES_POLL_INTERVAL_MS);
    },
    [fetchMissedMessages]
  );

  const handleSendText = useCallback(
    async (text: string) => {
      if (!conversationId || !text.trim() || sending || replyStatus === "awaiting") return;
      const trimmed = text.trim();
      const event: ChatEvent = {
        eventType: "message",
        conversationId,
        sender: { type: "user" },
        payload: {
          messageType: "text",
          content: { text: trimmed },
        },
      };
      lastSentEventRef.current = event;
      const pendingId = `pending-${Date.now()}`;
      const userMessage: StoredMessage = {
        ...event,
        eventId: pendingId,
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, userMessage]);
      setInput("");
      setSending(true);
      setReplyStatus("sending");
      try {
        await ensureStreamConnected();
        await syncHistory();
      } catch (_) {}
      try {
        const res = await sendMessage(event);
        lastRequestIdRef.current = res.requestId;
        knownEventIdsRef.current.add(res.eventId);
        setMessages((prev) =>
          prev.map((m) =>
            m.eventId === pendingId ? { ...m, eventId: res.eventId } : m
          )
        );
        startAwaitingReply(res.eventId);
      } catch (e) {
        console.error(e);
        setReplyStatus("error");
        setMessages((prev) => prev.filter((m) => m.eventId !== pendingId));
      } finally {
        setSending(false);
      }
    },
    [
      conversationId,
      sending,
      replyStatus,
      ensureStreamConnected,
      syncHistory,
      startAwaitingReply,
    ]
  );

  const handleUserAction = useCallback(
    async (event: ChatEvent) => {
      if (!conversationId || sending || replyStatus === "awaiting") return;
      const fullEvent: ChatEvent = { ...event, conversationId };
      lastSentEventRef.current = fullEvent;
      const pendingId = `pending-${Date.now()}`;
      const stored: StoredMessage = {
        ...fullEvent,
        eventId: pendingId,
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, stored]);
      setSending(true);
      setReplyStatus("sending");
      try {
        await ensureStreamConnected();
        await syncHistory();
      } catch (_) {}
      try {
        const res = await sendMessage(fullEvent);
        lastRequestIdRef.current = res.requestId;
        knownEventIdsRef.current.add(res.eventId);
        setMessages((prev) =>
          prev.map((m) =>
            m.eventId === pendingId ? { ...m, eventId: res.eventId } : m
          )
        );
        startAwaitingReply(res.eventId);
      } catch (e) {
        console.error(e);
        setReplyStatus("error");
        setMessages((prev) => prev.filter((m) => m.eventId !== pendingId));
      } finally {
        setSending(false);
      }
    },
    [
      conversationId,
      sending,
      replyStatus,
      ensureStreamConnected,
      syncHistory,
      startAwaitingReply,
    ]
  );

  const handleLoginSuccess = useCallback(async () => {
    if (!conversationId || sending || replyStatus === "awaiting") return;
    setSending(true);
    try {
      await ensureStreamConnected();
      await syncHistory();
    } catch (_) {}
    const analyticsEvent: ChatEvent = {
      eventType: "info",
      conversationId,
      sender: { type: "system" },
      payload: {
        messageType: "analytics",
        content: {
          data: { category: "login", action: "logged_in", label: "logged in using phone" },
        },
      },
    };
    try {
      const res = await sendMessage(analyticsEvent);
      lastRequestIdRef.current = res.requestId;
      startAwaitingReply(res.eventId);
    } catch (e) {
      console.error(e);
    } finally {
      setSending(false);
    }
  }, [conversationId, sending, replyStatus, ensureStreamConnected, syncHistory, startAwaitingReply]);

  const handleCallNow = useCallback(async () => {
    if (!conversationId || sending || replyStatus === "awaiting") return;
    const analyticsEvent: ChatEvent = {
      eventType: "info",
      conversationId,
      sender: { type: "system" },
      payload: {
        messageType: "analytics",
        content: {
          data: {
            category: "crf_submit",
            action: "called",
            label: "called using phone",
          },
        },
      },
    };
    try {
      await sendMessage(analyticsEvent);
    } catch (e) {
      console.error(e);
    }
  }, [conversationId, sending, replyStatus]);

  const handleRetry = useCallback(async () => {
    const event = lastSentEventRef.current;
    if (!event || !conversationId || sending) return;
    const previousRequestId = lastRequestIdRef.current;
    if (previousRequestId) {
      cancelRequest(previousRequestId).catch(() => {});
      lastRequestIdRef.current = null;
    }
    clearReplyWaiting();
    const fullEvent: ChatEvent = { ...event, conversationId };
    setSending(true);
    setReplyStatus("sending");
    try {
      const res = await sendMessage(fullEvent);
      lastRequestIdRef.current = res.requestId;
      startAwaitingReply(res.eventId);
    } catch (e) {
      console.error(e);
      setReplyStatus("error");
    } finally {
      setSending(false);
    }
  }, [conversationId, sending, clearReplyWaiting, startAwaitingReply]);

  const handleCancel = useCallback(async () => {
    if (replyStatus !== "awaiting") return;
    const requestId = lastRequestIdRef.current;
    if (requestId) {
      try {
        await cancelRequest(requestId);
      } catch (_) {}
      lastRequestIdRef.current = null;
    }
    clearReplyWaiting();
  }, [replyStatus, clearReplyWaiting]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-[var(--text-muted)]">Loading chat...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen max-w-2xl mx-auto">
      <header className="flex-shrink-0 py-3 px-4 border-b border-[var(--border)]">
        <h1 className="text-lg font-semibold">Real Estate Chat</h1>
        <p className="text-xs text-[var(--text-muted)]">
          Contract v1.0 · SSE{" "}
          {streamStatus === "open"
            ? "· connected"
            : streamStatus === "connecting"
              ? "· connecting…"
              : "· reconnecting"}
          {replyStatus === "sending" && " · Sending…"}
          {replyStatus === "awaiting" && " · Awaiting reply…"}
        </p>
      </header>

      <div ref={messagesScrollRef} className="flex-1 overflow-y-auto p-4 flex flex-col">
        {hasMoreOlder && (
          <div className="flex justify-center mb-2">
            <button
              type="button"
              onClick={loadMoreOlder}
              disabled={loadingMoreOlder}
              className="text-xs px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)] hover:bg-[var(--border)] disabled:opacity-50"
            >
              {loadingMoreOlder ? "Loading…" : "Load older messages"}
            </button>
          </div>
        )}

        {messages.map((msg) => (
          <ChatMessage
            key={
              msg.eventId ??
              (msg as unknown as { payload?: { messageId?: string } }).payload?.messageId ??
              Math.random()
            }
            event={msg}
            onUserAction={handleUserAction}
            onLoginSuccess={handleLoginSuccess}
            onCallNow={handleCallNow}
            actionsDisabled={replyStatus === "awaiting"}
          />
        ))}

        {replyStatus === "awaiting" && (
          <div className="flex justify-start mb-3">
            <div className="px-4 py-2.5 rounded-2xl rounded-bl-md bg-[var(--bot-bubble)] border border-[var(--border)] text-sm text-[var(--text-muted)]">
              <span className="animate-pulse">{getAwaitingMessage(awaitingElapsedSec)}</span>
            </div>
          </div>
        )}

        {(replyStatus === "timeout" || replyStatus === "error") && (
          <div className="flex justify-center gap-2 mb-3">
            <p className="text-sm text-amber-500">
              {replyStatus === "timeout"
                ? "Request timed out"
                : "Something went wrong."}
            </p>
            <button
              type="button"
              onClick={handleRetry}
              className="text-xs px-3 py-1.5 rounded bg-[var(--accent)] text-white"
            >
              Retry
            </button>
            <button
              type="button"
              onClick={clearReplyWaiting}
              className="text-xs px-3 py-1.5 rounded border border-[var(--border)]"
            >
              Dismiss
            </button>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <div className="flex-shrink-0 p-4 border-t border-[var(--border)]">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSendText(input);
          }}
          className="flex gap-2"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type a message..."
            className="flex-1 px-4 py-2.5 rounded-xl border border-[var(--border)] bg-[var(--surface)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
            disabled={sending || replyStatus === "awaiting"}
          />
          {replyStatus === "awaiting" && (
            <button
              type="button"
              onClick={handleCancel}
              className="px-4 py-2.5 rounded-xl border border-[var(--border)] bg-[var(--surface)] text-sm font-medium text-[var(--text)] hover:bg-[var(--border)] disabled:opacity-50"
            >
              Cancel
            </button>
          )}
          <button
            type="submit"
            disabled={sending || replyStatus === "awaiting" || !input.trim()}
            className="px-4 py-2.5 rounded-xl bg-[var(--accent)] text-white font-medium text-sm disabled:opacity-50"
          >
            Send
          </button>
        </form>
      </div>
    </div>
  );
}

export default function ChatPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <p className="text-[var(--text-muted)]">Loading chat...</p>
        </div>
      }
    >
      <ChatPageContent />
    </Suspense>
  );
}
