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
import { LoginBottomSheet } from "@/components/chat/LoginBottomSheet";

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

/* Scout-bot pill stroke colors: coral, blue, green, yellow, yellow-strong, purple, pink */
const SUGGESTIONS_ROW1 = [
  { id: "s3", emoji: "🛋️", text: "2 BHK fully furnished properties for rent", stroke: "pill-stroke-green" },
  { id: "s1", emoji: "📍", text: "Show properties near me", stroke: "pill-stroke-coral" },
  { id: "s2", emoji: "🏠", text: "3 BHK properties between ₹2 - 2.5 Cr", stroke: "pill-stroke-blue" },
  { id: "s4", emoji: "✨", text: "Show trending localities in my area", stroke: "pill-stroke-yellow-strong" },
];
const SUGGESTIONS_ROW2 = [
  { id: "s5", emoji: "⚖️", text: "Compare localities", stroke: "pill-stroke-coral" },
  { id: "s7", emoji: "⭐", text: "Check locality reviews", stroke: "pill-stroke-yellow" },
  { id: "s6", emoji: "🔑", text: "Show me under construction projects", stroke: "pill-stroke-purple" },
  { id: "s8", emoji: "📈", text: "Check locality price trends", stroke: "pill-stroke-pink" },
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
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [loginReason, setLoginReason] = useState<"shortlist" | "contact" | null>(null);

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
        const hasFinalBot = newOnes.some(
          (m) =>
            m.sender?.type === "bot" &&
            (m.payload as { isFinal?: boolean; sourceMessageId?: string })?.isFinal === true &&
            (m.payload as { sourceMessageId?: string })?.sourceMessageId === afterEventId
        );
        if (hasFinalBot) clearReplyWaiting();
        return newOnes.some((m) => m.sender?.type === "bot");
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

  const pendingActionRef = useRef<ChatEvent | null>(null);

  const handleUserAction = useCallback(
    async (event: ChatEvent) => {
      if (!conversationId || sending || replyStatus === "awaiting") return;

      const data = (event.payload.content?.data ?? {}) as Record<string, unknown>;
      const rawAction = (data.action as string | undefined) ?? (data.actionId as string | undefined);
      if (!isLoggedIn && event.payload.messageType === "user_action" && (rawAction === "shortlist" || rawAction === "contact")) {
        pendingActionRef.current = event;
        setLoginReason(rawAction === "shortlist" ? "shortlist" : "contact");
        return;
      }

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
        if (fullEvent.payload.responseRequired === true) {
          startAwaitingReply(res.eventId);
        }
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
      setIsLoggedIn(true);
      const pending = pendingActionRef.current;
      pendingActionRef.current = null;
      setLoginReason(null);
      if (pending) {
        await handleUserAction(pending);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setSending(false);
    }
  }, [conversationId, sending, replyStatus, ensureStreamConnected, syncHistory, startAwaitingReply, handleUserAction]);

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

  const handleShareLocation = useCallback(async () => {
    if (!conversationId || sending || replyStatus === "awaiting") return;
    const event: ChatEvent = {
      conversationId,
      sender: { type: "system" },
      payload: {
        messageType: "user_action",
        responseRequired: true,
        visibility: "shown",
        content: {
          data: { action: "location_shared", coordinates: [28.5355, 77.391] },
          derivedLabel: "Location shared",
        },
      },
    };
    handleUserAction(event);
  }, [conversationId, sending, replyStatus, handleUserAction]);

  const handleDenyLocation = useCallback(async () => {
    if (!conversationId || sending || replyStatus === "awaiting") return;
    const event: ChatEvent = {
      conversationId,
      sender: { type: "system" },
      payload: {
        messageType: "user_action",
        responseRequired: true,
        visibility: "shown",
        content: {
          data: { action: "location_denied" },
          derivedLabel: "Location not shared",
        },
      },
    };
    handleUserAction(event);
  }, [conversationId, sending, replyStatus, handleUserAction]);

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
      const expectsResponse =
        fullEvent.payload.messageType === "text" || fullEvent.payload.responseRequired === true;
      if (expectsResponse) startAwaitingReply(res.eventId);
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
      <div className="min-h-screen flex items-center justify-center bg-[#FAFAFA]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-[#5E23DC] border-t-transparent animate-spin" />
          <p className="text-sm text-[var(--text-placeholder)]">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-[#FAFAFA] max-w-[430px] mx-auto relative font-rubik">
      {/* Header – Houzy BETA left-aligned next to back; back = left chevron; logo = 4-point star per design */}
      <header className="flex-shrink-0 relative min-h-[56px] flex items-center pt-[env(safe-area-inset-top)] pb-2 px-3">
        <div className="absolute inset-0 bg-gradient-to-b from-white/80 to-white/10 pointer-events-none" />
        <div className="relative z-10 flex items-center gap-3 w-full h-10">
          <button type="button" className="w-10 h-10 flex-shrink-0 flex items-center justify-center rounded-[24px] bg-white shadow-[0_1px_4px_1px_rgba(100,100,100,0.06)] text-[#656565] hover:opacity-90 transition-opacity" onClick={() => {}} aria-label="Back">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 block">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <div className="flex items-center gap-2 h-10 pl-2 pr-3 py-2 rounded-[100px] bg-white shadow-[0_1px_4px_1px_rgba(100,100,100,0.06)] flex-shrink-0 min-w-0">
            <div className="w-6 h-6 flex items-center justify-center flex-shrink-0 shrink-0">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="#5E23DC" className="block">
                <path d="M12 0L14 8L22 12L14 16L12 24L10 16L2 12L10 8Z" />
              </svg>
            </div>
            <span className="text-sm font-normal text-[#222] whitespace-nowrap">Houzy</span>
            <span className="inline-flex items-center justify-center px-2 py-1 rounded-[100px] bg-[#f1ebff] shrink-0">
              <span className="text-[10px] font-normal tracking-[1.5px] bg-gradient-to-b from-[#5e23dc] to-[#22006b] bg-clip-text text-transparent">BETA</span>
            </span>
          </div>
          <div className="flex-1 min-w-0" aria-hidden="true" />
          <button
            type="button"
            onClick={() => setShowInfoModal(true)}
            className="w-10 h-10 min-w-[40px] flex-shrink-0 flex items-center justify-center rounded-[24px] bg-white shadow-[0_1px_4px_1px_rgba(100,100,100,0.06)] text-[#323232] hover:opacity-90 transition-opacity p-0"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="opacity-60 shrink-0 block">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 16v-4M12 8h.01" />
            </svg>
          </button>
        </div>
      </header>

      {/* Messages area – scout padding 16px; center intro when no messages */}
      <div
        ref={messagesScrollRef}
        className={`flex-1 overflow-y-auto px-3 ${!hasMessages ? "flex flex-col justify-center min-h-0" : ""}`}
      >
        {/* Empty state – scout-bot + design first screen: hero title + two rows of pills (stroke-only, edge fade) */}
        {!hasMessages && (
          <div className="flex flex-col items-center justify-center pt-10 pb-6 px-3 gap-7 min-h-0 flex-1 bg-[#FAFAFA]">
            <h1 className="text-2xl font-medium text-[#434343] text-center leading-7 max-w-[320px]">
              Hey, how can I<br />help you today?
            </h1>
            <div className="w-full flex flex-col items-center gap-3 max-w-full overflow-hidden">
              <div className="chips-marquee w-full pb-1">
                <div className="chips-tracks-wrapper">
                  <div className="chips-row-viewport">
                    <div className="chips-track chips-track-animate">
                      {[0, 1].map((copy) =>
                        SUGGESTIONS_ROW1.map((s) => (
                          <button
                            key={`${s.id}-${copy}`}
                            type="button"
                            onClick={() => handleSendText(s.text)}
                            className={`flex-shrink-0 flex items-center gap-2 min-h-[40px] py-2.5 px-4 rounded-[24px] border border-solid text-sm font-normal text-[#656565] whitespace-nowrap transition-all active:scale-[0.98] active:bg-[#f0f0f0] ${s.stroke === "pill-stroke-green" ? "bg-gradient-to-b from-[#ffffff] to-[#fafafa] border-[rgba(175,210,185,0.3)]" : s.stroke === "pill-stroke-coral" ? "bg-gradient-to-b from-[#ffffff] to-[#fafafa] border-[rgba(244,152,143,0.3)]" : s.stroke === "pill-stroke-blue" ? "bg-gradient-to-b from-[#ffffff] to-[#fafafa] border-[rgba(140,179,236,0.3)]" : "bg-gradient-to-b from-[#ffffff] to-[#fafafa] border-[rgba(255,211,109,0.4)]"}`}
                          >
                            <span className="text-base leading-none">{s.emoji}</span>
                            <span>{s.text}</span>
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                  <div className="chips-row-viewport">
                    <div className="chips-track chips-track-animate">
                      {[0, 1].map((copy) =>
                        SUGGESTIONS_ROW2.map((s) => (
                          <button
                            key={`${s.id}-${copy}`}
                            type="button"
                            onClick={() => handleSendText(s.text)}
                            className={`flex-shrink-0 flex items-center gap-2 min-h-[40px] py-2.5 px-4 rounded-[24px] border border-solid text-sm font-normal text-[#656565] whitespace-nowrap transition-all active:scale-[0.98] active:bg-[#f0f0f0] ${s.stroke === "pill-stroke-coral" ? "bg-gradient-to-b from-[#ffffff] to-[#fafafa] border-[rgba(244,152,143,0.3)]" : s.stroke === "pill-stroke-yellow" ? "bg-gradient-to-b from-[#ffffff] to-[#fafafa] border-[rgba(255,211,109,0.3)]" : s.stroke === "pill-stroke-purple" ? "bg-gradient-to-b from-[#ffffff] to-[#fafafa] border-[rgba(194,169,236,0.3)]" : "bg-gradient-to-b from-[#ffffff] to-[#fafafa] border-[rgba(255,165,226,0.3)]"}`}
                          >
                            <span className="text-base leading-none">{s.emoji}</span>
                            <span>{s.text}</span>
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Message list */}
        {hasMessages && (
          <div className="pt-3 pb-2">
            {/* View older messages */}
            {hasMoreOlder && (
              <div className="flex justify-center mb-3">
                <button
                  type="button"
                  onClick={loadMoreOlder}
                  disabled={loadingMoreOlder}
                  className="text-xs font-medium text-[#5E23DC] px-4 py-1.5 rounded-full bg-white border border-[#e1e2e8] shadow-sm hover:bg-[#f1ebff] disabled:opacity-50 transition-colors"
                >
                  {loadingMoreOlder ? "Loading…" : "View older messages"}
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
                onShareLocation={handleShareLocation}
                onDenyLocation={handleDenyLocation}
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

        {/* Error / timeout inline card — design: red X for timeout, Retry in red */}
        {(replyStatus === "timeout" || replyStatus === "error") && (
          <div className="mx-0 mb-3 flex items-center gap-3 px-4 py-3 bg-white rounded-2xl border border-[#e1e2e8]">
            <div className="w-8 h-8 rounded-full bg-red-50 flex items-center justify-center flex-shrink-0">
              {replyStatus === "timeout" ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2.5">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" strokeWidth="2">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
              )}
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
              className={`text-sm font-semibold hover:opacity-80 ${replyStatus === "timeout" ? "text-[#EF4444]" : "text-[#5E23DC]"}`}
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

        {/* Network error — design: "Network connection lost", Retry as link */}
        {streamStatus === "error" && replyStatus === "idle" && (
          <div className="mx-0 mb-3 flex items-center gap-3 px-4 py-3 bg-white rounded-2xl border border-[#e1e2e8]">
            <div className="w-8 h-8 rounded-full bg-red-50 flex items-center justify-center flex-shrink-0">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2">
                <path d="M1 6l5 5M5 6l1 5" /><path d="M23 6l-5 5M19 6l-1 5" />
                <path d="M12 13v5M12 20h.01" />
              </svg>
            </div>
            <div className="flex-1">
              <p className="text-sm text-[#111] font-medium">Network connection lost</p>
              <p className="text-xs text-[#767676]">Reconnecting…</p>
            </div>
            <button
              type="button"
              onClick={() => setReconnectKey((k) => k + 1)}
              className="text-sm font-semibold text-[#2563EB] underline hover:opacity-80"
            >
              Retry
            </button>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Back to bottom button */}
      {showBackToBottom && (
        <button
          type="button"
          onClick={scrollToBottom}
          className="absolute bottom-[80px] right-4 w-9 h-9 rounded-full bg-white border border-[#e1e2e8] shadow-md flex items-center justify-center text-[#767676] hover:text-[#222] transition-colors z-10"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M12 5v14M5 12l7 7 7-7" />
          </svg>
        </button>
      )}

      {/* Input bar – full width with minimal side padding */}
      <div className="flex-shrink-0 px-3 py-3 pb-[calc(16px+env(safe-area-inset-bottom,0px))] bg-transparent">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSendText(input);
          }}
          className="w-full"
        >
          <div className="w-full min-h-12 flex items-center rounded-xl border border-[#e1e2e8] bg-white px-4 pr-12 relative focus-within:border-[#5E23DC]/40 transition-colors">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={inputPlaceholder}
              className="flex-1 min-h-12 bg-transparent text-sm text-[#222] placeholder-[#767676] focus:outline-none caret-[#5E23DC]"
              disabled={sending}
            />
            {/* Stop / Send inside wrapper – scout style */}
            {replyStatus === "awaiting" ? (
              <button
                type="button"
                onClick={handleCancel}
                className="absolute right-3 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center rounded-full bg-[#5E23DC] text-white"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="white">
                  <rect x="6" y="6" width="12" height="12" rx="2" />
                </svg>
              </button>
            ) : (
              <button
                type="submit"
                disabled={sending || !input.trim()}
                className="absolute right-3 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center rounded-full disabled:opacity-100"
                aria-label="Send"
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="block shrink-0">
                  <circle cx="12" cy="12" r="12" fill={input.trim() && !sending ? "#5E23DC" : "#E1E2E8"} />
                  <path d="M18.5624 11.9935C18.5628 12.1605 18.5186 12.3246 18.4343 12.4688C18.35 12.6131 18.2288 12.7321 18.0831 12.8138L8.244 18.4394C8.1028 18.5194 7.9434 18.5618 7.78111 18.5624C7.63157 18.5616 7.48439 18.525 7.35187 18.4558C7.21934 18.3865 7.1053 18.2865 7.01928 18.1642C6.93326 18.0419 6.87775 17.9008 6.85738 17.7526C6.83702 17.6045 6.85238 17.4536 6.9022 17.3126L8.48423 12.628C8.49969 12.5822 8.52894 12.5423 8.56796 12.5138C8.60698 12.4853 8.65387 12.4695 8.7022 12.4687H12.9374C13.0016 12.4688 13.0652 12.4557 13.1242 12.4303C13.1832 12.4048 13.2363 12.3675 13.2803 12.3206C13.3243 12.2737 13.3581 12.2183 13.3797 12.1578C13.4014 12.0973 13.4104 12.033 13.4061 11.9689C13.3955 11.8483 13.3397 11.7363 13.25 11.6551C13.1602 11.5739 13.0431 11.5297 12.9221 11.5312H8.70337C8.65434 11.5312 8.60653 11.5158 8.5667 11.4872C8.52686 11.4586 8.49699 11.4182 8.4813 11.3718L6.89927 6.68781C6.8363 6.50827 6.82945 6.31382 6.87962 6.1303C6.92979 5.94678 7.03462 5.78286 7.18016 5.66033C7.32571 5.5378 7.5051 5.46246 7.69449 5.4443C7.88388 5.42615 8.07431 5.46605 8.24048 5.5587L18.0842 11.1773C18.2291 11.2587 18.3498 11.3772 18.4338 11.5206C18.5178 11.6641 18.5622 11.8272 18.5624 11.9935Z" fill="white" />
                </svg>
              </button>
            )}
          </div>
        </form>
        {!hasMessages && (
          <p className="text-[10px] font-normal leading-tight tracking-[0.6px] text-[#767676] text-center mt-2">
            Houzy is an AI assistant and may occasionally make mistakes
          </p>
        )}
      </div>

      {/* Login bottom sheet for shortlist / contact */}
      <LoginBottomSheet
        open={loginReason !== null}
        reason={loginReason}
        onClose={() => {
          pendingActionRef.current = null;
          setLoginReason(null);
        }}
        onLoggedIn={handleLoginSuccess}
      />

      {/* Info modal — bottom sheet */}
      {showInfoModal && (
        <div className="fixed inset-0 z-50 flex items-end" onClick={() => setShowInfoModal(false)}>
          <div className="absolute inset-0 bg-black/40" />
          <div
            className="relative w-full max-w-[430px] mx-auto bg-white rounded-t-2xl px-5 pt-5 pb-10"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-10 h-1 bg-[#e1e2e8] rounded-full mx-auto mb-5" />
            <div className="flex items-center gap-2 mb-4">
              <div className="w-7 h-7 rounded-lg bg-[#5E23DC] flex items-center justify-center">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="white">
                  <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z" />
                </svg>
              </div>
              <span className="font-semibold text-[15px] text-[#222]">About the responses</span>
            </div>
            <p className="text-sm text-[#767676] leading-relaxed mb-2">
              This response is powered by AI and may occasionally contain inaccuracies. Please verify important details before making any property decisions.
            </p>
            <button
              type="button"
              onClick={() => setShowInfoModal(false)}
              className="w-full py-4 rounded-xl bg-[#5E23DC] text-white font-medium text-sm hover:bg-[#4a1bb5] transition-colors"
            >
              Understood
            </button>
          </div>
        </div>
      )}

      {/* Toast notifications – scout-bot login toast style */}
      <div className="fixed bottom-24 left-1/2 -translate-x-1/2 flex flex-col gap-2 z-50 pointer-events-none" style={{ maxWidth: "380px", width: "calc(100% - 32px)" }}>
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className="flex items-center justify-between gap-3 px-4 py-3 bg-[#111] text-white rounded-2xl shadow-lg pointer-events-auto login-closed-toast"
          >
            <div className="flex items-center gap-2.5 flex-1 min-w-0">
              <span className="w-5 h-5 rounded-full flex items-center justify-center bg-[#0F8458] flex-shrink-0">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
                  <path d="M20 6L9 17l-5-5" />
                </svg>
              </span>
              <span className="text-sm font-medium truncate">{toast.message}</span>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <div className="w-px h-5 bg-white/30" />
            <button
              type="button"
              onClick={() => dismissToast(toast.id)}
              className="text-white/80 hover:text-white transition-colors"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
            </div>
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
