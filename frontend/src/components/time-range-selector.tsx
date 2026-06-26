import { RANGES, type RangeKey } from "../lib/range";

export function TimeRangeSelector({
  value,
  onChange,
}: {
  value: RangeKey;
  onChange: (k: RangeKey) => void;
}) {
  return (
    <div className="inline-flex rounded-lg border border-[#262626] bg-[#0f0f0f] p-0.5 text-xs">
      {RANGES.map((r) => (
        <button
          key={r.key}
          onClick={() => onChange(r.key)}
          className={`rounded-md px-2.5 py-1 transition ${
            value === r.key
              ? "bg-[#262626] text-neutral-100"
              : "text-neutral-500 hover:text-neutral-300"
          }`}
        >
          {r.label}
        </button>
      ))}
    </div>
  );
}
