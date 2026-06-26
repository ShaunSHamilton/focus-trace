import { donutOption, type DonutSlice } from "../../lib/echarts";
import { formatBytes } from "../../lib/format";
import { ChartEmpty, EChart } from "./echart";

export type { DonutSlice };

export function DonutChart({
  data,
  height = 220,
}: {
  data: DonutSlice[];
  height?: number;
}) {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (total <= 0)
    return <ChartEmpty message="No network traffic in range" height={height} />;

  return <EChart height={height} option={donutOption({ data, valueFormat: formatBytes })} />;
}
