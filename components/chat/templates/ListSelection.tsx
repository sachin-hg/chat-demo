"use client";

interface Item {
  id: string;
  title: string;
}

interface Props {
  properties: Item[];
  onSelect: (selectedId: string, messageId: string, derivedLabel: string) => void;
  messageId: string;
  disabled?: boolean;
}

export function ListSelection({ properties, onSelect, messageId, disabled = false }: Props) {
  return (
    <div className="flex flex-wrap gap-2">
      {properties.map((p) => (
        <button
          key={p.id}
          type="button"
          disabled={disabled}
          onClick={() => (disabled ? undefined : onSelect(p.id, messageId, p.title))}
          className="px-4 py-2 rounded-full border border-[var(--border)] bg-[var(--surface)] text-sm hover:bg-[var(--border)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {p.title}
        </button>
      ))}
    </div>
  );
}
