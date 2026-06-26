import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatDuration } from "../../lib/format";
import type { FocusTimeline } from "../../lib/types";

export function FocusTimelineChart({
  timeline,
  hidden,
  colorFor,
  xFormat,
  height = 320,
}: {
  timeline: FocusTimeline;
  hidden: Set<number>;
  colorFor: (id: number) => string;
  xFormat: (ts: number) => string;
  height?: number;
}) {
  const visible = timeline.series.filter((s) => !hidden.has(s.id));

  if (timeline.series.length === 0) {
    return (
      <div
        className="flex items-center justify-center text-sm text-neutral-500"
        style={{ height }}
      >
        No focus activity in range
      </div>
    );
  }

  // Cumulative per series (each series cumulates independently; hidden ones are
  // simply not written into the stacked rows).
  const running = new Map<number, number>();
  const data = timeline.points.map((p) => {
    const row: Record<string, number> = { ts: p.ts };
    timeline.series.forEach((s, i) => {
      running.set(s.id, (running.get(s.id) ?? 0) + (p.secs[i] ?? 0));
      if (!hidden.has(s.id)) row[String(s.id)] = running.get(s.id)!;
    });
    return row;
  });

  const nameFor = (id: number) => {
    const s = timeline.series.find((x) => x.id === id);
    if (!s) return String(id);
    return s.appName && s.title !== "Other" ? `${s.title} — ${s.appName}` : s.title;
  };

  return (
    <div style={{ width: "100%", height }}>
      <ResponsiveContainer>
        <AreaChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#262626" vertical={false} />
          <XAxis
            dataKey="ts"
            tickFormatter={(v) => xFormat(Number(v))}
            stroke="#666"
            fontSize={11}
            minTickGap={40}
          />
          <YAxis
            tickFormatter={(v) => formatDuration(Number(v))}
            stroke="#666"
            fontSize={11}
            width={64}
          />
          <Tooltip
            contentStyle={{
              background: "#161616",
              border: "1px solid #262626",
              borderRadius: 8,
              fontSize: 12,
              maxHeight: 260,
              overflow: "auto",
            }}
            labelFormatter={(l) => xFormat(Number(l))}
            itemSorter={(item) => -(item.value as number)}
            formatter={(value, name) => [formatDuration(Number(value)), nameFor(Number(name))]}
          />
          {visible.map((s) => (
            <Area
              key={s.id}
              type="monotone"
              dataKey={String(s.id)}
              name={String(s.id)}
              stackId="focus"
              stroke={colorFor(s.id)}
              fill={colorFor(s.id)}
              fillOpacity={0.55}
              strokeWidth={1}
              isAnimationActive={false}
              dot={false}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
