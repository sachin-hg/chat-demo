"use client";

interface SelectionItem {
  id: string;
  name?: string;
  title?: string;  // backward compat
  type?: string;
  city?: string;
}

interface Props {
  title?: string;
  items?: SelectionItem[];
  canSkip?: boolean;
  onSkip?: () => void;
  onSelect: (selectedId: string, messageId: string, derivedLabel: string) => void;
  messageId: string;
  disabled?: boolean;
}

export function ListSelection({ title, items, canSkip, onSkip, onSelect, messageId, disabled = false }: Props) {
  const allItems = items ?? [];
  const cardTitle = title ?? "Did you mean one of these?";

  return (
    <div className="bg-white rounded-2xl border border-[#E8E8E8] overflow-hidden w-full">
      <div className="px-4 pt-4 pb-1">
        <p className="font-bold text-sm text-[#111] mb-1">{cardTitle}</p>
      </div>
      <div>
        {allItems.map((item, idx) => {
          const label = item.name ?? item.title ?? "";
          const hasSubLabel = item.type || item.city;
          const subLabel = item.type && item.city
            ? `${item.type}  |  ${item.city}`
            : (item.type ?? item.city ?? "");

          return (
            <button
              key={item.id}
              type="button"
              disabled={disabled}
              onClick={() => !disabled && onSelect(item.id, messageId, label)}
              className={`w-full flex items-center justify-between px-4 py-3 text-left hover:bg-[#F8F8F8] active:bg-[#F2F2F2] transition-colors disabled:opacity-50 ${idx > 0 ? "border-t border-[#F2F2F2]" : ""}`}
            >
              <div>
                <p className="text-sm font-medium text-[#111]">{label}</p>
                {hasSubLabel && <p className="text-xs text-[#767676] mt-0.5">{subLabel}</p>}
              </div>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#BBBBBB" strokeWidth="2.5">
                <path d="M9 18l6-6-6-6" />
              </svg>
            </button>
          );
        })}
      </div>
      {canSkip && (
        <div className="border-t border-[#E8E8E8] px-4 py-3 flex items-center justify-between">
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
        </div>
      )}
    </div>
  );
}
