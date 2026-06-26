import { useState } from "react";
import { Card } from "../components/card";
import { Page } from "../components/page";
import { TimeRangeSelector } from "../components/time-range-selector";
import { useCommand } from "../hooks/use-command";
import { COLORS } from "../lib/colors";
import { formatDuration } from "../lib/format";
import { focusSummary } from "../lib/ipc";
import { RANGES, rangeBounds, type RangeKey } from "../lib/range";

export function FocusView() {
  const [rangeKey, setRangeKey] = useState<RangeKey>("24h");
  const range = RANGES.find((r) => r.key === rangeKey)!;

  const { data, loading } = useCommand(() => {
    const { from, to } = rangeBounds(range.secs);
    return focusSummary(from, to, 30);
  }, [rangeKey]);

  const rows = data ?? [];
  const max = Math.max(1, ...rows.map((r) => r.focusSecs));

  return (
    <Page
      title="Focus time"
      action={<TimeRangeSelector value={rangeKey} onChange={setRangeKey} />}
    >
      <Card title="Time in foreground, by app">
        {loading && !data && <p className="text-sm text-neutral-500">Loading…</p>}
        {!loading && rows.length === 0 && (
          <p className="text-sm text-neutral-500">No focus activity in this range.</p>
        )}
        <ul className="flex flex-col gap-2">
          {rows.map((r) => (
            <li key={r.appId} className="flex items-center gap-3">
              <span className="w-40 shrink-0 truncate text-sm" title={r.name}>
                {r.name}
              </span>
              <div className="relative h-6 flex-1 overflow-hidden rounded bg-[#1a1a1a]">
                <div
                  className="h-full rounded"
                  style={{
                    width: `${(r.focusSecs / max) * 100}%`,
                    background: COLORS.accent,
                    opacity: 0.85,
                  }}
                />
              </div>
              <span className="w-20 shrink-0 text-right text-sm tabular-nums text-neutral-300">
                {formatDuration(r.focusSecs)}
              </span>
            </li>
          ))}
        </ul>
      </Card>
    </Page>
  );
}
