"use client";

import { useState } from "react";

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
  selections: { questionId: string; selection?: string; text?: string }[];
}

interface Props {
  selections: NestedQnaSelection[];
  canSkip?: boolean;
  messageId: string;
  onComplete: (data: NestedQnaPayload, derivedLabel: string) => void;
  onSkip?: () => void;
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
  canSkip,
  messageId,
  onComplete,
  onSkip,
  disabled = false,
}: Props) {
  const [selected, setSelected] = useState<Record<string, { id: string; label: string }>>({});

  const allSelected = selections.length > 0 && selections.every((s) => selected[s.questionId]);
  const isSingle = selections.length === 1;

  const handleSelect = (questionId: string, id: string, label: string) => {
    if (disabled) return;
    const next = { ...selected, [questionId]: { id, label } };
    setSelected(next);
    if (isSingle) {
      const payload: NestedQnaPayload = {
        action: "nested_qna_selection",
        selections: [{ questionId, selection: id }],
      };
      const sel = selections[0];
      const derivedLabel = `Q. ${sel.title ?? "Which one?"}\nA. ${label}`;
      onComplete(payload, derivedLabel);
    }
  };

  const handleSubmit = () => {
    if (disabled || !allSelected) return;
    const payload: NestedQnaPayload = {
      action: "nested_qna_selection",
      selections: selections.map((s) => ({
        questionId: s.questionId,
        selection: selected[s.questionId]?.id,
      })),
    };
    const lines = selections.map(
      (s) => `Q. ${s.title ?? "Which one?"}\nA. ${selected[s.questionId]?.label ?? ""}`
    );
    const derivedLabel = lines.join("\n\n");
    onComplete(payload, derivedLabel);
  };

  if (!selections?.length) return null;

  return (
    <div className="bg-white rounded-2xl border border-[#E8E8E8] overflow-hidden w-full space-y-4">
      {selections.map((sel) => (
        <div key={sel.questionId}>
          <div className="px-4 pt-4 pb-1">
            <p className="font-bold text-sm text-[#111] mb-1">{sel.title ?? "Which one?"}</p>
          </div>
          <div>
            {sel.options.map((opt, idx) => {
              const label = optionLabel(opt);
              const subLabel = optionSubLabel(opt);
              const isSelected = selected[sel.questionId]?.id === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  disabled={disabled}
                  onClick={() => handleSelect(sel.questionId, opt.id, label)}
                  className={`w-full flex items-center justify-between px-4 py-3 text-left hover:bg-[#F8F8F8] active:bg-[#F2F2F2] transition-colors disabled:opacity-50 ${idx > 0 ? "border-t border-[#F2F2F2]" : ""} ${isSelected ? "bg-[#f1ebff]/30" : ""}`}
                >
                  <div>
                    <p className="text-sm font-medium text-[#111]">{label}</p>
                    {subLabel && <p className="text-xs text-[#767676] mt-0.5">{subLabel}</p>}
                  </div>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#BBBBBB" strokeWidth="2.5">
                    <path d="M9 18l6-6-6-6" />
                  </svg>
                </button>
              );
            })}
          </div>
        </div>
      ))}
      {(!isSingle || (isSingle && canSkip)) && (
        <div className="border-t border-[#E8E8E8] px-4 py-3 flex items-center justify-between gap-3">
          {canSkip && onSkip && (
            <button
              type="button"
              onClick={onSkip}
              disabled={disabled}
              className="text-sm font-medium text-[#767676] hover:text-[#111] disabled:opacity-40 flex items-center gap-2"
            >
              Something else
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            </button>
          )}
          {!isSingle && (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={disabled || !allSelected}
              className="ml-auto text-sm font-medium text-white bg-[#5E23DC] px-4 py-2 rounded-lg hover:bg-[#4a1bb5] disabled:opacity-40 disabled:pointer-events-none"
            >
              Submit
            </button>
          )}
        </div>
      )}
    </div>
  );
}
