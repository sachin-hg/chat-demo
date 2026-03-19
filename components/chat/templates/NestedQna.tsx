"use client";

import { useMemo, useRef, useState } from "react";

export interface NestedQnaOption {
  id: string;
  title?: string;
  name?: string;
  type?: string;
  city?: string;
}

export interface NestedQnaSelection {
  questionId: string;
  title?: string;
  type?: string;
  entity?: string;
  options: NestedQnaOption[];
}

export interface NestedQnaPayload {
  action: "nested_qna_selection";
  selections: { questionId: string; selection?: string; text?: string; skipped?: true }[];
}

interface Props {
  selections: NestedQnaSelection[];
  onComplete: (data: NestedQnaPayload, derivedLabel: string) => void;
  disabled?: boolean;
}

function optionLabel(opt: NestedQnaOption): string {
  return opt.title ?? opt.name ?? "";
}

function optionSubLabel(opt: NestedQnaOption): string {
  if (opt.type && opt.city) return `${opt.type}  |  ${opt.city}`;
  return opt.type ?? opt.city ?? "";
}

export function NestedQna({
  selections,
  onComplete,
  disabled = false,
}: Props) {
  if (!selections?.length) return null;

  const isSingle = selections.length === 1;
  const [currentIdx, setCurrentIdx] = useState(0);
  const current = selections[Math.min(currentIdx, selections.length - 1)];
  const currentQid = current.questionId;
  const isLast = currentIdx === selections.length - 1;

  const didSubmitRef = useRef(false);

  const [answers, setAnswers] = useState<
    Record<string, { selectionId?: string; selectionLabel?: string; text?: string; skipped?: true }>
  >({});

  const currentText = answers[currentQid]?.text ?? "";
  const currentSelectedId = answers[currentQid]?.selectionId;

  const allDone = useMemo(() => {
    if (isSingle) return true; // single submits immediately
    return selections.every((s) => {
      const a = answers[s.questionId];
      return Boolean(a?.selectionId) || Boolean(a?.text?.trim()) || a?.skipped === true;
    });
  }, [answers, selections, isSingle]);

  const buildPayloadAndLabel = (
    answersState: typeof answers
  ): { payload: NestedQnaPayload; derivedLabel: string } => {
    const payload: NestedQnaPayload = {
      action: "nested_qna_selection",
      selections: selections.map((s) => {
        const a = answersState[s.questionId];
        if (a?.selectionId) return { questionId: s.questionId, selection: a.selectionId };
        const t = a?.text?.trim();
        if (t) return { questionId: s.questionId, text: t };
        return { questionId: s.questionId, skipped: true as const };
      }),
    };
    const derivedLabel = selections
      .map((s) => {
        const a = answersState[s.questionId];
        const aText = a?.selectionLabel ?? a?.text?.trim() ?? "Skipped";
        return `Q. ${s.title ?? "Which one?"}\nA. ${aText}`;
      })
      .join("\n\n");
    return { payload, derivedLabel };
  };

  const advance = () => setCurrentIdx((i) => Math.min(i + 1, selections.length - 1));

  const submitAll = (answersState: typeof answers) => {
    if (didSubmitRef.current) return;
    didSubmitRef.current = true;
    const { payload, derivedLabel } = buildPayloadAndLabel(answersState);
    onComplete(payload, derivedLabel);
  };

  const setText = (qid: string, text: string) => {
    setAnswers((prev) => ({
      ...prev,
      [qid]: {
        ...prev[qid],
        text,
        skipped: text.trim() ? undefined : prev[qid]?.skipped,
        ...(text.trim() ? {} : {}),
      },
    }));
  };

  const markSkipped = (qid: string) => {
    setAnswers((prev) => ({
      ...prev,
      [qid]: { skipped: true as const },
    }));
  };

  const handleOptionClick = (optId: string, label: string) => {
    if (disabled) return;
    if (isSingle || isLast) {
      // IMPORTANT: compute from the "next" answers, not from potentially stale state.
      setAnswers((prev) => {
        const next = {
          ...prev,
          [currentQid]: { selectionId: optId, selectionLabel: label },
        };
        submitAll(next);
        return next;
      });
      return;
    }

    setAnswers((prev) => ({
      ...prev,
      [currentQid]: { selectionId: optId, selectionLabel: label },
    }));
    advance();
  };

  const handleRightAction = async () => {
    if (disabled) return;
    const trimmed = currentText.trim();

    if (isSingle) {
      // single: send enabled only when text exists; empty = do nothing
      if (!trimmed) return;
      setAnswers((prev) => {
        const next = { ...prev, [currentQid]: { text: trimmed } };
        submitAll(next);
        return next;
      });
      return;
    }

    if (isLast) {
      // last: send always enabled; empty means skip + submit
      setAnswers((prev) => {
        const next: typeof answers = { ...prev };
        if (!trimmed && !currentSelectedId) {
          next[currentQid] = { skipped: true as const };
        } else if (trimmed) {
          next[currentQid] = { text: trimmed };
        }
        submitAll(next);
        return next;
      });
      return;
    }

    // not last:
    if (!trimmed) {
      // skip current question
      markSkipped(currentQid);
      advance();
      return;
    }
    // typed something: save text and move next
    setAnswers((prev) => ({ ...prev, [currentQid]: { text: trimmed } }));
    advance();
  };

  const handleCloseSingle = () => {
    if (disabled) return;
    // single skip via X
    setAnswers((prev) => {
      const next: typeof answers = { ...prev, [currentQid]: { skipped: true as const } };
      submitAll(next);
      return next;
    });
  };

  return (
    <div className="fixed bottom-0 left-1/2 -translate-x-1/2 z-40 w-full max-w-[430px] px-3 pb-[calc(12px+env(safe-area-inset-bottom,0px))]" data-demo="nested-qna">
      <div className="bg-white rounded-2xl border border-[#E8E8E8] overflow-hidden shadow-[0_10px_30px_rgba(0,0,0,0.08)]">
        {/* Header */}
        <div className="px-4 pt-4 pb-2 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="font-bold text-sm text-[#111] truncate">{current.title ?? "Did you mean one of these?"}</p>
          </div>
          {!isSingle ? (
            <div className="flex items-center gap-1 text-xs text-[#767676] flex-shrink-0">
              <button
                type="button"
                disabled={disabled || currentIdx === 0}
                onClick={() => setCurrentIdx((i) => Math.max(i - 1, 0))}
                className="w-6 h-6 flex items-center justify-center rounded-full hover:bg-[#f5f5f5] disabled:opacity-40 disabled:hover:bg-transparent"
                aria-label="Previous question"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M15 18l-6-6 6-6" />
                </svg>
              </button>
              <span className="tabular-nums">{currentIdx + 1} of {selections.length}</span>
              <button
                type="button"
                disabled={disabled || currentIdx === selections.length - 1}
                onClick={() => setCurrentIdx((i) => Math.min(i + 1, selections.length - 1))}
                className="w-6 h-6 flex items-center justify-center rounded-full hover:bg-[#f5f5f5] disabled:opacity-40 disabled:hover:bg-transparent"
                aria-label="Next question"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M9 18l6-6-6-6" />
                </svg>
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={handleCloseSingle}
              disabled={disabled}
              className="w-8 h-8 flex items-center justify-center rounded-full text-[#767676] hover:bg-[#f5f5f5] transition-colors disabled:opacity-40"
              aria-label="Skip"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {/* Options */}
        <div className="border-t border-[#F2F2F2]">
          {current.options.map((opt, idx) => {
            const label = optionLabel(opt);
            const subLabel = optionSubLabel(opt);
            return (
              <button
                key={opt.id}
                type="button"
                disabled={disabled}
                data-demo-option-id={opt.id}
                onClick={() => handleOptionClick(opt.id, label)}
                className={`w-full flex items-center justify-between px-4 py-3 text-left hover:bg-[#F8F8F8] active:bg-[#F2F2F2] transition-colors disabled:opacity-50 ${idx > 0 ? "border-t border-[#F2F2F2]" : ""}`}
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-[#111] truncate">{label}</p>
                  {subLabel && <p className="text-xs text-[#767676] mt-0.5 truncate">{subLabel}</p>}
                </div>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#BBBBBB" strokeWidth="2.5">
                  <path d="M9 18l6-6-6-6" />
                </svg>
              </button>
            );
          })}
        </div>

        {/* Per-question textbox */}
        <div className="border-t border-[#E8E8E8] p-3">
          <div className="relative w-full min-h-12 flex items-center rounded-xl border border-[#e1e2e8] bg-white px-4 pr-12 focus-within:border-[#5E23DC]/40 transition-colors">
            <input
              type="text"
              value={currentText}
              onChange={(e) => setText(currentQid, e.target.value)}
              placeholder="Something else"
              className="flex-1 min-h-12 bg-transparent text-sm text-[#222] placeholder-[#767676] focus:outline-none caret-[#5E23DC]"
              disabled={disabled}
              data-demo-input="nested-qna-text"
            />

            {/* Right control: multi-question skip/next/send, single-question send */}
            {isSingle ? (
              <button
                type="button"
                onClick={handleRightAction}
                disabled={disabled || !currentText.trim()}
                className="absolute right-3 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center rounded-full disabled:opacity-40"
                aria-label="Send"
                data-demo-action="send"
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="block shrink-0">
                  <circle cx="12" cy="12" r="12" fill={currentText.trim() && !disabled ? "#5E23DC" : "#E1E2E8"} />
                  <path d="M18.5624 11.9935C18.5628 12.1605 18.5186 12.3246 18.4343 12.4688C18.35 12.6131 18.2288 12.7321 18.0831 12.8138L8.244 18.4394C8.1028 18.5194 7.9434 18.5618 7.78111 18.5624C7.63157 18.5616 7.48439 18.525 7.35187 18.4558C7.21934 18.3865 7.1053 18.2865 7.01928 18.1642C6.93326 18.0419 6.87775 17.9008 6.85738 17.7526C6.83702 17.6045 6.85238 17.4536 6.9022 17.3126L8.48423 12.628C8.49969 12.5822 8.52894 12.5423 8.56796 12.5138C8.60698 12.4853 8.65387 12.4695 8.7022 12.4687H12.9374C13.0016 12.4688 13.0652 12.4557 13.1242 12.4303C13.1832 12.4048 13.2363 12.3675 13.2803 12.3206C13.3243 12.2737 13.3581 12.2183 13.3797 12.1578C13.4014 12.0973 13.4104 12.033 13.4061 11.9689C13.3955 11.8483 13.3397 11.7363 13.25 11.6551C13.1602 11.5739 13.0431 11.5297 12.9221 11.5312H8.70337C8.65434 11.5312 8.60653 11.5158 8.5667 11.4872C8.52686 11.4586 8.49699 11.4182 8.4813 11.3718L6.89927 6.68781C6.8363 6.50827 6.82945 6.31382 6.87962 6.1303C6.92979 5.94678 7.03462 5.78286 7.18016 5.66033C7.32571 5.5378 7.5051 5.46246 7.69449 5.4443C7.88388 5.42615 8.07431 5.46605 8.24048 5.5587L18.0842 11.1773C18.2291 11.2587 18.3498 11.3772 18.4338 11.5206C18.5178 11.6641 18.5622 11.8272 18.5624 11.9935Z" fill="white" />
                </svg>
              </button>
            ) : (
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                {/* Not last + empty => Skip pill. Not last + typed => next arrow. Last => send (always enabled). */}
                {!isLast && !currentText.trim() ? (
                  <button
                    type="button"
                    onClick={handleRightAction}
                    disabled={disabled}
                    className="px-3 h-8 rounded-lg border border-[#5E23DC] text-[#5E23DC] text-xs font-medium hover:bg-[#5E23DC]/[0.06] disabled:opacity-40"
                    data-demo-action="skip"
                  >
                    Skip
                  </button>
                ) : !isLast && currentText.trim() ? (
                  <button
                    type="button"
                    onClick={handleRightAction}
                    disabled={disabled}
                    className="w-6 h-6 flex items-center justify-center text-[#5E23DC] disabled:opacity-40"
                    aria-label="Next"
                    data-demo-action="next"
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M5 12h12" />
                      <path d="M13 6l6 6-6 6" />
                    </svg>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleRightAction}
                    disabled={disabled}
                    className="w-6 h-6 flex items-center justify-center rounded-full"
                    aria-label="Send"
                    data-demo-action="send"
                  >
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="block shrink-0">
                      <circle cx="12" cy="12" r="12" fill="#5E23DC" />
                      <path d="M18.5624 11.9935C18.5628 12.1605 18.5186 12.3246 18.4343 12.4688C18.35 12.6131 18.2288 12.7321 18.0831 12.8138L8.244 18.4394C8.1028 18.5194 7.9434 18.5618 7.78111 18.5624C7.63157 18.5616 7.48439 18.525 7.35187 18.4558C7.21934 18.3865 7.1053 18.2865 7.01928 18.1642C6.93326 18.0419 6.87775 17.9008 6.85738 17.7526C6.83702 17.6045 6.85238 17.4536 6.9022 17.3126L8.48423 12.628C8.49969 12.5822 8.52894 12.5423 8.56796 12.5138C8.60698 12.4853 8.65387 12.4695 8.7022 12.4687H12.9374C13.0016 12.4688 13.0652 12.4557 13.1242 12.4303C13.1832 12.4048 13.2363 12.3675 13.2803 12.3206C13.3243 12.2737 13.3581 12.2183 13.3797 12.1578C13.4014 12.0973 13.4104 12.033 13.4061 11.9689C13.3955 11.8483 13.3397 11.7363 13.25 11.6551C13.1602 11.5739 13.0431 11.5297 12.9221 11.5312H8.70337C8.65434 11.5312 8.60653 11.5158 8.5667 11.4872C8.52686 11.4586 8.49699 11.4182 8.4813 11.3718L6.89927 6.68781C6.8363 6.50827 6.82945 6.31382 6.87962 6.1303C6.92979 5.94678 7.03462 5.78286 7.18016 5.66033C7.32571 5.5378 7.5051 5.46246 7.69449 5.4443C7.88388 5.42615 8.07431 5.46605 8.24048 5.5587L18.0842 11.1773C18.2291 11.2587 18.3498 11.3772 18.4338 11.5206C18.5178 11.6641 18.5622 11.8272 18.5624 11.9935Z" fill="white" />
                    </svg>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
