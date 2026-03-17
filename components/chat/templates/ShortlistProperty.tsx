"use client";

interface Props {
  data: Record<string, unknown>;
}

export function ShortlistProperty({ data }: Props) {
  return (
    <div className="rounded-2xl border border-[#E8E8E8] bg-white p-4">
      <p className="text-sm text-[#111]">
        You can shortlist this property from the carousel above. Log in to save it to your profile.
      </p>
    </div>
  );
}
