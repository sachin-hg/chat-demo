"use client";

import Image from "next/image";

interface Data {
  id?: string;
  name?: string;
  image?: string;
  phone?: string;
}

interface Props {
  data: Data;
  onCall?: () => void;
}

export function SellerInfo({ data, onCall }: Props) {
  const name = data.name ?? "Seller";
  const image = data.image ?? "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=100";
  const phone = data.phone ?? "";

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 flex gap-3">
      <div className="relative w-14 h-14 rounded-full overflow-hidden flex-shrink-0 bg-[var(--border)]">
        <Image src={image} alt={name} fill className="object-cover" unoptimized />
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-medium text-sm">{name}</p>
        {phone && (
          <a
            href={`tel:${phone.replace(/\s/g, "")}`}
            onClick={onCall}
            className="inline-block mt-1 text-sm text-[var(--accent)] hover:underline"
          >
            📞 Call {phone}
          </a>
        )}
        {onCall && (
          <button
            type="button"
            onClick={onCall}
            className="mt-2 text-xs px-3 py-1.5 rounded bg-[var(--accent)] text-white"
          >
            Call Now
          </button>
        )}
      </div>
    </div>
  );
}
