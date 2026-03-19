"use client";

import Image from "next/image";
import { useState } from "react";
import type { ChatEvent } from "@/lib/contract-types";
import { useAuth } from "@/components/auth/AuthProvider";
import type { PropertyCarouselCard } from "@/lib/mock/data";

interface Props {
  data: Record<string, unknown>;
  messageId: string;
  onUserAction: (event: ChatEvent) => void;
  disabled?: boolean;
}

type PropertyMeta = { id: string; type: string };

export function DownloadBrochure({ data, messageId, onUserAction, disabled = false }: Props) {
  const [open, setOpen] = useState(false);
  const auth = useAuth();

  const property = (data.property as PropertyCarouselCard | undefined) ?? undefined;
  if (!property) return null;
  const type = property.type ?? "project";
  const propertyMeta: PropertyMeta = { id: property.id, type };

  const imgSrc = property.thumb_image_url;
  const brochureImages = [imgSrc, imgSrc, imgSrc];

  const displayName = property.name ?? "";
  const displayPriceRange =
    property.type === "rent"
      ? property.formatted_price ?? ""
      : property.type === "resale"
        ? property.formatted_min_price ?? ""
        : `${property.formatted_min_price ?? ""} - ${property.formatted_max_price ?? ""}`.trim();
  const displayPriceText = displayPriceRange.trim().startsWith("₹")
    ? displayPriceRange.trim()
    : displayPriceRange
      ? `₹${displayPriceRange.trim()}`
      : "";

  return (
    <>
      <div className="rounded-2xl border border-[#e1e2e8] bg-white overflow-hidden max-w-[262px]" data-demo="download-brochure">
      {/* Image wrapper – 249×160 in scout-bot */}
      <div className="relative w-full h-[160px] bg-[#f2f2f2]">
        <Image
          src={imgSrc}
          alt={displayName}
          fill
          className="object-cover brochure-card__image"
          sizes="262px"
          unoptimized
        />
      </div>
      {/* Body */}
      <div className="p-4 space-y-3 brochure-card__body">
        <div className="text-sm font-medium text-[#222] brochure-card__title">
          {displayName}
        </div>
        <div className="h-px bg-[#e1e2e8] brochure-card__divider" />
        <div className="text-base font-medium text-[#222] brochure-card__price">
          {displayPriceText}
        </div>
        <button
          type="button"
          disabled={disabled}
          data-demo-action="download"
          onClick={async () => {
            const ok = await auth.requireLogin("brochure");
            if (!ok) {
              onUserAction({
                sender: { type: "system" },
                payload: {
                  messageType: "user_action",
                  responseRequired: false,
                  visibility: "shown",
                  content: {
                    data: { action: "location_denied" },
                    derivedLabel: "Login Failed. Can't proceed without logging in!",
                  },
                },
              } as ChatEvent);
              return;
            }

            setOpen(true);
            // Send hidden system user_action per contract (brochure_downloaded)
            onUserAction({
              sender: { type: "system" },
              payload: {
                messageType: "user_action",
                responseRequired: false,
                content: {
                  data: { action: "brochure_downloaded", messageId, property: propertyMeta },
                },
              },
            } as ChatEvent);
          }}
          className="w-full h-11 rounded-xl bg-[#5E23DC] text-white text-sm font-medium brochure-card__cta hover:bg-[#4a1bb5] transition-colors disabled:opacity-40"
        >
          View brochure
        </button>
      </div>
      </div>

      {/* Sample brochure popup */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-end" onClick={() => setOpen(false)}>
          <div className="absolute inset-0 bg-black/40" />
          <div
            className="relative w-full max-w-[430px] mx-auto bg-white rounded-t-3xl pt-3 pb-6 px-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-10 h-1 bg-[#e1e2e8] rounded-full mx-auto mb-4" />
            <div className="flex items-center justify-between mb-3">
              <p className="text-[15px] font-semibold text-[#111]">Brochure</p>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="w-8 h-8 flex items-center justify-center rounded-full text-[#767676] hover:bg-[#f5f5f5] transition-colors"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4" style={{ scrollSnapType: "x mandatory" }}>
              {brochureImages.map((src, idx) => (
                <div
                  key={idx}
                  className="relative flex-shrink-0 w-[320px] h-[420px] rounded-2xl overflow-hidden bg-[#f2f3f8] border border-[#e1e2e8]"
                  style={{ scrollSnapAlign: "start" }}
                >
                  <Image src={src} alt={`Brochure page ${idx + 1}`} fill className="object-cover" unoptimized sizes="320px" />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export function getClipboardTextForDownloadBrochure(templateData: Record<string, unknown>): string | null {
  const property = (templateData.property as PropertyCarouselCard | undefined) ?? undefined;
  if (!property) return null;
  const projectName = property?.name ?? "";
  const priceRange =
    property.type === "rent"
      ? property.formatted_price ?? ""
      : property.type === "resale"
        ? property.formatted_min_price ?? ""
        : `${property.formatted_min_price ?? ""} - ${property.formatted_max_price ?? ""}`.trim();

  if (!projectName && !priceRange) return null;

  const parts = [
    projectName || undefined,
    priceRange ? ` - ${priceRange}` : undefined,
  ].filter(Boolean);

  return parts.join("").trim();
}
