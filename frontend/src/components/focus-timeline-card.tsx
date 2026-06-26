import { memo, useMemo, useState } from "react";
import { useCommand } from "../hooks/use-command";
import { seriesColor } from "../lib/colors";
import { formatClock, formatDuration } from "../lib/format";
import { focusTimeline } from "../lib/ipc";
import { FOCUS_RANGES, rangeBounds, type FocusRangeKey } from "../lib/range";
import { Card } from "./card";
import { FocusTimelineChart } from "./charts/focus-timeline-chart";

export const FocusTimelineCard = memo(function FocusTimelineCard() {
  const [rangeKey, setRangeKey] = useState<FocusRangeKey>("1d");
  const [hidden, setHidden] = useState<Set<number>>(new Set());
  const range = FOCUS_RANGES.find((r) => r.key === rangeKey)!;

  const { data, loading, error } = useCommand(
    () => {
      const { from, to } = rangeBounds(range.secs);
      return focusTimeline(from, to, range.bucket, 30);
    },
    [rangeKey],
    { live: true },
  );

  // Stable color per series (the aggregated "Other" series is neutral grey).
  const colorFor = useMemo(() => {
    const map = new Map<number, string>();
    (data?.series ?? []).forEach((s, i) => map.set(s.id, s.id === -1 ? "#737373" : seriesColor(i)));
    return (id: number) => map.get(id) ?? "#737373";
  }, [data]);

  const xFormat = (ts: number) => {
    if (range.secs <= 86_400) return formatClock(ts);
    return new Date(ts * 1000).toLocaleString([], {
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
    });
  };

  const selectRange = (k: FocusRangeKey) => {
    setHidden(new Set());
    setRangeKey(k);
  };

  const toggle = (id: number) =>
    setHidden((h) => {
      const next = new Set(h);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const series = data?.series ?? [];

  return (
    <Card
      title="Focused windows over time"
      className="mt-4"
      action={
        <div className="inline-flex flex-wrap rounded-lg border border-[#262626] bg-[#0f0f0f] p-0.5 text-xs">
          {FOCUS_RANGES.map((r) => (
            <button
              key={r.key}
              onClick={() => selectRange(r.key)}
              className={`rounded-md px-2 py-1 transition ${
                rangeKey === r.key
                  ? "bg-[#262626] text-neutral-100"
                  : "text-neutral-500 hover:text-neutral-300"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      }
    >
      {error && <p className="text-sm text-red-400">{error}</p>}
      {loading && !data && <p className="text-sm text-neutral-500">Loading…</p>}

      {data && (
        <>
          <FocusTimelineChart
            timeline={data}
            hidden={hidden}
            colorFor={colorFor}
            xFormat={xFormat}
          />

          {series.length > 0 && (
            <div className="mt-3">
              <div className="mb-1.5 flex items-center gap-3 text-xs text-neutral-500">
                <span>
                  {series.length - hidden.size} of {series.length} shown
                </span>
                <button onClick={() => setHidden(new Set())} className="hover:text-neutral-300">
                  All
                </button>
                <button
                  onClick={() => setHidden(new Set(series.map((s) => s.id)))}
                  className="hover:text-neutral-300"
                >
                  None
                </button>
              </div>
              <div className="flex max-h-32 flex-wrap gap-1.5 overflow-auto">
                {series.map((s) => {
                  const off = hidden.has(s.id);
                  return (
                    <button
                      key={s.id}
                      onClick={() => toggle(s.id)}
                      title={s.appName ? `${s.title} — ${s.appName}` : s.title}
                      className={`flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs transition ${
                        off
                          ? "border-[#222] text-neutral-600"
                          : "border-[#333] text-neutral-300 hover:bg-[#1c1c1c]"
                      }`}
                    >
                      <span
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ background: colorFor(s.id), opacity: off ? 0.3 : 1 }}
                      />
                      <span className="max-w-[180px] truncate">{s.title}</span>
                      <span className="text-neutral-500">{formatDuration(s.totalSecs)}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </Card>
  );
});
