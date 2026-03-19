"use client";

import { useState } from "react";
import { useToast } from "@/components/ui/ToastProvider";

const THUMBS_DOWN_OPTIONS = [
  "Results not relevant",
  "Incorrect information",
  "Too long/too generic",
  "Slow response",
  "Tone/style issue",
];

export function FeedbackRow({
  copyText,
  analyticsDimensions,
}: {
  copyText?: string;
  analyticsDimensions?: {
    template_id?: string;
    message_type?: string;
    sender?: string;
  };
}) {
  const propsAnalyticsDims = {
    template_id: analyticsDimensions?.template_id ?? "",
    message_type: analyticsDimensions?.message_type ?? "",
    sender: analyticsDimensions?.sender ?? "",
  };
  const [state, setState] = useState<"neutral" | "up" | "down">("neutral");
  const [showSheet, setShowSheet] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [suggestion, setSuggestion] = useState("");
  const toast = useToast();

  const sendAnalytics = (label: string, userMessage?: string) => {
    // Phase 2: wire to analytics. For now, log to console as requested.
    const trimmedUserMessage = userMessage?.trim();
    console.log("sendAnalytics", {
      category: "chatbot",
      action: "message_feedback",
      label,
      dimensions: {
        template_id: propsAnalyticsDims.template_id,
        message_type: propsAnalyticsDims.message_type,
        sender: propsAnalyticsDims.sender,
        ...(trimmedUserMessage ? { user_message: trimmedUserMessage } : {}),
      },
    });
  };
  const handleUp = () => {
    if (state === "up") return;
    setState("up");
    sendAnalytics("thumbs_up");
    toast.show("Thank you for your feedback!");
  };

  const handleDown = () => {
    if (state === "down") {
      setShowSheet(true);
      return;
    }
    setState("down");
    setShowSheet(true);
  };

  const handleSubmitFeedback = () => {
    setShowSheet(false);
    // For thumbs down, send the selected option label.
    const selectedLabel = Array.from(selected)[0] ?? "";
    sendAnalytics(selectedLabel, suggestion);
    toast.show("Thank you for your feedback!");
  };

  const toggleOption = (opt: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(opt)) next.delete(opt);
      else next.add(opt);
      return next;
    });
  };

  return (
    <>
      <div className="flex items-center gap-3 mt-1.5">
        {/* Thumbs up */}
        <button type="button" onClick={handleUp} className="text-[#767676] hover:text-[#111] transition-colors">
          {state === "up" ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="#111">
              <path d="M1 21h4V9H1v12zm22-11c0-1.1-.9-2-2-2h-6.31l.95-4.57.03-.32c0-.41-.17-.79-.44-1.06L14.17 1 7.59 7.59C7.22 7.95 7 8.45 7 9v10c0 1.1.9 2 2 2h9c.83 0 1.54-.5 1.84-1.22l3.02-7.05c.09-.23.14-.47.14-.73v-2z" />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
              <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3" />
            </svg>
          )}
        </button>

        {/* Thumbs down */}
        <button type="button" onClick={handleDown} className="text-[#767676] hover:text-[#111] transition-colors">
          {state === "down" ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="#111">
              <path d="M15 3H6c-.83 0-1.54.5-1.84 1.22l-3.02 7.05c-.09.23-.14.47-.14.73v2c0 1.1.9 2 2 2h6.31l-.95 4.57-.03.32c0 .41.17.79.44 1.06L9.83 23l6.59-6.59c.36-.36.58-.86.58-1.41V5c0-1.1-.9-2-2-2zm4 0v12h4V3h-4z" />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
              <path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zm7-13h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17" />
            </svg>
          )}
        </button>

        {/* Copy */}
        {copyText ? (
          <button
            type="button"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(copyText);
                toast.show("Copied to clipboard");
              } catch {
                toast.show("Copy failed");
              }
            }}
            className="text-[#767676] hover:text-[#111] transition-colors"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>
          </button>
        ) : null}
      </div>

      {/* Thumbs down bottom sheet */}
      {showSheet && (
        <div className="fixed inset-0 z-50 flex items-end" onClick={() => setShowSheet(false)}>
          <div className="absolute inset-0 bg-black/40" />
          <div
            className="relative w-full bg-white rounded-t-2xl px-5 pt-5 pb-8 max-h-[85vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-10 h-1 bg-[#E8E8E8] rounded-full mx-auto mb-5" />
            <p className="font-bold text-base text-[#111] mb-4">Share feedback</p>
            <div className="space-y-2.5 mb-5">
              {THUMBS_DOWN_OPTIONS.map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => toggleOption(opt)}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border text-sm text-left transition-colors ${
                    selected.has(opt) ? "border-[#6033EE] bg-[#EDE8FF] text-[#6033EE]" : "border-[#E8E8E8] text-[#111]"
                  }`}
                >
                  <div
                    className={`w-5 h-5 rounded flex items-center justify-center flex-shrink-0 border ${
                      selected.has(opt) ? "bg-[#6033EE] border-[#6033EE]" : "border-[#BBBBBB]"
                    }`}
                  >
                    {selected.has(opt) && (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="white">
                        <path d="M20 6L9 17l-5-5" />
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                  </div>
                  {opt}
                </button>
              ))}
            </div>
            <p className="font-semibold text-sm text-[#111] mb-2">How can we improve?</p>
            <textarea
              value={suggestion}
              onChange={(e) => setSuggestion(e.target.value)}
              placeholder="Share your suggestions (Optional)"
              rows={4}
              className="w-full px-4 py-3 rounded-xl border border-[#E8E8E8] text-sm resize-none focus:outline-none focus:border-[#6033EE] text-[#111] placeholder-[#BBBBBB]"
            />
            <button
              type="button"
              onClick={handleSubmitFeedback}
              className="w-full mt-4 py-3.5 rounded-2xl bg-[#6033EE] text-white font-semibold text-sm hover:bg-[#4f27d4] transition-colors"
            >
              Submit
            </button>
          </div>
        </div>
      )}
    </>
  );
}

