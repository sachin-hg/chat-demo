"use client";

import Image from "next/image";
import type { ChatAction } from "@/lib/contract-types";
import { MOCK_PROPERTIES } from "@/lib/mock/data";

interface PropertyItem {
  id: string;
  title: string;
}

interface Props {
  properties: PropertyItem[];
  actions?: ChatAction[];
  onAction: (actionId: string, propertyId: string, messageId: string, derivedLabel: string) => void;
  messageId: string;
  disabled?: boolean;
}

export function PropertyCarousel({ properties, actions, onAction, messageId, disabled = false }: Props) {
  const items = properties.map((p) => {
    const full = MOCK_PROPERTIES.find((x) => x.id === p.id);
    return {
      ...p,
      image: full?.image ?? "https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=400",
      price: full?.price ?? 0,
      builtUpArea: full?.builtUpArea ?? 0,
      sellerName: full?.sellerName ?? "",
      bhkType: full?.bhkType ?? 2,
      propertyType: full?.propertyType ?? "apartment",
    };
  });

  const templateItemActions = actions?.filter((a) => a.scope === "template_item") ?? [];

  return (
    <div className="space-y-3">
      <div className="flex gap-3 overflow-x-auto pb-2 -mx-1">
        {items.map((p) => (
          <div
            key={p.id}
            className="flex-shrink-0 w-[200px] rounded-xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden"
          >
            <div className="relative h-28 bg-[var(--border)]">
              <Image
                src={p.image}
                alt={p.title}
                fill
                className="object-cover"
                sizes="200px"
                unoptimized
              />
            </div>
            <div className="p-2.5">
              <p className="font-medium text-sm">{p.title}</p>
              <p className="text-xs text-[var(--text-muted)]">
                ₹{(p.price / 1_00_000).toFixed(1)}L · {p.builtUpArea} sqft · {p.propertyType.replace("_", " ")}
              </p>
              <p className="text-xs text-[var(--text-muted)]">Seller: {p.sellerName}</p>
              <div className="flex gap-1.5 mt-2 flex-wrap">
                {templateItemActions.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    disabled={disabled}
                    onClick={() =>
                      disabled ? undefined : onAction(a.id, p.id, messageId, `${a.label} ${p.title}`)
                    }
                    className="text-xs px-2 py-1 rounded bg-[var(--accent)] text-white hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {a.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
