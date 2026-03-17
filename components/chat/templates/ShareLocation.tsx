"use client";

interface Props {
  data: Record<string, unknown>;
  onShareLocation?: () => void;
  onDenyLocation?: () => void;
}

export function ShareLocation({ data, onShareLocation, onDenyLocation }: Props) {
  return (
    <div className="rounded-2xl border border-[#E8E8E8] bg-white p-4">
      <p className="text-sm text-[#111] mb-3">
        Share your location to see properties near you.
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onShareLocation}
          className="flex-1 py-2.5 rounded-xl bg-[#6033EE] text-white text-sm font-semibold hover:bg-[#4f27d4] transition-colors"
        >
          Share location
        </button>
        <button
          type="button"
          onClick={onDenyLocation}
          className="flex-1 py-2.5 rounded-xl border border-[#E8E8E8] text-[#111] text-sm font-semibold hover:bg-[#F5F5F5] transition-colors"
        >
          Not now
        </button>
      </div>
    </div>
  );
}
