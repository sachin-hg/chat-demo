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
}

interface Props {
  data: Record<string, unknown>;
}

export function LocalityInfo({ data }: Props) {
  // Support both {localities: [...]} and single locality object
  const localities: Locality[] = Array.isArray((data as { localities?: unknown[] }).localities)
    ? ((data as { localities: Locality[] }).localities)
    : [data as Locality];

  return (
    <div className="flex gap-3 overflow-x-auto pb-1 -mx-4 px-4" style={{ scrollSnapType: "x mandatory" }}>
      {localities.map((loc, idx) => {
        const name = loc.name ?? "";
        const city = loc.city ?? "";
        const image = loc.image ?? "https://images.unsplash.com/photo-1449824913935-59a10b8d2000?w=400";
        const trend = loc.priceTrend ?? 0;
        const rating = loc.rating ?? 4;
        const isUp = trend >= 0;

        return (
          <div
            key={loc.id ?? idx}
            className="flex-shrink-0 w-[200px] rounded-2xl bg-white border border-[#E8E8E8] overflow-hidden"
            style={{ scrollSnapAlign: "start" }}
          >
            <div className="relative h-[110px] bg-gray-100">
              <Image src={image} alt={name} fill className="object-cover" unoptimized sizes="200px" />
            </div>
            <div className="p-3">
              <p className="font-semibold text-sm text-[#111]">{name}</p>
              <p className="text-xs text-[#767676]">{city}</p>

              <div className="flex gap-4 mt-2">
                <div>
                  <p className="text-[10px] text-[#767676] mb-0.5">Rating</p>
                  <div className="flex items-center gap-0.5">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="#F59E0B">
                      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                    </svg>
                    <span className="text-xs font-semibold text-[#111]">{rating}/5</span>
                  </div>
                </div>
                <div>
                  <p className="text-[10px] text-[#767676] mb-0.5">Growth</p>
                  <p className={`text-xs font-semibold flex items-center gap-0.5 ${isUp ? "text-green-600" : "text-red-500"}`}>
                    {isUp ? (
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M7 14l5-5 5 5z" /></svg>
                    ) : (
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M7 10l5 5 5-5z" /></svg>
                    )}
                    {Math.abs(trend)}% YoY
                  </p>
                </div>
              </div>

              <div className="flex flex-col gap-1.5 mt-3">
                <button
                  type="button"
                  className="w-full py-2 rounded-xl bg-[#6033EE] text-white text-xs font-semibold hover:bg-[#4f27d4] transition-colors"
                >
                  Show properties
                </button>
                <button
                  type="button"
                  className="w-full py-2 rounded-xl border border-[#6033EE] text-[#6033EE] text-xs font-semibold hover:bg-[#EDE8FF] transition-colors"
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
