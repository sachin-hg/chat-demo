"use client";

import { Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  getConversationId,
  getHistory,
  sendMessage,
  sendMessageStream,
  cancelRequest,
  migrateChat,
} from "@/lib/api";
import { useAuth } from "@/components/auth/AuthProvider";
import type { ChatEventFromUser, ChatEventToUser } from "@/lib/contract-types";
import { ChatMessage } from "@/components/chat/ChatMessage";
import { useToast } from "@/components/ui/ToastProvider";

interface StoredMessage extends ChatEventToUser {
  messageId: string;
  createdAt: string;
}

const INITIAL_PAGE_SIZE = 6;
const LOAD_MORE_PAGE_SIZE = 6;
const REPLY_TIMEOUT_MS = 25000;

type ReplyStatus = "idle" | "sending" | "awaiting" | "timeout" | "error";

/** Clears awaiting when the turn ends: bot COMPLETED/ERRORED_AT_ML, or BE timeout (TIMED_OUT_BY_BE on any surfaced row). */
function isTerminalSseChatEvent(ev: ChatEventToUser): boolean {
  const ms = ev.messageState;
  if (ms === "TIMED_OUT_BY_BE") return true;
  return (
    ev.sender?.type === "bot" && (ms === "COMPLETED" || ms === "ERRORED_AT_ML")
  );
}

function isNetworkFailure(error: unknown): boolean {
  if (typeof navigator !== "undefined" && !navigator.onLine) return true;
  if (error instanceof TypeError) return true;
  const msg = (error as { message?: string })?.message?.toLowerCase?.() ?? "";
  return msg.includes("network") || msg.includes("fetch") || msg.includes("internet");
}

async function postAck(path: string, body: unknown): Promise<{ success: true }> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

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
function buildContextEvent(conversationId: string): ChatEventFromUser {
  return {
    conversationId,
    sender: { type: "system" },
    messageType: "context",
    responseRequired: false,
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
  };
}

const DEMO_DELAY_MS = 2000;
const DEMO_DOM_WAIT_MS = 600;
const DEMO_LOGIN_PHONE = "9876543210";
const DEMO_LOGIN_OTP = "1234";

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function demoLog(...args: unknown[]): void {
  // eslint-disable-next-line no-console
  console.log("[demo]", ...args);
}

function setInputValueReact(el: HTMLInputElement, value: string): void {
  const native = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
  if (native) {
    native.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  } else {
    el.value = value;
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }
}

function waitForSelector(
  selector: string,
  opts: { timeout?: number; within?: Element } = {}
): Promise<Element> {
  const { timeout = 15000, within = document.body } = opts;
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const run = () => {
      const el = within.querySelector(selector);
      if (el) {
        resolve(el);
        return;
      }
      if (Date.now() - start >= timeout) {
        reject(new Error(`Demo: timeout waiting for ${selector}`));
        return;
      }
      setTimeout(run, 80);
    };
    run();
  });
}

/** Wait until at least one node matches; returns the last match (newest carousel in chat). */
function waitForLastMatch(
  selector: string,
  opts: { timeout?: number; within?: Element } = {}
): Promise<Element> {
  const { timeout = 10000, within = document.body } = opts;
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const run = () => {
      const nodes = within.querySelectorAll(selector);
      const last = nodes[nodes.length - 1];
      if (last) {
        resolve(last);
        return;
      }
      if (Date.now() - start >= timeout) {
        reject(new Error(`Demo: timeout waiting for ${selector}`));
        return;
      }
      setTimeout(run, 80);
    };
    run();
  });
}

async function fillLoginAndSubmit(): Promise<void> {
  await delay(DEMO_DOM_WAIT_MS);
  demoLog("login: sheet detected, attempting autofill");
  const sheet = await waitForSelector('[data-demo="login-sheet"]');
  const phoneInput = sheet.querySelector<HTMLInputElement>('[data-demo="login-phone"]');
  const otpAlready = sheet.querySelector<HTMLInputElement>('[data-demo="login-otp-0"]');

  // Phone step
  if (phoneInput) {
    demoLog("login: on phone step, filling phone and continuing");
    phoneInput.focus();
    setInputValueReact(phoneInput, DEMO_LOGIN_PHONE);
    await delay(200);
    const continueBtn = sheet.querySelector<HTMLButtonElement>('[data-demo="login-continue"]');
    continueBtn?.click();
    await delay(600);
  }

  // OTP step (might already be visible, or appears after phone submit)
  try {
    demoLog("login: waiting for otp step");
    const otp0 = otpAlready ?? (await waitForSelector('[data-demo="login-otp-0"]', { timeout: 5000 }));
    const sheet2 = otp0.closest('[data-demo="login-sheet"]') ?? document.body;
    const digits = DEMO_LOGIN_OTP.split("");
    for (let i = 0; i < 4; i++) {
      const inp = sheet2.querySelector<HTMLInputElement>(`[data-demo="login-otp-${i}"]`);
      if (inp) {
        inp.focus();
        setInputValueReact(inp, digits[i]);
        await delay(80);
      }
    }
    await delay(200);
    const submitBtn = sheet2.querySelector<HTMLButtonElement>('[data-demo="login-otp-submit"]');
    submitBtn?.click();
    demoLog("login: submitted otp");
  } catch {
    // OTP step did not appear (e.g. already logged in / dismissed)
    demoLog("login: otp step did not appear (already logged in or dismissed)");
  }

  for (let i = 0; i < 30; i++) {
    await delay(200);
    if (!document.querySelector('[data-demo="login-sheet"]')) break;
  }
  demoLog("login: sheet closed (or timed out waiting for close)");
}

