import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { formatBytes } from "../../lib/format";

export interface DonutSlice {
  name: string;
  value: number;
  color: string;
}

export function DonutChart({
  data,
  height = 220,
}: {
  data: DonutSlice[];
  height?: number;
}) {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (total <= 0) {
    return (
      <div
        className="flex items-center justify-center text-sm text-neutral-500"
        style={{ height }}
      >
        No network traffic in range
      </div>
    );
  }

  return (
    <div style={{ width: "100%", height }}>
      <ResponsiveContainer>
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            innerRadius="58%"
            outerRadius="82%"
            paddingAngle={2}
            stroke="none"
          >
            {data.map((d) => (
              <Cell key={d.name} fill={d.color} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              background: "#161616",
              border: "1px solid #262626",
              borderRadius: 8,
              fontSize: 12,
            }}
            formatter={(value) => formatBytes(Number(value))}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
