"use client";

import Image from "next/image";
import { MOCK_PROPERTIES } from "@/lib/mock/data";

interface Props {
  data: Record<string, unknown>;
}

export function DownloadBrochure({ data }: Props) {
  const propertyId = (data.propertyId as string) ?? "";
  const property = MOCK_PROPERTIES.find((p) => p.id === propertyId) ?? MOCK_PROPERTIES[1];
  const imgSrc = property.image;

  return (
    <div className="rounded-2xl border border-[#e1e2e8] bg-white overflow-hidden max-w-[262px]">
      {/* Image wrapper – 249×160 in scout-bot */}
      <div className="relative w-full h-[160px] bg-[#f2f2f2]">
        <Image
          src={imgSrc}
          alt={property.projectName}
          fill
          className="object-cover brochure-card__image"
          sizes="262px"
          unoptimized
        />
      </div>
      {/* Body */}
      <div className="p-4 space-y-3 brochure-card__body">
        <div className="text-sm font-medium text-[#222] brochure-card__title">
          {property.projectName}
        </div>
        <div className="h-px bg-[#e1e2e8] brochure-card__divider" />
        <div className="text-base font-medium text-[#222] brochure-card__price">
          {property.priceFormatted}
        </div>
        <button
          type="button"
          className="w-full h-11 rounded-xl bg-[#5E23DC] text-white text-sm font-medium brochure-card__cta hover:bg-[#4a1bb5] transition-colors"
        >
          View brochure
        </button>
      </div>
    </div>
  );
}
