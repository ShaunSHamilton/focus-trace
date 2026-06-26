import { useState } from "react";
import { Card } from "../components/card";
import { TimeSeriesArea } from "../components/charts/time-series-area";
import { Page } from "../components/page";
import { StatTile } from "../components/stat-tile";
import { TimeRangeSelector } from "../components/time-range-selector";
import { useCommand } from "../hooks/use-command";
import { COLORS } from "../lib/colors";
import { formatBytes, formatDuration, formatPercent } from "../lib/format";
import { appHistory } from "../lib/ipc";
import { RANGES, rangeBounds, type RangeKey } from "../lib/range";
import type { AppAggregate } from "../lib/types";

export function AppDetailView({ app, onBack }: { app: AppAggregate; onBack: () => void }) {
  const [rangeKey, setRangeKey] = useState<RangeKey>("1h");
  const range = RANGES.find((r) => r.key === rangeKey)!;

  const { data, loading } = useCommand(() => {
    const { from, to } = rangeBounds(range.secs);
    return appHistory(app.appId, from, to, range.bucket);
  }, [app.appId, rangeKey]);

  const points = data ?? [];
  const cpuData = points.map((p) => ({ ts: p.ts, cpu: p.cpuPct }));
  const memData = points.map((p) => ({ ts: p.ts, mem: p.memBytes }));

  return (
    <Page
      title={
        <span className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="rounded-lg border border-[#262626] px-2 py-1 text-xs text-neutral-400 hover:text-neutral-200"
          >
            ← Apps
          </button>
          {app.name}
          {app.isSystem && (
            <span className="rounded bg-[#2a2a2a] px-1.5 py-0.5 text-[10px] text-neutral-400">
              system
            </span>
          )}
        </span>
      }
      action={<TimeRangeSelector value={rangeKey} onChange={setRangeKey} />}
    >
      <p className="mb-4 -mt-2 max-w-3xl truncate text-[11px] text-neutral-600">{app.exePath}</p>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Focus time" value={formatDuration(app.totalFocusSecs)} />
        <StatTile label="Running time" value={formatDuration(app.totalRunSecs)} />
        <StatTile label="Avg CPU" value={formatPercent(app.avgCpuPct)} accent={COLORS.cpu} />
        <StatTile label="Avg RAM" value={formatBytes(app.avgMemBytes)} accent={COLORS.mem} />
      </div>

      <Card title="CPU usage" className="mt-4">
        <TimeSeriesArea
          data={cpuData}
          series={[{ key: "cpu", name: "CPU %", color: COLORS.cpu }]}
          yFormat={(v) => `${v.toFixed(0)}%`}
        />
      </Card>

      <Card title="Memory" className="mt-4">
        <TimeSeriesArea
          data={memData}
          series={[{ key: "mem", name: "Memory", color: COLORS.mem }]}
          yFormat={formatBytes}
        />
      </Card>

      {loading && <p className="mt-3 text-xs text-neutral-500">Loading…</p>}
    </Page>
  );
}
