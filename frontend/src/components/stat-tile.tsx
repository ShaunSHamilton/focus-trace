import type { ReactNode } from "react";

export function StatTile({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  accent?: string;
}) {
  return (
    <div className="rounded-xl border border-[#262626] bg-[#161616] p-4">
      <div className="text-xs uppercase tracking-wide text-neutral-500">{label}</div>
      <div
        className="mt-1 truncate text-2xl font-semibold tabular-nums"
        style={accent ? { color: accent } : undefined}
        title={typeof value === "string" ? value : undefined}
      >
        {value}
      </div>
      {sub && <div className="mt-0.5 truncate text-xs text-neutral-400">{sub}</div>}
    </div>
  );
}