async function maybeHandleLogin(): Promise<void> {
  // After a click, login may or may not appear. Don't block the demo for long when already logged in.
  // Note: `offsetParent` can be null for fixed overlays; rely on presence + computed style.
  const selector = '[data-demo="login-sheet"]';
  try {
    const el = (await waitForSelector(selector, { timeout: 1500 })) as HTMLElement;
    const style = window.getComputedStyle(el);
    demoLog("login: popup appeared", { display: style.display, visibility: style.visibility, opacity: style.opacity });
    await fillLoginAndSubmit();
  } catch {
    demoLog("login: no popup appeared");
  }
}

type DemoClickTarget =
  | "property_carousel_shortlist"
  | "property_carousel_contact"
  | "property_carousel_learn_more"
  | "locality_carousel_learn_more"
  | "locality_carousel_show_properties"
  | "nested_qna_option"
  | "nested_qna_type_and_send"
  | "nested_qna_type_skip_send"
  | "download_brochure";

async function runDemoClick(step: {
  target: DemoClickTarget;
  propertyIndex?: number;
  localityIndex?: number;
  optionId?: string;
  text?: string;
  textThenSkipSecond?: boolean;
}): Promise<void> {
  await delay(DEMO_DOM_WAIT_MS);
  demoLog("click_ui: start", step);

  if (step.target === "property_carousel_shortlist" || step.target === "property_carousel_contact" || step.target === "property_carousel_learn_more") {
    demoLog("click_ui: waiting for property carousel");
    const last = await waitForLastMatch('[data-demo="property-carousel"]', { timeout: 10000 });
    const idx = step.propertyIndex ?? 0;
    const card = last.querySelector(`[data-demo-property-index="${idx}"]`);
    if (!card) throw new Error(`Demo: property card ${idx} not found`);
    const action =
      step.target === "property_carousel_shortlist"
        ? "shortlist"
        : step.target === "property_carousel_contact"
          ? "contact"
          : "learn-more";
    const btn = card.querySelector<HTMLElement>(`[data-demo-action="${action}"]`);
    if (!btn) throw new Error(`Demo: ${action} button not found`);
    btn.click();
    demoLog("click_ui: property carousel click", { index: idx, action });
  } else if (step.target === "locality_carousel_learn_more" || step.target === "locality_carousel_show_properties") {
    demoLog("click_ui: waiting for locality carousel");
    const last = await waitForLastMatch('[data-demo="locality-carousel"]', { timeout: 10000 });
    const idx = step.localityIndex ?? 0;
    const card = last.querySelector(`[data-demo-locality-index="${idx}"]`);
    if (!card) throw new Error(`Demo: locality card ${idx} not found`);
    const action = step.target === "locality_carousel_learn_more" ? "learn-more" : "show-properties";
    const btn = card.querySelector<HTMLElement>(`[data-demo-action="${action}"]`);
    if (!btn) throw new Error(`Demo: ${action} button not found`);
    btn.click();
    demoLog("click_ui: locality carousel click", { index: idx, action });
  } else if (step.target === "nested_qna_option") {
    demoLog("click_ui: waiting for nested_qna");
    const qna = await waitForSelector('[data-demo="nested-qna"]', { timeout: 8000 });
    const opt = step.optionId
      ? qna.querySelector<HTMLElement>(`[data-demo-option-id="${step.optionId}"]`)
      : qna.querySelector<HTMLElement>("[data-demo-option-id]");
    if (!opt) throw new Error("Demo: nested_qna option not found");
    opt.click();
    demoLog("click_ui: nested_qna option click", { optionId: step.optionId ?? "(first)" });
  } else if (step.target === "nested_qna_type_and_send") {
    demoLog("click_ui: waiting for nested_qna");
    const qna = await waitForSelector('[data-demo="nested-qna"]', { timeout: 8000 });
    const input = qna.querySelector<HTMLInputElement>('[data-demo-input="nested-qna-text"]');
    if (!input) throw new Error("Demo: nested_qna input not found");
    input.focus();
    setInputValueReact(input, step.text ?? "");
    await delay(200);
    const sendBtn = qna.querySelector<HTMLElement>('[data-demo-action="send"]');
    if (!sendBtn) throw new Error("Demo: nested_qna send not found");
    sendBtn.click();
    demoLog("click_ui: nested_qna type+send", { text: step.text ?? "" });
  } else if (step.target === "nested_qna_type_skip_send") {
    demoLog("click_ui: waiting for nested_qna");
    const qna = await waitForSelector('[data-demo="nested-qna"]', { timeout: 8000 });
    const input = qna.querySelector<HTMLInputElement>('[data-demo-input="nested-qna-text"]');
    if (!input) throw new Error("Demo: nested_qna input not found");
    input.focus();
    setInputValueReact(input, step.text ?? "");
    await delay(200);
    const nextBtn = qna.querySelector<HTMLElement>('[data-demo-action="next"]');
    if (nextBtn) nextBtn.click();
    await delay(400);
    const skipBtn = qna.querySelector<HTMLElement>('[data-demo-action="skip"]');
    if (skipBtn) skipBtn.click();
    await delay(200);
    const sendBtn = qna.querySelector<HTMLElement>('[data-demo-action="send"]');
    if (sendBtn) sendBtn.click();
    demoLog("click_ui: nested_qna type+next+skip+send", { text: step.text ?? "" });
  } else if (step.target === "download_brochure") {
    const block = document.querySelector('[data-demo="download-brochure"]');
    if (!block) throw new Error("Demo: download_brochure not found");
    const btn = block.querySelector<HTMLElement>('[data-demo-action="download"]');
    if (!btn) throw new Error("Demo: download button not found");
    btn.click();
    demoLog("click_ui: download brochure click");
  }

  await delay(500);
  await maybeHandleLogin();
  demoLog("click_ui: done", step.target);
}

