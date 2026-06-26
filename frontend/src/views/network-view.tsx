import { useState } from "react";
import { Card } from "../components/card";
import { DonutChart } from "../components/charts/donut-chart";
import { TimeSeriesArea } from "../components/charts/time-series-area";
import { Page } from "../components/page";
import { StatTile } from "../components/stat-tile";
import { TimeRangeSelector } from "../components/time-range-selector";
import { useCommand } from "../hooks/use-command";
import { COLORS } from "../lib/colors";
import { formatBytes } from "../lib/format";
import { networkHistory, networkTotals } from "../lib/ipc";
import { RANGES, rangeBounds, type RangeKey } from "../lib/range";

export function NetworkView() {
  const [rangeKey, setRangeKey] = useState<RangeKey>("24h");
  const range = RANGES.find((r) => r.key === rangeKey)!;

  const { data: totals } = useCommand(() => {
    const { from, to } = rangeBounds(range.secs);
    return networkTotals(from, to);
  }, [rangeKey]);

  const { data: hist } = useCommand(() => {
    const { from, to } = rangeBounds(range.secs);
    return networkHistory(from, to, range.bucket);
  }, [rangeKey]);

  const t = totals ?? {
    wifiInB: 0,
    wifiOutB: 0,
    ethInB: 0,
    ethOutB: 0,
    otherInB: 0,
    otherOutB: 0,
  };

  const donut = [
    { name: "Wi-Fi", value: t.wifiInB + t.wifiOutB, color: COLORS.wifi },
    { name: "Ethernet", value: t.ethInB + t.ethOutB, color: COLORS.eth },
    { name: "Other", value: t.otherInB + t.otherOutB, color: "#737373" },
  ].filter((d) => d.value > 0);

  const series = (hist ?? []).map((p) => ({
    ts: p.ts,
    wifi: p.wifiInB + p.wifiOutB,
    eth: p.ethInB + p.ethOutB,
  }));

  return (
    <Page title="Network" action={<TimeRangeSelector value={rangeKey} onChange={setRangeKey} />}>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile
          label="Wi-Fi total"
          value={formatBytes(t.wifiInB + t.wifiOutB)}
          sub={`↓ ${formatBytes(t.wifiInB)}  ↑ ${formatBytes(t.wifiOutB)}`}
          accent={COLORS.wifi}
        />
        <StatTile
          label="Ethernet total"
          value={formatBytes(t.ethInB + t.ethOutB)}
          sub={`↓ ${formatBytes(t.ethInB)}  ↑ ${formatBytes(t.ethOutB)}`}
          accent={COLORS.eth}
        />
        <StatTile
          label="Download"
          value={formatBytes(t.wifiInB + t.ethInB + t.otherInB)}
          accent={COLORS.netIn}
        />
        <StatTile
          label="Upload"
          value={formatBytes(t.wifiOutB + t.ethOutB + t.otherOutB)}
          accent={COLORS.netOut}
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[320px_1fr]">
        <Card title="Connection split">
          <DonutChart data={donut} />
          <div className="mt-2 flex justify-center gap-4 text-xs text-neutral-400">
            <Legend color={COLORS.wifi} label="Wi-Fi" />
            <Legend color={COLORS.eth} label="Ethernet" />
          </div>
        </Card>

        <Card title="Throughput by connection">
          <TimeSeriesArea
            data={series}
            stacked
            series={[
              { key: "wifi", name: "Wi-Fi", color: COLORS.wifi },
              { key: "eth", name: "Ethernet", color: COLORS.eth },
            ]}
            yFormat={formatBytes}
          />
        </Card>
      </div>
    </Page>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="h-2 w-2 rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
}
