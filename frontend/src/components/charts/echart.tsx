import type { EChartsOption } from "echarts";
import ReactECharts from "echarts-for-react";
import { useEffect, useRef } from "react";

/**
 * Thin canvas-rendered ECharts wrapper. Observes its own container so charts
 * follow grid-panel resizes (echarts-for-react only tracks window resize).
 */
export function EChart({
  option,
  height = 240,
}: {
  option: EChartsOption;
  height?: number | string;
}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chart = useRef<any>(null);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => chart.current?.getEchartsInstance()?.resize());
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={box} style={{ height, width: "100%" }}>
      <ReactECharts
        ref={chart}
        option={option}
        notMerge
        lazyUpdate
        style={{ height: "100%", width: "100%" }}
        opts={{ renderer: "canvas" }}
      />
    </div>
  );
}

/** Centered placeholder shown when a chart has no data to render. */
export function ChartEmpty({
  message,
  height = 240,
}: {
  message: string;
  height?: number | string;
}) {
  return (
    <div
      className="flex h-full items-center justify-center text-sm text-neutral-500"
      style={{ minHeight: typeof height === "number" ? height : undefined }}
    >
      {message}
    </div>
  );
}