function getLastBotMessageId(messages: StoredMessage[], templateId: string): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.sender?.type !== "bot") continue;
    const c = m.content as { templateId?: string } | undefined;
    if (c?.templateId === templateId) {
      const id = m.messageId;
      return id ?? null;
    }
  }
  return null;
}

type DemoStep =
  | { kind: "text"; text: string }
  | {
      kind: "click_ui";
      target: DemoClickTarget;
      propertyIndex?: number;
      localityIndex?: number;
      optionId?: string;
      text?: string;
      textThenSkipSecond?: boolean;
    }
  | { kind: "wait_for_user" };

const DEMO_STEPS: DemoStep[] = [
  { kind: "text", text: "tell me about modiji" },
  { kind: "text", text: "show me properties according to my preference" },
  { kind: "click_ui", target: "property_carousel_shortlist", propertyIndex: 0 },
  { kind: "click_ui", target: "property_carousel_contact", propertyIndex: 1 },
  { kind: "click_ui", target: "property_carousel_learn_more", propertyIndex: 0 },
  { kind: "text", text: "shortlist this property" },
  { kind: "text", text: "contact seller of this property" },
  { kind: "text", text: "locality comparison of both properties" },
  { kind: "click_ui", target: "locality_carousel_learn_more", localityIndex: 0 },
  { kind: "click_ui", target: "locality_carousel_show_properties", localityIndex: 0 },
  { kind: "text", text: "price trend of first locality" },
  { kind: "text", text: "rating reviews of first locality" },
  { kind: "text", text: "transaction data of first locality" },
  { kind: "text", text: "tell more about sector 21" },
  { kind: "click_ui", target: "nested_qna_option", optionId: "uuid3" },
  { kind: "text", text: "to learn more about sector 32" },
  { kind: "click_ui", target: "nested_qna_type_and_send", text: "sector 32 faridabad" },
  { kind: "text", text: "locality comparison of sector 32, sector 21" },
  { kind: "click_ui", target: "nested_qna_type_skip_send", text: "sector 32 gurgaon", textThenSkipSecond: true },
  { kind: "text", text: "show properties near me" },
  { kind: "wait_for_user" },
  { kind: "text", text: "properties near me" },
  { kind: "wait_for_user" },
  { kind: "text", text: "3bhk properties near me" },
  { kind: "click_ui", target: "property_carousel_learn_more", propertyIndex: 0 },
  { kind: "text", text: "show me brochure" },
  { kind: "click_ui", target: "download_brochure" },
  { kind: "text", text: "show me more properties in sector 32, sector 21" },
];

