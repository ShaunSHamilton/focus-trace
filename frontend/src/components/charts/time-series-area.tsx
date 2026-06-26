import { areaOption, type Series } from "../../lib/echarts";
import { formatClock } from "../../lib/format";
import { ChartEmpty, EChart } from "./echart";

export type { Series };

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
  if (!data.length) return <ChartEmpty message="No data in range" height={height} />;

  return (
    <EChart
      height={height}
      option={areaOption({ data, series, yFormat, xFormat: formatClock, stacked })}
    />
  );
}
