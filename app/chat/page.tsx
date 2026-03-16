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
const REPLY_TIMEOUT_MS = 25000;
const SSE_READYSTATE_CHECK_MS = 10_000;

type ReplyStatus = "idle" | "sending" | "awaiting" | "timeout" | "error";

const SUGGESTIONS = [
  { id: "s1", emoji: "📍", text: "Show properties near me" },
  { id: "s2", emoji: "🏠", text: "3 BHK properties between ₹2 - 2.5 Cr" },
  { id: "s3", emoji: "🛋️", text: "2 BHK fully furnished properties for rent" },
  { id: "s4", emoji: "✨", text: "Show trending localities in my area" },
  { id: "s5", emoji: "⚖️", text: "Compare localities" },
  { id: "s6", emoji: "🔑", text: "Show me under construction projects" },
  { id: "s7", emoji: "⭐", text: "Check locality reviews" },
  { id: "s8", emoji: "💬", text: "Check locality price trends" },
];

// 4.1 Context on chat open
function buildContextEvent(conversationId: string): ChatEvent {
  return {
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

interface ToastItem {
  id: string;
  message: string;
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
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [showBackToBottom, setShowBackToBottom] = useState(false);

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
  const toastTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const showToast = useCallback((message: string) => {
    const id = `toast_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    setToasts((prev) => [...prev, { id, message }]);
    const timer = setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
      toastTimersRef.current.delete(id);
    }, 3000);
    toastTimersRef.current.set(id, timer);
  }, []);

  const dismissToast = useCallback((id: string) => {
    const timer = toastTimersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      toastTimersRef.current.delete(id);
    }
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

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

  // Load conversation and initial history
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

  // Back to bottom visibility
  useEffect(() => {
    const el = messagesScrollRef.current;
    if (!el) return;
    const handleScroll = () => {
      const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
      setShowBackToBottom(distFromBottom > 120);
    };
    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => el.removeEventListener("scroll", handleScroll);
  }, []);

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
        conversationId,
        sender: { type: "user" },
        payload: {
          messageType: "text",
          responseRequired: true,
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
      conversationId,
      sender: { type: "user" },
      payload: {
        messageType: "user_action",
        responseRequired: true,
        content: {
          data: { actionId: "logged_in" },
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
      conversationId,
      sender: { type: "user" },
      payload: {
        messageType: "user_action",
        responseRequired: false,
        content: {
          data: {
            actionId: "call_now",
            category: "crf_submit",
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

  // Visible messages (filter context/analytics for display count)
  const visibleMessages = messages.filter(
    (m) => m.payload.messageType !== "context" && m.payload.messageType !== "analytics"
  );
  const hasMessages = visibleMessages.length > 0;

  const inputPlaceholder = hasMessages ? "Reply to Houzy" : "Ask Houzy";

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F5F5F5]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-[#6033EE] border-t-transparent animate-spin" />
          <p className="text-sm text-[#767676]">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-[#F5F5F5] max-w-[430px] mx-auto relative">
      {/* Header */}
      <header className="flex-shrink-0 bg-white border-b border-[#E8E8E8] px-4 py-3 flex items-center gap-3">
        {/* Back button (noop for demo) */}
        <button type="button" className="w-8 h-8 flex items-center justify-center text-[#111] hover:bg-[#F5F5F5] rounded-full transition-colors" onClick={() => {}}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M19 12H5M12 5l-7 7 7 7" />
          </svg>
        </button>

        {/* Logo + name */}
        <div className="flex items-center gap-2 flex-1">
          {/* Sparkle icon */}
          <div className="w-7 h-7 rounded-lg bg-[#6033EE] flex items-center justify-center flex-shrink-0">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="white">
              <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z" />
            </svg>
          </div>
          <span className="font-bold text-[15px] text-[#111]">Houzy</span>
          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-[#EDE8FF] text-[#6033EE] leading-tight">BETA</span>
        </div>

        {/* Info button */}
        <button
          type="button"
          onClick={() => setShowInfoModal(true)}
          className="w-8 h-8 flex items-center justify-center text-[#767676] hover:text-[#111] hover:bg-[#F5F5F5] rounded-full transition-colors"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 16v-4M12 8h.01" />
          </svg>
        </button>
      </header>

      {/* Messages area */}
      <div
        ref={messagesScrollRef}
        className="flex-1 overflow-y-auto"
      >
        {/* Empty state */}
        {!hasMessages && (
          <div className="flex flex-col items-center pt-16 pb-6 px-4">
            <div className="w-12 h-12 rounded-2xl bg-[#6033EE] flex items-center justify-center mb-5">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="white">
                <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-[#111] text-center leading-snug mb-6">
              Hey, how can I{"\n"}help you today?
            </h2>
            {/* Suggestion chips - horizontal scroll */}
            <div className="w-full -mx-4">
              <div className="flex gap-2 overflow-x-auto px-4 pb-2 no-scrollbar" style={{ scrollbarWidth: "none" }}>
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => handleSendText(s.text)}
                    className="flex-shrink-0 flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-white border border-[#E8E8E8] text-xs text-[#111] font-medium hover:border-[#6033EE] hover:text-[#6033EE] transition-colors whitespace-nowrap shadow-sm"
                  >
                    <span>{s.emoji}</span>
                    <span>{s.text}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Message list */}
        {hasMessages && (
          <div className="pt-3 pb-2">
            {/* View older messages */}
            {hasMoreOlder && (
              <div className="flex justify-center mb-3 px-4">
                <button
                  type="button"
                  onClick={loadMoreOlder}
                  disabled={loadingMoreOlder}
                  className="text-xs font-medium text-[#6033EE] px-4 py-1.5 rounded-full bg-white border border-[#E8E8E8] shadow-sm hover:bg-[#EDE8FF] disabled:opacity-50 transition-colors"
                >
                  {loadingMoreOlder ? "Loading…" : "View older messages"}
                </button>
              </div>
            )}

            {/* Date separator */}
            <div className="flex items-center gap-3 px-4 mb-3">
              <div className="flex-1 h-px bg-[#E8E8E8]" />
              <span className="text-[11px] text-[#767676] font-medium">Today</span>
              <div className="flex-1 h-px bg-[#E8E8E8]" />
            </div>

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
                onToast={showToast}
              />
            ))}
          </div>
        )}

        {/* Awaiting state */}
        {replyStatus === "awaiting" && (
          <div className="flex items-center gap-2 px-4 mb-3">
            <div className="w-4 h-4 rounded-full border-2 border-[#767676] border-t-transparent animate-spin flex-shrink-0" />
            <span className="text-xs text-[#767676]">Running through the details...</span>
          </div>
        )}

        {/* Error / timeout inline card */}
        {(replyStatus === "timeout" || replyStatus === "error") && (
          <div className="mx-4 mb-3 flex items-center gap-3 px-4 py-3 bg-white rounded-2xl border border-[#E8E8E8] shadow-sm">
            <div className="w-8 h-8 rounded-full bg-amber-50 flex items-center justify-center flex-shrink-0">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" strokeWidth="2">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            </div>
            <div className="flex-1">
              <p className="text-sm text-[#111] font-medium">
                {replyStatus === "timeout" ? "Request timed out" : "Something went wrong"}
              </p>
              <p className="text-xs text-[#767676]">Please try again</p>
            </div>
            <button
              type="button"
              onClick={handleRetry}
              className="text-sm font-semibold text-[#6033EE] hover:opacity-80"
            >
              Retry
            </button>
            <button
              type="button"
              onClick={clearReplyWaiting}
              className="text-sm font-semibold text-[#767676] hover:opacity-80"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Network error (stream error while idle) */}
        {streamStatus === "error" && replyStatus === "idle" && (
          <div className="mx-4 mb-3 flex items-center gap-3 px-4 py-3 bg-white rounded-2xl border border-[#E8E8E8] shadow-sm">
            <div className="w-8 h-8 rounded-full bg-red-50 flex items-center justify-center flex-shrink-0">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2">
                <path d="M1 6l5 5M5 6l1 5" /><path d="M23 6l-5 5M19 6l-1 5" />
                <path d="M12 13v5M12 20h.01" />
              </svg>
            </div>
            <div className="flex-1">
              <p className="text-sm text-[#111] font-medium">Connection lost</p>
              <p className="text-xs text-[#767676]">Reconnecting...</p>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />

        {/* Footer disclaimer */}
        <p className="text-center text-[11px] text-[#767676] px-6 pb-4 pt-1">
          Houzy is an AI assistant and may occasionally make mistakes.
        </p>
      </div>

      {/* Back to bottom button */}
      {showBackToBottom && (
        <button
          type="button"
          onClick={scrollToBottom}
          className="absolute bottom-[80px] right-4 w-9 h-9 rounded-full bg-white border border-[#E8E8E8] shadow-md flex items-center justify-center text-[#767676] hover:text-[#111] transition-colors z-10"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M12 5v14M5 12l7 7 7-7" />
          </svg>
        </button>
      )}

      {/* Input bar */}
      <div className="flex-shrink-0 bg-white border-t border-[#E8E8E8] px-4 py-3">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSendText(input);
          }}
          className="flex items-center gap-2"
        >
          <div className="flex-1 flex items-center gap-2 px-4 py-2.5 rounded-full border border-[#E8E8E8] bg-[#F5F5F5] focus-within:border-[#6033EE] focus-within:bg-white transition-colors">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={inputPlaceholder}
              className="flex-1 bg-transparent text-sm text-[#111] placeholder-[#BBBBBB] focus:outline-none"
              disabled={sending}
            />
          </div>

          {/* Stop button when awaiting */}
          {replyStatus === "awaiting" ? (
            <button
              type="button"
              onClick={handleCancel}
              className="w-10 h-10 rounded-full bg-[#6033EE] flex items-center justify-center hover:bg-[#4f27d4] transition-colors flex-shrink-0"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="white">
                <rect x="6" y="6" width="12" height="12" rx="2" />
              </svg>
            </button>
          ) : (
            <button
              type="submit"
              disabled={sending || !input.trim()}
              className="w-10 h-10 rounded-full bg-[#6033EE] flex items-center justify-center hover:bg-[#4f27d4] transition-colors disabled:opacity-40 flex-shrink-0"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="white">
                <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
              </svg>
            </button>
          )}
        </form>
      </div>

      {/* Info modal — bottom sheet */}
      {showInfoModal && (
        <div className="fixed inset-0 z-50 flex items-end" onClick={() => setShowInfoModal(false)}>
          <div className="absolute inset-0 bg-black/40" />
          <div
            className="relative w-full max-w-[430px] mx-auto bg-white rounded-t-2xl px-5 pt-5 pb-10"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-10 h-1 bg-[#E8E8E8] rounded-full mx-auto mb-5" />
            <div className="flex items-center gap-2 mb-4">
              <div className="w-7 h-7 rounded-lg bg-[#6033EE] flex items-center justify-center">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="white">
                  <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z" />
                </svg>
              </div>
              <span className="font-bold text-[15px] text-[#111]">About the responses</span>
            </div>
            <p className="text-sm text-[#767676] leading-relaxed mb-2">
              Houzy is an AI assistant powered by real estate data. It can help you find properties, explore localities, and understand market trends.
            </p>
            <p className="text-sm text-[#767676] leading-relaxed mb-6">
              While Houzy strives for accuracy, it may occasionally make mistakes. Always verify important details before making decisions.
            </p>
            <button
              type="button"
              onClick={() => setShowInfoModal(false)}
              className="w-full py-3.5 rounded-2xl bg-[#6033EE] text-white font-semibold text-sm hover:bg-[#4f27d4] transition-colors"
            >
              Understood
            </button>
          </div>
        </div>
      )}

      {/* Toast notifications */}
      <div className="fixed bottom-24 left-1/2 -translate-x-1/2 flex flex-col gap-2 z-50 pointer-events-none" style={{ maxWidth: "380px", width: "calc(100% - 32px)" }}>
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className="flex items-center gap-2.5 px-4 py-3 bg-[#111] text-white rounded-2xl shadow-lg pointer-events-auto"
          >
            <div className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3">
                <path d="M20 6L9 17l-5-5" />
              </svg>
            </div>
            <span className="text-sm font-medium flex-1">{toast.message}</span>
            <button
              type="button"
              onClick={() => dismissToast(toast.id)}
              className="text-white/60 hover:text-white transition-colors"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ChatPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-[#F5F5F5]">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 rounded-full border-2 border-[#6033EE] border-t-transparent animate-spin" />
            <p className="text-sm text-[#767676]">Loading...</p>
          </div>
        </div>
      }
    >
      <ChatPageContent />
    </Suspense>
  );
}
