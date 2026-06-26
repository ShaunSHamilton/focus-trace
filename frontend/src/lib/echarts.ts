// ECharts `option` builders. Every chart in the app (fixed views + dashboard
// builder panels) renders through one of these, fed into <EChart>. Keeping the
// option construction here means the React components stay declarative wrappers.

import type { EChartsOption } from "echarts";
import type { FocusTimeline } from "./types";

// ── Shared dark theme fragments (match the app's #161616 surfaces) ────────────

const AXIS_LINE = { lineStyle: { color: "#3a3a3a" } };
const SPLIT_LINE = { lineStyle: { color: "#262626" } };
const AXIS_LABEL = { color: "#8a8a8a", fontSize: 11 };

const TOOLTIP = {
  backgroundColor: "#161616",
  borderColor: "#262626",
  borderWidth: 1,
  textStyle: { color: "#e5e5e5", fontSize: 12 },
  extraCssText: "max-height:260px;overflow:auto;border-radius:8px;",
} as const;

const GRID = { left: 8, right: 16, top: 14, bottom: 6, containLabel: true };

const fmtDate = (ts: number) =>
  new Date(ts * 1000).toISOString().slice(0, 10); // YYYY-MM-DD (UTC day key)

export interface Series {
  key: string;
  name: string;
  color: string;
}

// ── Time-series stacked/overlaid area ─────────────────────────────────────────

export function areaOption(opts: {
  data: Record<string, number>[];
  series: Series[];
  yFormat: (v: number) => string;
  xFormat: (ts: number) => string;
  stacked?: boolean;
}): EChartsOption {
  const { data, series, yFormat, xFormat, stacked } = opts;
  return {
    grid: GRID,
    tooltip: {
      ...TOOLTIP,
      trigger: "axis",
      formatter: (params: any) => {
        const rows = Array.isArray(params) ? params : [params];
        const head = xFormat(Number(rows[0]?.axisValue) / 1000);
        const lines = rows
          .filter((r: any) => r.value != null)
          .map(
            (r: any) =>
              `${r.marker}${r.seriesName} <b>${yFormat(Number(r.value[1]))}</b>`,
          );
        return [head, ...lines].join("<br/>");
      },
    },
    xAxis: {
      type: "time",
      axisLine: AXIS_LINE,
      axisLabel: { ...AXIS_LABEL, formatter: (v: number) => xFormat(v / 1000) },
      splitLine: { show: false },
    },
    yAxis: {
      type: "value",
      axisLabel: { ...AXIS_LABEL, formatter: (v: number) => yFormat(v) },
      splitLine: SPLIT_LINE,
    },
    series: series.map((s) => ({
      name: s.name,
      type: "line",
      smooth: true,
      showSymbol: false,
      stack: stacked ? "total" : undefined,
      lineStyle: { width: 2, color: s.color },
      itemStyle: { color: s.color },
      areaStyle: { color: s.color, opacity: stacked ? 0.4 : 0.18 },
      data: data.map((d) => [d.ts * 1000, d[s.key] ?? 0]),
    })),
  };
}

// ── Donut ─────────────────────────────────────────────────────────────────────

export interface DonutSlice {
  name: string;
  value: number;
  color: string;
}

export function donutOption(opts: {
  data: DonutSlice[];
  valueFormat: (v: number) => string;
}): EChartsOption {
  const { data, valueFormat } = opts;
  return {
    tooltip: {
      ...TOOLTIP,
      trigger: "item",
      formatter: (p: any) =>
        `${p.marker}${p.name} <b>${valueFormat(Number(p.value))}</b> (${p.percent}%)`,
    },
    series: [
      {
        type: "pie",
        radius: ["58%", "82%"],
        padAngle: 2,
        itemStyle: { borderColor: "#161616", borderWidth: 1 },
        label: { show: false },
        data: data.map((d) => ({
          name: d.name,
          value: d.value,
          itemStyle: { color: d.color },
        })),
      },
    ],
  };
}

// ── Horizontal bar (top-N rankings) ───────────────────────────────────────────

export function barOption(opts: {
  items: { name: string; value: number }[];
  color: string;
  valueFormat: (v: number) => string;
}): EChartsOption {
  const { items, color, valueFormat } = opts;
  // Largest at the top: ECharts category axis renders bottom-up, so reverse.
  const rows = [...items].reverse();
  return {
    grid: { ...GRID, left: 8 },
    tooltip: {
      ...TOOLTIP,
      trigger: "axis",
      axisPointer: { type: "shadow" },
      formatter: (params: any) => {
        const r = (Array.isArray(params) ? params : [params])[0];
        return `${r.name}<br/>${r.marker}<b>${valueFormat(Number(r.value))}</b>`;
      },
    },
    xAxis: {
      type: "value",
      axisLabel: { ...AXIS_LABEL, formatter: (v: number) => valueFormat(v) },
      splitLine: SPLIT_LINE,
    },
    yAxis: {
      type: "category",
      data: rows.map((r) => r.name),
      axisLine: AXIS_LINE,
      axisLabel: { ...AXIS_LABEL, width: 120, overflow: "truncate" },
    },
    series: [
      {
        type: "bar",
        data: rows.map((r) => r.value),
        itemStyle: { color, borderRadius: [0, 3, 3, 0] },
        barMaxWidth: 18,
      },
    ],
  };
}

