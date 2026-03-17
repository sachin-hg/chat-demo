"use client";

interface QuarterRow {
  quarter: string;
  changePercent: number;
}

interface Props {
  data: Record<string, unknown>;
}

export function PriceTrend({ data }: Props) {
  const localityName = (data.localityName as string) ?? "";
  const city = (data.city as string) ?? "";
  const quarters = (data.quarters as QuarterRow[]) ?? [];
  const title = localityName && city ? `Price trend — ${localityName}, ${city}` : "Price trend";

  return (
    <div className="rounded-2xl border border-[#E8E8E8] bg-white overflow-hidden">
      <div className="px-4 py-3 border-b border-[#E8E8E8]">
        <p className="font-bold text-sm text-[#111]">{title}</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[200px] text-sm">
          <thead>
            <tr className="border-b border-[#E8E8E8] bg-[#F8F8F8]">
              <th className="px-4 py-2.5 text-left font-semibold text-[#111]">Quarter</th>
              <th className="px-4 py-2.5 text-right font-semibold text-[#111]">QoQ Change</th>
            </tr>
          </thead>
          <tbody>
            {quarters.map((row, idx) => (
              <tr key={idx} className="border-b border-[#F2F2F2] last:border-0">
                <td className="px-4 py-2.5 text-[#111]">{row.quarter}</td>
                <td className={`px-4 py-2.5 text-right font-medium ${row.changePercent >= 0 ? "text-green-600" : "text-red-500"}`}>
                  {row.changePercent >= 0 ? "↑" : "↓"} {Math.abs(row.changePercent)}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
