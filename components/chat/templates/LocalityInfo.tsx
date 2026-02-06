"use client";

import Image from "next/image";

interface Data {
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
}

interface Props {
  data: Data;
}

export function LocalityInfo({ data }: Props) {
  const name = data.name ?? "";
  const city = data.city ?? "";
  const image = data.image ?? "https://images.unsplash.com/photo-1449824913935-59a10b8d2000?w=400";
  const description = data.description ?? "";
  const highlights = data.highlights ?? [];
  const pros = data.pros ?? [];
  const cons = data.cons ?? [];
  const trend = data.priceTrend ?? 0;
  const trendLabel = data.priceTrendLabel ?? (trend >= 0 ? `+${trend}%` : `${trend}%`);

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden max-w-sm">
      <div className="relative h-36 bg-[var(--border)]">
        <Image src={image} alt={name} fill className="object-cover" unoptimized sizes="400px" />
      </div>
      <div className="p-4">
        <h3 className="font-semibold text-sm">{name}, {city}</h3>
        <p className="text-xs text-[var(--text-muted)] mt-1">{description}</p>
        <p className="text-xs mt-2 font-medium">
          Price trend (1y): <span className={trend >= 0 ? "text-green-400" : "text-red-400"}>{trendLabel}</span>
        </p>
        {highlights.length > 0 && (
          <p className="text-xs text-[var(--text-muted)] mt-1">Highlights: {highlights.join(", ")}</p>
        )}
        {pros.length > 0 && (
          <p className="text-xs text-green-600/90 mt-1">Pros: {pros.join(", ")}</p>
        )}
        {cons.length > 0 && (
          <p className="text-xs text-amber-600/90 mt-1">Cons: {cons.join(", ")}</p>
        )}
      </div>
    </div>
  );
}