// ── Calendar heatmap ──────────────────────────────────────────────────────────

export function calendarOption(opts: {
  days: { day: number; secs: number }[];
  from: number;
  to: number;
  valueFormat: (v: number) => string;
  color: string;
}): EChartsOption {
  const { days, from, to, valueFormat, color } = opts;
  const max = Math.max(1, ...days.map((d) => d.secs));
  return {
    tooltip: {
      ...TOOLTIP,
      formatter: (p: any) => `${p.value[0]}<br/><b>${valueFormat(Number(p.value[1]))}</b>`,
    },
    visualMap: {
      min: 0,
      max,
      type: "continuous",
      orient: "horizontal",
      left: "center",
      bottom: 0,
      itemWidth: 12,
      itemHeight: 120,
      textStyle: { color: "#8a8a8a" },
      inRange: { color: ["#1f2a24", color] },
    },
    calendar: {
      top: 24,
      left: 36,
      right: 12,
      cellSize: ["auto", 14],
      range: [fmtDate(from), fmtDate(to)],
      itemStyle: { color: "#0f0f0f", borderColor: "#262626", borderWidth: 1 },
      splitLine: { show: false },
      yearLabel: { show: false },
      monthLabel: { color: "#8a8a8a", fontSize: 10 },
      dayLabel: { color: "#666", fontSize: 10, firstDay: 1 },
    },
    series: [
      {
        type: "heatmap",
        coordinateSystem: "calendar",
        data: days.map((d) => [fmtDate(d.day), d.secs]),
      },
    ],
  };
}

// ── Gauge (live single value) ─────────────────────────────────────────────────

export function gaugeOption(opts: {
  value: number;
  max: number;
  color: string;
  valueFormat: (v: number) => string;
}): EChartsOption {
  const { value, max, color, valueFormat } = opts;
  return {
    series: [
      {
        type: "gauge",
        min: 0,
        max,
        progress: { show: true, width: 14, itemStyle: { color } },
        axisLine: { lineStyle: { width: 14, color: [[1, "#262626"]] } },
        axisTick: { show: false },
        splitLine: { length: 8, lineStyle: { color: "#3a3a3a" } },
        axisLabel: { color: "#8a8a8a", fontSize: 10, distance: 14 },
        pointer: { itemStyle: { color } },
        anchor: { show: false },
        detail: {
          valueAnimation: true,
          formatter: () => valueFormat(value),
          color: "#e5e5e5",
          fontSize: 22,
          offsetCenter: [0, "70%"],
        },
        data: [{ value }],
      },
    ],
  };
}

// ── Focus timeline (cumulative per-window stacked area) ───────────────────────

export function focusTimelineOption(
  timeline: FocusTimeline,
  hidden: Set<number>,
  colorFor: (id: number) => string,
  xFormat: (ts: number) => string,
  formatDuration: (s: number) => string,
): EChartsOption {
  const visible = timeline.series.filter((s) => !hidden.has(s.id));
  const nameFor = (s: { id: number; appName: string; title: string }) =>
    s.appName && s.title !== "Other" ? `${s.title} — ${s.appName}` : s.title;

  // Cumulate each series independently across buckets (matches prior behaviour).
  const running = new Map<number, number>();
  const cumulative = new Map<number, [number, number][]>();
  timeline.series.forEach((s) => cumulative.set(s.id, []));
  timeline.points.forEach((p) => {
    timeline.series.forEach((s, i) => {
      running.set(s.id, (running.get(s.id) ?? 0) + (p.secs[i] ?? 0));
      cumulative.get(s.id)!.push([p.ts * 1000, running.get(s.id)!]);
    });
  });

  return {
    grid: { ...GRID, left: 8 },
    tooltip: {
      ...TOOLTIP,
      trigger: "axis",
      order: "valueDesc",
      formatter: (params: any) => {
        const rows = Array.isArray(params) ? params : [params];
        const head = xFormat(Number(rows[0]?.axisValue) / 1000);
        const lines = rows
          .filter((r: any) => r.value && r.value[1] > 0)
          .map((r: any) => `${r.marker}${r.seriesName} <b>${formatDuration(Number(r.value[1]))}</b>`);
        return [head, ...lines].join("<br/>");
      },
    },
    xAxis: {
      type: "time",
      axisLine: AXIS_LINE,
      axisLabel: { ...AXIS_LABEL, formatter: (v: number) => xFormat(v / 1000) },
      splitLine: { show: false },
    },
    yAxis: {
      type: "value",
      axisLabel: { ...AXIS_LABEL, formatter: (v: number) => formatDuration(v) },
      splitLine: SPLIT_LINE,
    },
    series: visible.map((s) => ({
      name: nameFor(s),
      type: "line",
      stack: "focus",
      smooth: true,
      showSymbol: false,
      lineStyle: { width: 1, color: colorFor(s.id) },
      itemStyle: { color: colorFor(s.id) },
      areaStyle: { color: colorFor(s.id), opacity: 0.55 },
      data: cumulative.get(s.id)!,
    })),
  };
}
