"use client";

import Image from "next/image";
import { useRef, useState } from "react";
import { useToast } from "@/components/ui/ToastProvider";
import { useAuth } from "@/components/auth/AuthProvider";
import type { ChatEvent } from "@/lib/contract-types";
import type { PropertyCarouselCard } from "@/lib/mock/data";

type SrpFilters = Record<string, unknown>;

interface Props {
  properties: PropertyCarouselCard[];
  messageId: string;
  onUserAction: (event: ChatEvent) => void;
  propertyCount?: number;
  service?: string;
  category?: string;
  city?: string;
  filters?: SrpFilters;

  disabled?: boolean;
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

export function PropertyCarousel({
  properties,
  messageId,
  onUserAction,
  propertyCount,
  service,
  category,
  city,
  filters,
  disabled = false,
}: Props) {
  const [shortlisted, setShortlisted] = useState<Set<string>>(new Set());
  const toast = useToast();
  const auth = useAuth();
  const shortlistInFlightRef = useRef<Set<string>>(new Set());
  const hasProjectCard = properties.some((p) => p.type === "project");

  const formatInt = (n?: number | null): string => {
    if (typeof n !== "number" || Number.isNaN(n)) return "";
    return n.toLocaleString();
  };

  const getFurnishTag = (furnishTypeId?: number | null): string => {
    // 1: furnished, 2: semi-furnished, 3: unfurnished (sample contract mapping)
    if (furnishTypeId === 1) return "Furnished";
    if (furnishTypeId === 2) return "Semi furnished";
    if (furnishTypeId === 3) return "Unfurnished";
    return "";
  };

  const withRupee = (value: string): string => {
    const trimmed = value.trim();
    if (!trimmed) return "";
    return trimmed.startsWith("₹") ? trimmed : `₹${trimmed}`;
  };
  const hasMoreResults = typeof propertyCount === "number" && propertyCount > properties.length;
  const viewAllUrl = hasMoreResults ? getSRPUrl(service, category, city, filters) : "";

  return (
    <div className="flex gap-3 overflow-x-auto pb-1 -mx-4 px-4" style={{ scrollSnapType: "x mandatory" }} data-demo="property-carousel">
      {properties.map((p, idx) => {
        const isShortlisted = shortlisted.has(p.id);
        const imgSrc = p.thumb_image_url?.replace("version", "large") ?? "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=600";
        const propertyForMl = {
          id: p.id,
          type: p.type,
        };
        const addressText = (p.short_address ?? []).map((x) => x.display_name).filter(Boolean).join(", ");
        const priceText =
          p.type === "rent"
            ? p.formatted_price ?? ""
            : p.type === "resale"
              ? p.formatted_min_price ?? ""
              : `${p.formatted_min_price ?? ""} - ${p.formatted_max_price ?? ""}`.trim();
        const displayPriceText = withRupee(priceText);

        const areaText =
          p.type === "project"
            ? `${formatInt(p.min_selected_area_in_unit)} - ${formatInt(p.max_selected_area_in_unit)} ${p.unit_of_area}`
            : `${p.display_area_type}: ${formatInt(p.inventory_configs?.[0]?.area_value_in_unit)} ${p.unit_of_area}`;

        const tagText = p.type === "rent" ? getFurnishTag(p.inventory_configs?.[0]?.furnish_type_id) : p.property_tags?.[0] ?? "";

        const primaryPillOn = p.type === "project" ? p.is_rera_verified : p.is_verified;
        const primaryPillLabel = p.type === "project" ? "RERA" : "Verified";

        return (
          <div
            key={p.id}
            className="flex-shrink-0 w-[262px] rounded-[24px] bg-white border border-[#e1e2e8] overflow-hidden"
            style={{ scrollSnapAlign: "start" }}
            data-demo-property-index={idx}
          >
            {/* Image – scout 262×160, radius top only */}
            <div className="relative h-[160px] bg-gray-100 rounded-t-[24px] overflow-hidden">
              <Image src={imgSrc} alt={p.title ?? "Property"} fill className="object-cover" sizes="262px" unoptimized />
              <button
                type="button"
                className="absolute top-2 right-2 w-8 h-8 rounded-full bg-white border border-[#e1e2e8] flex items-center justify-center"
                data-demo-action="shortlist"
                onClick={async () => {
                  if (disabled) return;
                  const currentlyShortlisted = shortlisted.has(p.id);

                  // Local toggle off (no API/event because it's not part of current contract)
                  if (currentlyShortlisted) {
                    setShortlisted((prev) => {
                      const next = new Set(prev);
                      next.delete(p.id);
                      return next;
                    });
                    return;
                  }

                  // Prevent duplicate events/toasts on double-click.
                  if (shortlistInFlightRef.current.has(p.id)) return;
                  shortlistInFlightRef.current.add(p.id);

                  const ok = await auth.requireLogin("shortlist");
                  if (!ok) {
                    shortlistInFlightRef.current.delete(p.id);
                    return;
                  }

                  try {
                      await postAck("/api/properties/shortlist", { propertyId: p.id });
                  } catch (e) {
                    console.error(e);
                    toast.show("Could not shortlist. Please try again.");
                    shortlistInFlightRef.current.delete(p.id);
                    return;
                  }

                  setShortlisted((prev) => {
                    const next = new Set(prev);
                    next.add(p.id);
                    return next;
                  });
                  toast.show("Property has been shortlisted");

                  // Notify ML, but don't expect a response. (FE already handled UI + API.)
                  onUserAction({
                    sender: { type: "system" },
                    payload: {
                      messageType: "user_action",
                      responseRequired: false,
                      visibility: "hidden",
                      content: {
                        data: { action: "shortlist", messageId, property: propertyForMl },
                      },
                    },
                  } as ChatEvent);

                  shortlistInFlightRef.current.delete(p.id);
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

            {/* Card body – scout 16px padding */}
            <div className="p-4">
              {/* Tags – scout: RERA #edfff8 #0f8458, status #f2f3f8 #656565 */}
              <div className="flex gap-2 mb-4 flex-wrap">
                {primaryPillOn && <span
                  className={`h-5 px-2 rounded-md text-[12px] font-medium flex items-center ${
                    primaryPillOn ? "bg-[#edfff8] text-[#0f8458]" : "bg-[#f2f3f8] text-[#656565]"
                  }`}
                >
                  {primaryPillLabel}
                </span>}
                {tagText && (
                  <span className="h-5 px-2 rounded-md text-[12px] font-medium flex items-center bg-[#f2f3f8] text-[#656565]">
                    {tagText}
                  </span>
                )}
              </div>

              {p.type !== "project" ? (
                <>
                  <a
                    href={p.inventory_canonical_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block text-[18px] leading-[1.15] font-semibold text-[#111] truncate hover:underline"
                  >
                    {p.title}
                  </a>
                  {/* Keep subtitle row spacing only for mixed card sets (project + rent/resale). */}
                  {hasProjectCard && (
                    <p className="text-[15px] leading-[1.2] font-semibold text-[#111] mt-1 truncate invisible">.</p>
                  )}
                </>
              ) : (
                <>
                  <p className="text-[20px] leading-[1.15] font-semibold text-[#111] truncate">{p.name}</p>
                  <a
                    href={p.inventory_canonical_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block text-[15px] leading-[1.2] font-semibold text-[#111] mt-1 truncate hover:underline"
                  >
                    {p.title ?? ""}
                  </a>
                </>
              )}

              {addressText && (
                <div className="flex items-center gap-2 text-[16px] text-[#767676] mt-3 min-w-0">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                    <circle cx="12" cy="10" r="3" />
                  </svg>
                  <span className="truncate">{addressText}</span>
                </div>
              )}

              <div className="h-px bg-[#e1e2e8] my-3" />

              {areaText && (
                <div className="flex items-center gap-2 text-[16px] text-[#767676]">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21" />
                  </svg>
                  <span>{areaText}</span>
                </div>
              )}

              {displayPriceText && <p className="text-[18px] font-bold text-[#111] mt-2">{displayPriceText}</p>}

              <div className="flex gap-2 mt-4">
                <button
                  type="button"
                  disabled={disabled}
                  data-demo-action="learn-more"
                  onClick={() =>
                    !disabled &&
                    onUserAction({
                      sender: { type: "user" },
                      payload: {
                        messageType: "user_action",
                        responseRequired: true,
                        visibility: "shown",
                        content: {
                          data: {
                            action: "learn_more_about_property",
                            messageId,
                            property: propertyForMl,
                          },
                          derivedLabel: `Tell me more about ${p.name ?? p.title ?? "this property"}`,
                        },
                      },
                    } as ChatEvent)
                  }
                  className="flex-1 h-12 min-w-0 rounded-lg border border-[#5E23DC] text-[#5E23DC] text-sm font-medium hover:bg-[#5E23DC]/[0.06] transition-colors disabled:opacity-40"
                >
                  Learn more
                </button>
                <button
                  type="button"
                  disabled={disabled}
                  data-demo-action="contact"
                  onClick={async () => {
                    if (disabled) return;
                    const ok = await auth.requireLogin("contact");
                    if (!ok) return;
                    try {
                      await postAck("/api/properties/contact-seller", { propertyId: p.id });
                    } catch (e) {
                      console.error(e);
                      return;
                    }
                    onUserAction({
                      sender: { type: "system" },
                      payload: {
                        messageType: "user_action",
                        responseRequired: false,
                        visibility: "shown",
                        content: {
                          data: {
                            action: "crf_submitted",
                            messageId,
                            property: propertyForMl,
                          },
                          derivedLabel: "The seller has been contacted, someone will reach out to you soon!",
                        },
                      },
                    } as ChatEvent);
                  }}
                  className="flex-1 h-12 min-w-0 rounded-lg bg-[#5E23DC] text-white text-sm font-medium flex items-center justify-center gap-1 hover:bg-[#4a1bb5] transition-colors disabled:opacity-40"
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z" />
                  </svg>
                  Contact
                </button>
              </div>
            </div>
          </div>
        );
      })}
      {hasMoreResults && (
        <div
          className="flex-shrink-0 w-[262px] rounded-[24px] bg-white border border-[#e1e2e8] overflow-hidden"
          style={{ scrollSnapAlign: "start" }}
        >
          <div className="h-full min-h-[380px] p-4 flex flex-col items-center justify-center text-center">
            <p className="text-sm text-[#767676] mb-4">
              Showing {properties.length} of {propertyCount} properties
            </p>
            <button
              type="button"
              data-demo-action="view-all"
              disabled={disabled}
              className="h-12 px-5 rounded-lg bg-[#5E23DC] text-white text-sm font-medium hover:bg-[#4a1bb5] transition-colors disabled:opacity-40"
              onClick={() => {
                if (disabled) return;
                window.open(viewAllUrl, "_blank", "noopener,noreferrer");
              }}
            >
              View all
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function getSRPUrl(
  service?: string,
  category?: string,
  city?: string,
  filters?: SrpFilters
): string {
  const encodedFilters = encodeURIComponent(JSON.stringify(filters ?? {}));
  return `https://example.com/srp?service=${encodeURIComponent(service ?? "")}&category=${encodeURIComponent(category ?? "")}&city=${encodeURIComponent(city ?? "")}&filters=${encodedFilters}`;
}

export function getClipboardTextForPropertyCarousel(templateData: Record<string, unknown>): string | null {
  const props = (templateData.properties as unknown[]) ?? [];
  if (!Array.isArray(props) || props.length === 0) return null;
  const propertyCount = typeof templateData.property_count === "number" ? templateData.property_count : undefined;
  const service = typeof templateData.service === "string" ? templateData.service : undefined;
  const category = typeof templateData.category === "string" ? templateData.category : undefined;
  const city = typeof templateData.city === "string" ? templateData.city : undefined;
  const filters =
    typeof templateData.filters === "object" && templateData.filters !== null
      ? (templateData.filters as SrpFilters)
      : undefined;

  const lines = props
    .map((p) => p as Partial<PropertyCarouselCard>)
    .map((p) => {
      const title = p.title ?? "";
      const projectName = p.name ?? "";
      const url = p.inventory_canonical_url ?? "";

      const addressText = Array.isArray(p.short_address)
        ? p.short_address.map((x) => x.display_name).filter(Boolean).join(", ")
        : "";

      const priceText =
        p.type === "rent"
          ? p.formatted_price ?? ""
          : p.type === "resale"
            ? p.formatted_min_price ?? ""
            : p.type === "project"
              ? `${p.formatted_min_price ?? ""} - ${p.formatted_max_price ?? ""}`.trim()
              : "";

      const areaRange =
        p.type === "project" && p.display_area_type && p.unit_of_area
          ? typeof p.min_selected_area_in_unit === "number"
            ? `${p.display_area_type}: ${p.min_selected_area_in_unit.toLocaleString()}${
                typeof p.max_selected_area_in_unit === "number"
                  ? ` - ${p.max_selected_area_in_unit.toLocaleString()}`
                  : ""
              } ${p.unit_of_area}`.trim()
            : ""
          : "";

      if (!title && !priceText && !addressText) return "";

      if (p.type === "project") {
        // project: ${projectName} in ${addressText}. ${area range} title ${priceText}. link: ${url}
        const first = projectName ? `${projectName} in ${addressText}` : `in ${addressText}`.trim();
        const second = areaRange ? `${areaRange} ${title} ${priceText}`.trim() : `${title} ${priceText}`.trim();
        return `${first}. ${second}. link: ${url}`.replace(/\s+/g, " ").trim();
      }

      // rent/resale: title in property for priceText. link: url
      return `${title} in ${addressText} for ${priceText}. link: ${url}`.replace(/\s+/g, " ").trim();
    })
    .filter(Boolean);

  if (typeof propertyCount === "number" && propertyCount > props.length) {
    lines.push(`View all: ${getSRPUrl(service, category, city, filters)}`);
  }

  return lines.length ? lines.join("\n") : null;
}