function ChatPageContent() {
  const searchParams = useSearchParams();
  const isDemo = searchParams.get("demo") === "true";

  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<StoredMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [replyStatus, setReplyStatus] = useState<ReplyStatus>("idle");
  const [awaitingElapsedSec, setAwaitingElapsedSec] = useState(0);
  const [hasMoreOlder, setHasMoreOlder] = useState(false);
  const [loadingMoreOlder, setLoadingMoreOlder] = useState(false);
  const [input, setInput] = useState("");
  const toast = useToast();
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [showBackToBottom, setShowBackToBottom] = useState(false);
  const [isOffline, setIsOffline] = useState<boolean>(
    typeof navigator !== "undefined" ? !navigator.onLine : false
  );
  const [networkError, setNetworkError] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const knownMessageIdsRef = useRef<Set<string>>(new Set());
  const replyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const awaitingElapsedIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastSentEventRef = useRef<ChatEventFromUser | null>(null);
  const lastRequestMessageIdRef = useRef<string | null>(null);
  const currentPendingLocalMessageIdRef = useRef<string | null>(null);
  const cancelledPendingLocalIdsRef = useRef<Set<string>>(new Set());
  const activeSendStreamAbortRef = useRef<AbortController | null>(null);
  const messagesScrollRef = useRef<HTMLDivElement | null>(null);
  const scrollRestoreAfterPrependRef = useRef<{ scrollTop: number; scrollHeight: number } | null>(null);
  const lastRenderedMessageIdRef = useRef<string | undefined>(undefined);
  const lastMessagesRef = useRef<StoredMessage[]>([]);
  const demoStepIndexRef = useRef(0);
  const demoWaitingForUserRef = useRef(false);
  const prevReplyStatusRef = useRef<ReplyStatus>("idle");
  const demoTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleSendTextRef = useRef<(text: string) => void>(() => {});
  const hasMigratedRef = useRef(false);
  const auth = useAuth();
  const showToast = useCallback((message: string) => toast.show(message), [toast]);

  lastMessagesRef.current = messages;

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  const clearReplyWaiting = useCallback(() => {
    if (replyTimeoutRef.current) {
      clearTimeout(replyTimeoutRef.current);
      replyTimeoutRef.current = null;
    }
    if (awaitingElapsedIntervalRef.current) {
      clearInterval(awaitingElapsedIntervalRef.current);
      awaitingElapsedIntervalRef.current = null;
    }
    setAwaitingElapsedSec(0);
    setReplyStatus("idle");
  }, []);

  const cancelAndHideCurrentRequest = useCallback(async () => {
    activeSendStreamAbortRef.current?.abort();
    activeSendStreamAbortRef.current = null;

    const ackedMessageId = lastRequestMessageIdRef.current;
    const pendingLocalId = currentPendingLocalMessageIdRef.current;

    if (ackedMessageId) {
      setMessages((prev) =>
        prev.map((m) => (m.messageId === ackedMessageId ? { ...m, messageState: "CANCELLED_BY_USER" } : m))
      );
      try {
        if (conversationId) await cancelRequest(ackedMessageId, conversationId);
      } catch (_) {}
      lastRequestMessageIdRef.current = null;
    } else if (pendingLocalId) {
      cancelledPendingLocalIdsRef.current.add(pendingLocalId);
      setMessages((prev) =>
        prev.map((m) => (m.messageId === pendingLocalId ? { ...m, messageState: "CANCELLED_BY_USER" } : m))
      );
      currentPendingLocalMessageIdRef.current = null;
    }

    clearReplyWaiting();
    setSending(false);
  }, [clearReplyWaiting, conversationId]);

  // Load conversation and initial history
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { conversationId: cid } = await getConversationId(isDemo);
        if (cancelled) return;
        setConversationId(cid);
        // Context is fire-and-forget in Phase 1 (no response expected).
        // Sent on each chat open to keep ML context fresh.
        sendMessage(buildContextEvent(cid)).catch(() => {});
        const hist = await getHistory(cid, { page_size: INITIAL_PAGE_SIZE });
        if (cancelled) return;
        const list = hist.messages as StoredMessage[];
        setMessages(list);
        setHasMoreOlder(hist.hasMore);
        list.forEach((m) => m.messageId && knownMessageIdsRef.current.add(m.messageId));
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

  // Login-time migration (mock): move anon c1 history into logged-in c2 and switch FE to c2.
  useEffect(() => {
    if (!auth.isLoggedIn || !conversationId || hasMigratedRef.current) return;
    hasMigratedRef.current = true;
    (async () => {
      try {
        const res = await migrateChat(conversationId);
        const newConversationId = res.newConversationId;
        if (!newConversationId || newConversationId === conversationId) return;
        setConversationId(newConversationId);
        // Do not refetch history here (spec: optional after migrate). Keep current transcript; BE owns merged c2 state on next get-history.
        setMessages((prev) =>
          prev.map((m) => ({ ...m, conversationId: newConversationId }))
        );
      } catch (e) {
        console.error("chat migration failed", e);
      }
    })();
  }, [auth.isLoggedIn, conversationId]);

  // Note: Phase-1 request-scoped streaming.
  // responseRequired=true uses send-message-streamed; responseRequired=false uses send-message JSON.

  useEffect(() => {
    const lastId = messages[messages.length - 1]?.messageId;
    if (lastId !== lastRenderedMessageIdRef.current) {
      lastRenderedMessageIdRef.current = lastId;
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
      // Show only when user is significantly above bottom (at least half viewport).
      setShowBackToBottom(distFromBottom > el.clientHeight * 0.5);
    };
    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => el.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    const onOnline = () => {
      setIsOffline(false);
      setNetworkError(false);
    };
    const onOffline = () => {
      setIsOffline(true);
      setNetworkError(true);
    };
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  const loadMoreOlder = useCallback(async () => {
    if (!conversationId || loadingMoreOlder || messages.length === 0) return;
    const firstMessageId = messages[0].messageId;
    if (!firstMessageId) return;
    setLoadingMoreOlder(true);
    try {
      const hist = await getHistory(conversationId, {
        messages_before: firstMessageId,
        page_size: LOAD_MORE_PAGE_SIZE,
      });
      const list = hist.messages as StoredMessage[];
      const toPrepend = list.filter(
        (m) => m.messageId && !knownMessageIdsRef.current.has(m.messageId)
      );
      toPrepend.forEach((m) => m.messageId && knownMessageIdsRef.current.add(m.messageId));
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
    (_userMessageId: string) => {
      setAwaitingElapsedSec(0);
      setReplyStatus("awaiting");

      awaitingElapsedIntervalRef.current = setInterval(() => {
        setAwaitingElapsedSec((s) => (s >= 25 ? 25 : s + 1));
      }, 1000);

      replyTimeoutRef.current = setTimeout(() => {
        replyTimeoutRef.current = null;
        if (awaitingElapsedIntervalRef.current) {
          clearInterval(awaitingElapsedIntervalRef.current);
          awaitingElapsedIntervalRef.current = null;
        }
        setAwaitingElapsedSec(0);
        setReplyStatus("timeout");
        activeSendStreamAbortRef.current?.abort();
        activeSendStreamAbortRef.current = null;
      }, REPLY_TIMEOUT_MS);
    },
    []
  );

  const handleSendText = useCallback(
    async (text: string) => {
      if (!conversationId || !text.trim() || sending || replyStatus === "awaiting") return;
      if (isOffline) {
        setNetworkError(true);
        return;
      }
      const trimmed = text.trim();
      if (isDemo) demoLog("text: sending", trimmed);
      const event: ChatEventFromUser = {
        conversationId,
        sender: { type: "user" },
        messageType: "text",
        responseRequired: true,
        content: { text: trimmed },
      };
      lastSentEventRef.current = event;
      const pendingId = `pending-${Date.now()}`;
      const userMessage: StoredMessage = {
        ...event,
        messageId: pendingId,
        messageState: "PENDING",
        createdAt: new Date().toISOString(),
      };
      currentPendingLocalMessageIdRef.current = pendingId;
      lastRequestMessageIdRef.current = null;
      setMessages((prev) => [...prev, userMessage]);
      setInput("");
      setSending(true);
      setReplyStatus("sending");
      const abortController = new AbortController();
      activeSendStreamAbortRef.current = abortController;
      let ackReceived = false;

      try {
        await sendMessageStream(
          event,
          {
            onAck: (ack) => {
              setNetworkError(false);
              ackReceived = true;
              currentPendingLocalMessageIdRef.current = null;
              if (cancelledPendingLocalIdsRef.current.has(pendingId)) {
                cancelledPendingLocalIdsRef.current.delete(pendingId);
                setMessages((prev) =>
                  prev.map((m) =>
                    m.messageId === pendingId
                      ? { ...m, messageId: ack.messageId, messageState: "CANCELLED_BY_USER" }
                      : m
                  )
                );
                if (conversationId) cancelRequest(ack.messageId, conversationId).catch(() => {});
                return;
              }
              lastRequestMessageIdRef.current = ack.messageId;
              knownMessageIdsRef.current.add(ack.messageId);
              setMessages((prev) =>
                prev.map((m) => (m.messageId === pendingId ? { ...m, messageId: ack.messageId } : m))
              );
              startAwaitingReply(ack.messageId);
            },
            onChatEvent: (botEvent) => {
              if (!botEvent.messageId || knownMessageIdsRef.current.has(botEvent.messageId)) return;
              knownMessageIdsRef.current.add(botEvent.messageId);
              setMessages((prev) => [...prev, botEvent]);
              if (isTerminalSseChatEvent(botEvent)) clearReplyWaiting();
            },
          },
          { signal: abortController.signal }
        );
      } catch (e) {
        // Abort can happen on cancel/timeout; don't flip UI into "error".
        if (abortController.signal.aborted) return;
        console.error(e);
        if (isNetworkFailure(e)) setNetworkError(true);
        setReplyStatus("error");
        if (!ackReceived) setMessages((prev) => prev.filter((m) => m.messageId !== pendingId));
      } finally {
        if (activeSendStreamAbortRef.current === abortController) activeSendStreamAbortRef.current = null;
        setSending(false);
      }
    },
    [
      conversationId,
      sending,
      replyStatus,
      startAwaitingReply,
      clearReplyWaiting,
    ]
  );

  // Keep a stable callable for demo runner (avoid effect cleanup clearing timers due to callback identity changes).
  useEffect(() => {
    handleSendTextRef.current = (text: string) => {
      handleSendText(text);
    };
  }, [handleSendText]);

  const handleUserAction = useCallback(
    async (event: ChatEventFromUser) => {
      if (!conversationId || sending || replyStatus === "awaiting") return;
      if (isOffline) {
        setNetworkError(true);
        return;
      }

      const data = (event.content?.data ?? {}) as Record<string, unknown>;
      const rawAction = (data.action as string | undefined) ?? (data.actionId as string | undefined);
      if (isDemo) demoLog("user_action: sending", rawAction ?? "(unknown)", data);

      const fullEvent: ChatEventFromUser = { ...event, conversationId };
      lastSentEventRef.current = fullEvent;
      const pendingId = `pending-${Date.now()}`;
      const stored: StoredMessage = {
        ...fullEvent,
        messageId: pendingId,
        messageState: "PENDING",
        createdAt: new Date().toISOString(),
      };
      currentPendingLocalMessageIdRef.current = pendingId;
      lastRequestMessageIdRef.current = null;
      setMessages((prev) => [...prev, stored]);
      setSending(true);
      setReplyStatus("sending");
      const abortController = new AbortController();
      activeSendStreamAbortRef.current = abortController;
      let ackReceived = false;
      const expectsResponse = fullEvent.responseRequired === true;

      try {
        if (!expectsResponse) {
          const ack = await sendMessage(fullEvent);
          setNetworkError(false);
          ackReceived = true;
          currentPendingLocalMessageIdRef.current = null;
          if (cancelledPendingLocalIdsRef.current.has(pendingId)) {
            cancelledPendingLocalIdsRef.current.delete(pendingId);
            setMessages((prev) =>
              prev.map((m) =>
                m.messageId === pendingId
                  ? { ...m, messageId: ack.messageId, messageState: "CANCELLED_BY_USER" }
                  : m
              )
            );
            if (conversationId) cancelRequest(ack.messageId, conversationId).catch(() => {});
            return;
          }
          lastRequestMessageIdRef.current = ack.messageId;
          knownMessageIdsRef.current.add(ack.messageId);
          setMessages((prev) =>
            prev.map((m) => (m.messageId === pendingId ? { ...m, messageId: ack.messageId } : m))
          );
          setReplyStatus("idle");
        } else {
          await sendMessageStream(
            fullEvent,
            {
              onAck: (ack) => {
                setNetworkError(false);
                ackReceived = true;
                currentPendingLocalMessageIdRef.current = null;
                if (cancelledPendingLocalIdsRef.current.has(pendingId)) {
                  cancelledPendingLocalIdsRef.current.delete(pendingId);
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.messageId === pendingId
                        ? { ...m, messageId: ack.messageId, messageState: "CANCELLED_BY_USER" }
                        : m
                    )
                  );
                  if (conversationId) cancelRequest(ack.messageId, conversationId).catch(() => {});
                  return;
                }
                lastRequestMessageIdRef.current = ack.messageId;
                knownMessageIdsRef.current.add(ack.messageId);
                setMessages((prev) =>
                  prev.map((m) => (m.messageId === pendingId ? { ...m, messageId: ack.messageId } : m))
                );

                startAwaitingReply(ack.messageId);
              },
              onChatEvent: (botEvent) => {
                if (!botEvent.messageId || knownMessageIdsRef.current.has(botEvent.messageId)) return;
                knownMessageIdsRef.current.add(botEvent.messageId);
                setMessages((prev) => [...prev, botEvent]);
                if (isTerminalSseChatEvent(botEvent)) clearReplyWaiting();
              },
            },
            { signal: abortController.signal }
          );
        }
      } catch (e) {
        // Abort can happen on cancel/timeout; don't flip UI into "error".
        if (abortController.signal.aborted) return;
        console.error(e);
        if (isNetworkFailure(e)) setNetworkError(true);
        setReplyStatus("error");
        if (!ackReceived) setMessages((prev) => prev.filter((m) => m.messageId !== pendingId));
      } finally {
        if (activeSendStreamAbortRef.current === abortController) activeSendStreamAbortRef.current = null;
        setSending(false);
      }
    },
    [
      conversationId,
      sending,
      replyStatus,
      startAwaitingReply,
      clearReplyWaiting,
    ]
  );

  // Demo autoplay: run first step after delay when ready
  useEffect(() => {
    if (!isDemo || !conversationId || loading || demoStepIndexRef.current !== 0) return;
    const t = setTimeout(async () => {
      const step = DEMO_STEPS[0];
      demoLog("step: start", { idx: 0, step });
      if (step.kind === "wait_for_user") {
        demoLog("step: wait_for_user (pause)");
        demoWaitingForUserRef.current = true;
        demoStepIndexRef.current = 1;
        return;
      }
      if (step.kind === "text") {
        demoStepIndexRef.current = 1;
        handleSendText(step.text);
      } else if (step.kind === "click_ui") {
        demoStepIndexRef.current = 1;
        try {
          await runDemoClick(step);
        } catch (e) {
          console.error("Demo click failed:", e);
        }
      }
    }, DEMO_DELAY_MS);
    return () => clearTimeout(t);
  }, [isDemo, conversationId, loading, handleSendText]);

  // Demo autoplay: run next step 2s after bot reply (idle), or after user action when waiting_for_user
  useEffect(() => {
    const prev = prevReplyStatusRef.current;
    prevReplyStatusRef.current = replyStatus;
    if (!isDemo) return;

    if (prev !== replyStatus) demoLog("replyStatus:", { from: prev, to: replyStatus });

    if (replyStatus === "idle" && demoWaitingForUserRef.current) {
      demoLog("wait_for_user: resumed (bot replied)");
      demoWaitingForUserRef.current = false;
      const idx = demoStepIndexRef.current;
      if (idx >= DEMO_STEPS.length) return;
      demoStepIndexRef.current = idx + 1;
      if (demoTimeoutRef.current) clearTimeout(demoTimeoutRef.current);
      demoLog("step: scheduled", { idx, afterMs: DEMO_DELAY_MS });
      demoTimeoutRef.current = setTimeout(async () => {
        demoTimeoutRef.current = null;
        const step = DEMO_STEPS[idx];
        demoLog("step: start", { idx, step });
        if (step.kind === "text") {
          handleSendTextRef.current(step.text);
        } else if (step.kind === "click_ui") {
          try {
            await runDemoClick(step);
          } catch (e) {
            console.error("Demo click failed:", e);
          }
        } else if (step.kind === "wait_for_user") {
          demoLog("step: wait_for_user (pause)");
          demoWaitingForUserRef.current = true;
        }
      }, DEMO_DELAY_MS);
      return;
    }

    if (
      replyStatus !== "idle" ||
      prev === "idle" ||
      demoStepIndexRef.current < 1 ||
      demoStepIndexRef.current >= DEMO_STEPS.length
    )
      return;
    if (demoTimeoutRef.current) clearTimeout(demoTimeoutRef.current);
    const idx = demoStepIndexRef.current;
    demoLog("step: scheduled", { idx, afterMs: DEMO_DELAY_MS });
    demoTimeoutRef.current = setTimeout(async () => {
      demoTimeoutRef.current = null;
      demoStepIndexRef.current = idx + 1;
      const step = DEMO_STEPS[idx];
      demoLog("step: start", { idx, step });
      if (step.kind === "wait_for_user") {
        demoLog("step: wait_for_user (pause)");
        demoWaitingForUserRef.current = true;
        return;
      }
      if (step.kind === "text") {
        if (conversationId) handleSendTextRef.current(step.text);
      } else if (step.kind === "click_ui") {
        try {
          await runDemoClick(step);
        } catch (e) {
          console.error("Demo click failed:", e);
        }
      }
    }, DEMO_DELAY_MS);
    // No cleanup here: callback identity changes can cause this effect to re-run and clear the timer before it fires.
  }, [isDemo, replyStatus, conversationId, handleSendText]);

  // Cleanup timers on unmount only
  useEffect(() => {
    return () => {
      if (demoTimeoutRef.current) {
        clearTimeout(demoTimeoutRef.current);
        demoTimeoutRef.current = null;
      }
    };
  }, []);

  const handleRetry = useCallback(async () => {
    if (isOffline) {
      setNetworkError(true);
      return;
    }
    setNetworkError(false);
    const event = lastSentEventRef.current;
    if (!event || !conversationId || sending) return;
    await cancelAndHideCurrentRequest();
    const fullEvent: ChatEventFromUser = { ...event, conversationId };
    setSending(true);
    setReplyStatus("sending");
    const abortController = new AbortController();
    activeSendStreamAbortRef.current = abortController;

    const expectsResponse =
      fullEvent.messageType === "text" || fullEvent.responseRequired === true;
    try {
      await sendMessageStream(
        fullEvent,
        {
          onAck: (ack) => {
            lastRequestMessageIdRef.current = ack.messageId;
            knownMessageIdsRef.current.add(ack.messageId);
            if (expectsResponse) startAwaitingReply(ack.messageId);
            else setReplyStatus("idle");
          },
          onChatEvent: (botEvent) => {
            if (!botEvent.messageId || knownMessageIdsRef.current.has(botEvent.messageId)) return;
            knownMessageIdsRef.current.add(botEvent.messageId);
            setMessages((prev) => [...prev, botEvent]);
            if (isTerminalSseChatEvent(botEvent)) clearReplyWaiting();
          },
        },
        { signal: abortController.signal }
      );
    } catch (e) {
      if (!abortController.signal.aborted) {
        console.error(e);
        if (isNetworkFailure(e)) setNetworkError(true);
        setReplyStatus("error");
      }
    } finally {
      if (activeSendStreamAbortRef.current === abortController) activeSendStreamAbortRef.current = null;
      setSending(false);
    }
  }, [conversationId, sending, startAwaitingReply, cancelAndHideCurrentRequest, isOffline]);

  const handleCancel = useCallback(async () => {
    if (replyStatus !== "awaiting") return;
    await cancelAndHideCurrentRequest();
  }, [replyStatus, cancelAndHideCurrentRequest]);

  const handleDismiss = useCallback(async () => {
    await cancelAndHideCurrentRequest();
  }, [cancelAndHideCurrentRequest]);

  // Visible messages (filter context/analytics, cancelled user rows, hidden user_action)
  const visibleMessages = messages.filter((m) => {
    if (m.messageType === "context" || m.messageType === "analytics") return false;
    if (m.messageState === "CANCELLED_BY_USER") return false;
    if (m.messageType === "user_action" && m.isVisible === false) return false;
    return true;
  });
  const hasMessages = visibleMessages.length > 0;
  const lastVisible = visibleMessages[visibleMessages.length - 1];
  const hasStickyNestedQna =
    lastVisible?.sender?.type === "bot" &&
    lastVisible?.messageType === "template" &&
    (lastVisible?.content as { templateId?: string } | undefined)?.templateId === "nested_qna";

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

            {visibleMessages.map((msg, index) => (
              <ChatMessage
                key={
                  msg.messageId ??
                  Math.random()
                }
                event={msg}
                onUserAction={handleUserAction}
                // onCallNow={handleCallNow}
                actionsDisabled={replyStatus === "awaiting" || isOffline}
                isLastMessage={index === visibleMessages.length - 1}
              />
            ))}
          </div>
        )}

        {(isOffline || networkError) && (
          <div className="mx-0 mb-3 flex items-center gap-3 px-4 py-3 bg-white rounded-2xl border border-[#e9d7d7]">
            <div className="w-6 h-6 rounded-full flex items-center justify-center text-[#D04848]">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M2 8l10-4 10 4-10 4-10-4z" />
                <path d="M6 10v4c0 3 3 6 6 6" />
                <path d="M22 22l-5-5" />
                <path d="M22 17l-5 5" />
              </svg>
            </div>
            <p className="text-sm text-[#4A4A4A] flex-1">Network connection lost</p>
            <button
              type="button"
              onClick={handleRetry}
              className="text-sm font-semibold text-[#4A4A4A] underline underline-offset-2"
            >
              Retry
            </button>
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
              onClick={handleDismiss}
              className="text-sm font-semibold text-[#767676] hover:opacity-80"
            >
              Dismiss
            </button>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Back to bottom button */}
      {hasMessages && showBackToBottom && (
        <button
          type="button"
          onClick={scrollToBottom}
          className="absolute left-1/2 -translate-x-1/2 bottom-[88px] w-12 h-12 rounded-full bg-white border border-[#f0f0f0] shadow-[0_2px_10px_rgba(0,0,0,0.12)] flex items-center justify-center text-[#111] hover:bg-[#fafafa] transition-colors z-20"
          aria-label="Back to bottom"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 5v14" />
            <path d="M6 13l6 6 6-6" />
          </svg>
        </button>
      )}

      {/* Input bar – hidden when sticky nested_qna is active */}
      {!hasStickyNestedQna && (
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
                disabled={sending || !input.trim() || isOffline}
                  className="absolute right-3 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center rounded-full disabled:opacity-100"
                  aria-label="Send"
                >
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="block shrink-0">
                    <circle cx="12" cy="12" r="12" fill={input.trim() && !sending && !isOffline ? "#5E23DC" : "#E1E2E8"} />
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
      )}

      {/* Login bottom sheet for shortlist / contact */}
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
