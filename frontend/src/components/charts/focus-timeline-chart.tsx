import { focusTimelineOption } from "../../lib/echarts";
import { formatDuration } from "../../lib/format";
import type { FocusTimeline } from "../../lib/types";
import { ChartEmpty, EChart } from "./echart";

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
  if (timeline.series.length === 0)
    return <ChartEmpty message="No focus activity in range" height={height} />;

  return (
    <EChart
      height={height}
      option={focusTimelineOption(timeline, hidden, colorFor, xFormat, formatDuration)}
    />
  );
}
