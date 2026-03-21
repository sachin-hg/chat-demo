"use client";

import Image from "next/image";

interface Locality {
  id?: string;
  name?: string;
  city?: string;
  image?: string;
  description?: string;
  highlights?: string[];
  pros?: string[];
  cons?: string[];
  priceTrend?: number;
  priceTrendLabel?: string;
  rating?: number;
  url?: string;
  link?: string;
}

interface Props {
  data: Record<string, unknown>;
  onAction?: (args: {
    action: "show_properties_in_locality" | "learn_more_about_locality";
    responseRequired: boolean;
    visibility: "shown" | "hidden";
    derivedLabel: string;
    locality: { localityUuid: string };
  }) => void;
  disabled?: boolean;
}

export function LocalityInfo({ data, onAction, disabled = false }: Props) {
  const localities: Locality[] = Array.isArray((data as { localities?: unknown[] }).localities)
    ? ((data as { localities: Locality[] }).localities)
    : [data as Locality];

  return (
    <div className="flex gap-3 overflow-x-auto pb-1 -mx-4 px-4" style={{ scrollSnapType: "x mandatory" }} data-demo="locality-carousel">
      {localities.map((loc, idx) => {
        const locId = loc.id ?? `loc_${idx}`;
        const name = loc.name ?? "";
        const city = loc.city ?? "";
        const image = loc.image ?? "https://images.unsplash.com/photo-1449824913935-59a10b8d2000?w=400";
        const trend = loc.priceTrend ?? 0;
        const rating = loc.rating ?? 4;
        const localityUrl = loc.url ?? loc.link;
        const isUp = trend >= 0;
        const displayName = name || city || "Locality";

        return (
          <div
            key={locId}
            className="flex-shrink-0 w-[262px] rounded-[24px] bg-white border border-[#e1e2e8] overflow-hidden"
            style={{ scrollSnapAlign: "start" }}
            data-demo-locality-index={idx}
          >
            <div className="relative h-[160px] bg-gray-100 rounded-t-[24px] overflow-hidden">
              <Image src={image} alt={name} fill className="object-cover" unoptimized sizes="262px" />
            </div>
            <div className="p-4">
              {localityUrl ? (
                <a
                  href={localityUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block font-semibold text-sm text-[#111] truncate hover:underline"
                >
                  {name || "Locality"}
                </a>
              ) : (
                <p className="font-semibold text-sm text-[#111] truncate">{name || "Locality"}</p>
              )}

              <div className="flex gap-3 mt-3">
                <div className="flex-1 min-w-0 rounded-xl bg-[#FAFAFA] border border-[#e1e2e8] p-2.5">
                  <p className="text-[11px] font-normal text-[#767676] mb-1">Rating</p>
                  <div className="flex items-center gap-0.5">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="#F59E0B" className="shrink-0">
                      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                    </svg>
                    <span className="text-sm font-normal text-[#111]">{rating}/5</span>
                  </div>
                </div>
                <div className="flex-1 min-w-0 rounded-xl bg-[#FAFAFA] border border-[#e1e2e8] p-2.5">
                  <p className="text-[11px] font-normal text-[#767676] mb-1">Growth</p>
                  <div className="flex items-center gap-0.5">
                    {isUp ? (
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="#2E7D32" className="shrink-0">
                        <path d="M12 4L4 20h16L12 4z" />
                      </svg>
                    ) : (
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="#C62828" className="shrink-0">
                        <path d="M12 20L4 4h16l-8 16z" />
                      </svg>
                    )}
                    <span className="text-sm font-normal text-[#111]">{Math.abs(trend)}% YoY</span>
                  </div>
                </div>
              </div>
              <div className="flex flex-col gap-2 mt-4">
                <button
                  type="button"
                  disabled={disabled}
                  data-demo-action="show-properties"
                  onClick={() =>
                    onAction?.({
                      action: "show_properties_in_locality",
                      responseRequired: true,
                      visibility: "shown",
                      derivedLabel: `Show properties in ${displayName}`,
                      locality: { localityUuid: locId },
                    })
                  }
                  className="w-full h-12 rounded-lg bg-[#5E23DC] text-white text-sm font-medium hover:bg-[#4a1bb5] transition-colors disabled:opacity-40 flex items-center justify-center"
                >
                  Show properties
                </button>
                <button
                  type="button"
                  disabled={disabled}
                  data-demo-action="learn-more"
                  onClick={() =>
                    onAction?.({
                      action: "learn_more_about_locality",
                      responseRequired: true,
                      visibility: "shown",
                      derivedLabel: `Learn more about ${displayName}`,
                      locality: { localityUuid: locId },
                    })
                  }
                  className="w-full h-12 rounded-lg border border-[#5E23DC] text-[#5E23DC] text-sm font-medium hover:bg-[#5E23DC]/[0.06] transition-colors disabled:opacity-40 flex items-center justify-center"
                >
                  Learn more
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function getClipboardTextForLocalityCarousel(templateData: Record<string, unknown>): string | null {
  const localities: Locality[] = Array.isArray((templateData as { localities?: unknown[] }).localities)
    ? ((templateData as { localities: Locality[] }).localities)
    : [(templateData as unknown) as Locality];

  if (!Array.isArray(localities) || localities.length === 0) return null;

  const lines = localities
    .map((loc) => {
      const name = loc.name ?? loc.city ?? "Locality";
      const rating = loc.rating ?? 4;
      const trend = loc.priceTrend ?? 0;
      const growth = `${Math.abs(trend)}% YoY`;
      const link = loc.url ?? loc.link;
      const linkPart = link ? ` - ${link}` : "";
      return `${name} (${rating}/5, ${growth})${linkPart}`;
    })
    .filter(Boolean);

  return lines.length ? lines.join("\n") : null;
}
