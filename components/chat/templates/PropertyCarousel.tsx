"use client";

import Image from "next/image";
import { useState } from "react";
import type { ChatAction } from "@/lib/contract-types";
import { MOCK_PROPERTIES } from "@/lib/mock/data";

interface PropertyItem {
  id: string;
  title?: string;
  projectName?: string;
  tags?: string[];
  image?: string;
  priceFormatted?: string;
  builtUpArea?: number;
  locationFormatted?: string;
}

interface Props {
  properties: PropertyItem[];
  actions?: ChatAction[];
  onAction: (actionId: string, propertyId: string, messageId: string, derivedLabel: string) => void;
  messageId: string;
  disabled?: boolean;
  onToast?: (message: string) => void;
}

export function PropertyCarousel({ properties, actions, onAction, messageId, disabled = false, onToast }: Props) {
  const [shortlisted, setShortlisted] = useState<Set<string>>(new Set());

  const items = properties.map((p) => {
    const full = MOCK_PROPERTIES.find((x) => x.id === p.id);
    return { ...full, ...p } as PropertyItem & { id: string };
  });

  const contactAction = actions?.find((a) => a.id === "contact");

  return (
    <div className="flex gap-3 overflow-x-auto pb-1 -mx-4 px-4" style={{ scrollSnapType: "x mandatory" }}>
      {items.map((p) => {
        const isShortlisted = shortlisted.has(p.id);
        const imgSrc = p.image ?? "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=600";

        return (
          <div
            key={p.id}
            className="flex-shrink-0 w-[240px] rounded-2xl bg-white border border-[#E8E8E8] overflow-hidden"
            style={{ scrollSnapAlign: "start" }}
          >
            {/* Image + heart */}
            <div className="relative h-[150px] bg-gray-100">
              <Image src={imgSrc} alt={p.title ?? "Property"} fill className="object-cover" sizes="240px" unoptimized />
              <button
                type="button"
                className="absolute top-2 right-2 w-7 h-7 rounded-full bg-white/90 flex items-center justify-center shadow-sm"
                onClick={() => {
                  if (disabled) return;
                  setShortlisted((prev) => {
                    const next = new Set(prev);
                    if (next.has(p.id)) {
                      next.delete(p.id);
                    } else {
                      next.add(p.id);
                      onToast?.("Property has been shortlisted");
                      onAction("shortlist", p.id, messageId, `Shortlist ${p.title ?? p.projectName ?? ""}`);
                    }
                    return next;
                  });
                }}
              >
                {isShortlisted ? (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="#EF4444">
                    <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
                  </svg>
                ) : (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#888" strokeWidth="2">
                    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                  </svg>
                )}
              </button>
            </div>

            {/* Card body */}
            <div className="p-3">
              {/* Tags */}
              {p.tags && p.tags.length > 0 && (
                <div className="flex gap-1 mb-2 flex-wrap">
                  {p.tags.map((tag) => (
                    <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded border border-green-600 text-green-700 font-medium leading-tight">
                      {tag}
                    </span>
                  ))}
                </div>
              )}

              <p className="font-semibold text-sm text-[#111]">{p.title ?? "Property"}</p>
              {p.projectName && <p className="text-xs font-semibold text-[#111]">{p.projectName}</p>}

              {p.builtUpArea && (
                <div className="flex items-center gap-1 text-[11px] text-[#767676] mt-1.5">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21" />
                  </svg>
                  Built up area: {p.builtUpArea.toLocaleString()} sq.ft
                </div>
              )}

              {p.locationFormatted && (
                <div className="flex items-center gap-1 text-[11px] text-[#767676] mt-0.5">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                    <circle cx="12" cy="10" r="3" />
                  </svg>
                  {p.locationFormatted}
                </div>
              )}

              {p.priceFormatted && (
                <p className="text-[15px] font-bold text-[#111] mt-2">{p.priceFormatted}</p>
              )}

              <div className="flex gap-2 mt-3">
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => !disabled && onAction("learn_more", p.id, messageId, `Learn more about ${p.projectName ?? p.title ?? ""}`)}
                  className="flex-1 py-2 rounded-xl border border-[#6033EE] text-[#6033EE] text-xs font-semibold hover:bg-[#EDE8FF] transition-colors disabled:opacity-40"
                >
                  Learn more
                </button>
                {contactAction && (
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => !disabled && onAction("contact", p.id, messageId, `Contact Seller for ${p.projectName ?? p.title ?? ""}`)}
                    className="flex-1 py-2 rounded-xl bg-[#6033EE] text-white text-xs font-semibold flex items-center justify-center gap-1 hover:bg-[#4f27d4] transition-colors disabled:opacity-40"
                  >
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z" />
                    </svg>
                    Contact
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
