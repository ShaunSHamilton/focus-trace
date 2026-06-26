import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatClock } from "../../lib/format";

export interface Series {
  key: string;
  name: string;
  color: string;
}

const TOOLTIP_STYLE = {
  background: "#161616",
  border: "1px solid #262626",
  borderRadius: 8,
  fontSize: 12,
};

export function TimeSeriesArea({
  data,
  series,
  yFormat,
  height = 240,
  stacked = false,
}: {
  data: Record<string, number>[];
  series: Series[];
  yFormat: (v: number) => string;
  height?: number;
  stacked?: boolean;
}) {
  if (!data.length) {
    return (
      <div
        className="flex items-center justify-center text-sm text-neutral-500"
        style={{ height }}
      >
        No data in range
      </div>
    );
  }

  return (
    <div style={{ width: "100%", height }}>
      <ResponsiveContainer>
        <AreaChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 4 }}>
          <defs>
            {series.map((s) => (
              <linearGradient id={`grad-${s.key}`} key={s.key} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={s.color} stopOpacity={0.5} />
                <stop offset="100%" stopColor={s.color} stopOpacity={0.04} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#262626" vertical={false} />
          <XAxis
            dataKey="ts"
            tickFormatter={(v) => formatClock(Number(v))}
            stroke="#666"
            fontSize={11}
            minTickGap={32}
          />
          <YAxis
            tickFormatter={(v) => yFormat(Number(v))}
            stroke="#666"
            fontSize={11}
            width={60}
          />
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            labelFormatter={(l) => formatClock(Number(l))}
            formatter={(value) => yFormat(Number(value))}
          />
          {series.map((s) => (
            <Area
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.name}
              stroke={s.color}
              fill={`url(#grad-${s.key})`}
              strokeWidth={2}
              stackId={stacked ? "1" : undefined}
              isAnimationActive={false}
              dot={false}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
