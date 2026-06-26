// Panel-kind registry: the catalog of data sources a dashboard panel can bind
// to. Each kind knows how to (a) load its data for a time range via existing
// IPC commands and (b) turn that data into an ECharts option for a chart type.
// A panel row in SQLite stores only `kind` + `chartType` + args + range; this
// registry is the behaviour those keys map to.

import type { EChartsOption } from "echarts";
import {
  areaOption,
  barOption,
  calendarOption,
  donutOption,
  focusTimelineOption,
  gaugeOption,
} from "./echarts";
import { COLORS, seriesColor } from "./colors";
import { formatBytes, formatClock, formatDuration, formatPercent } from "./format";
import {
  appHistory,
  focusByDay,
  focusSummary,
  focusTimeline,
  liveSnapshot,
  listApps,
  networkHistory,
  networkTotals,
} from "./ipc";
import { rangeBounds, RANGES, type Range, type RangeKey } from "./range";

export type ChartType = "area" | "bar" | "donut" | "calendar" | "gauge";

export const CHART_LABELS: Record<ChartType, string> = {
  area: "Area",
  bar: "Bar",
  donut: "Donut",
  calendar: "Calendar heatmap",
  gauge: "Gauge",
};

export interface ArgField {
  key: string;
  label: string;
  type: "app"; // only the app picker for now
}

export interface PanelKind {
  key: string;
  label: string;
  group: string;
  chartTypes: ChartType[];
  defaultTitle: string;
  defaultRange: RangeKey;
  /** Re-fetch on every telemetry tick (live panels). */
  live?: boolean;
  /** Hide the range selector for kinds that ignore time (e.g. live gauge). */
  usesRange?: boolean;
  argFields?: ArgField[];
  load: (args: Record<string, unknown>, range: Range) => Promise<unknown>;
  toOption: (raw: unknown, chartType: ChartType, range: Range) => EChartsOption | null;
}

function xFormatFor(range: Range) {
  return (ts: number) =>
    range.secs <= 86_400
      ? formatClock(ts)
      : new Date(ts * 1000).toLocaleString([], {
          month: "numeric",
          day: "numeric",
          hour: "2-digit",
        });
}

const cores = (typeof navigator !== "undefined" && navigator.hardwareConcurrency) || 8;

const KINDS: PanelKind[] = [
  {
    key: "focus_timeline",
    label: "Focused windows over time",
    group: "Focus",
    chartTypes: ["area"],
    defaultTitle: "Focused windows over time",
    defaultRange: "24h",
    live: true,
    usesRange: true,
    load: (_a, range) => {
      const { from, to } = rangeBounds(range.secs);
      return focusTimeline(from, to, range.bucket, 20);
    },
    toOption: (raw, _ct, range) => {
      const t = raw as Awaited<ReturnType<typeof focusTimeline>>;
      if (!t.series.length) return null;
      const map = new Map<number, string>();
      t.series.forEach((s, i) => map.set(s.id, s.id === -1 ? "#737373" : seriesColor(i)));
      const colorFor = (id: number) => map.get(id) ?? "#737373";
      return focusTimelineOption(t, new Set(), colorFor, xFormatFor(range), formatDuration);
    },
  },
  {
    key: "focus_summary",
    label: "Focus time by app",
    group: "Focus",
    chartTypes: ["bar"],
    defaultTitle: "Focus time by app",
    defaultRange: "24h",
    live: true,
    usesRange: true,
    load: (_a, range) => {
      const { from, to } = rangeBounds(range.secs);
      return focusSummary(from, to, 12);
    },
    toOption: (raw) => {
      const rows = raw as Awaited<ReturnType<typeof focusSummary>>;
      if (!rows.length) return null;
      return barOption({
        items: rows.map((r) => ({ name: r.name, value: r.focusSecs })),
        color: COLORS.accent,
        valueFormat: formatDuration,
      });
    },
  },
  {
    key: "focus_calendar",
    label: "Focus by day (calendar)",
    group: "Focus",
    chartTypes: ["calendar"],
    defaultTitle: "Focus by day",
    defaultRange: "30d",
    usesRange: true,
    load: (_a, range) => {
      const { from, to } = rangeBounds(range.secs);
      return focusByDay(from, to);
    },
    toOption: (raw, _ct, range) => {
      const days = raw as Awaited<ReturnType<typeof focusByDay>>;
      if (!days.length) return null;
      const { from, to } = rangeBounds(range.secs);
      return calendarOption({
        days: days.map((d) => ({ day: d.day, secs: d.focusSecs })),
        from,
        to,
        valueFormat: formatDuration,
        color: COLORS.accent,
      });
    },
  },
  {
    key: "top_apps",
    label: "Top apps by CPU",
    group: "Apps",
    chartTypes: ["bar"],
    defaultTitle: "Top apps by CPU",
    defaultRange: "24h",
    usesRange: true,
    load: (_a, range) => listApps(range.secs),
    toOption: (raw) => {
      const apps = raw as Awaited<ReturnType<typeof listApps>>;
      const items = [...apps]
        .sort((a, b) => b.avgCpuPct - a.avgCpuPct)
        .slice(0, 12)
        .map((a) => ({ name: a.name, value: a.avgCpuPct }));
      if (!items.length) return null;
      return barOption({ items, color: COLORS.cpu, valueFormat: formatPercent });
    },
  },
  {
    key: "app_cpu",
    label: "App CPU history",
    group: "Apps",
    chartTypes: ["area"],
    defaultTitle: "CPU usage",
    defaultRange: "1h",
    usesRange: true,
    argFields: [{ key: "appId", label: "Application", type: "app" }],
    load: (args, range) => {
      const { from, to } = rangeBounds(range.secs);
      return appHistory(Number(args.appId), from, to, range.bucket);
    },
    toOption: (raw, _ct, range) => {
      const pts = raw as Awaited<ReturnType<typeof appHistory>>;
      if (!pts.length) return null;
      return areaOption({
        data: pts.map((p) => ({ ts: p.ts, cpu: p.cpuPct })),
        series: [{ key: "cpu", name: "CPU %", color: COLORS.cpu }],
        yFormat: formatPercent,
        xFormat: xFormatFor(range),
      });
    },
  },
  {
    key: "app_mem",
    label: "App memory history",
    group: "Apps",
    chartTypes: ["area"],
    defaultTitle: "Memory",
    defaultRange: "1h",
    usesRange: true,
    argFields: [{ key: "appId", label: "Application", type: "app" }],
    load: (args, range) => {
      const { from, to } = rangeBounds(range.secs);
      return appHistory(Number(args.appId), from, to, range.bucket);
    },
    toOption: (raw, _ct, range) => {
      const pts = raw as Awaited<ReturnType<typeof appHistory>>;
      if (!pts.length) return null;
      return areaOption({
        data: pts.map((p) => ({ ts: p.ts, mem: p.memBytes })),
        series: [{ key: "mem", name: "Memory", color: COLORS.mem }],
        yFormat: formatBytes,
        xFormat: xFormatFor(range),
      });
    },
  },
  {
    key: "net_throughput",
    label: "Network throughput",
    group: "Network",
    chartTypes: ["area"],
    defaultTitle: "Network throughput",
    defaultRange: "24h",
    usesRange: true,
    load: (_a, range) => {
      const { from, to } = rangeBounds(range.secs);
      return networkHistory(from, to, range.bucket);
    },
    toOption: (raw, _ct, range) => {
      const hist = raw as Awaited<ReturnType<typeof networkHistory>>;
      if (!hist.length) return null;
      return areaOption({
        data: hist.map((p) => ({
          ts: p.ts,
          wifi: p.wifiInB + p.wifiOutB,
          eth: p.ethInB + p.ethOutB,
        })),
        series: [
          { key: "wifi", name: "Wi-Fi", color: COLORS.wifi },
          { key: "eth", name: "Ethernet", color: COLORS.eth },
        ],
        yFormat: formatBytes,
        xFormat: xFormatFor(range),
        stacked: true,
      });
    },
  },
  {
    key: "net_split",
    label: "Connection split",
    group: "Network",
    chartTypes: ["donut"],
    defaultTitle: "Connection split",
    defaultRange: "24h",
    usesRange: true,
    load: (_a, range) => {
      const { from, to } = rangeBounds(range.secs);
      return networkTotals(from, to);
    },
    toOption: (raw) => {
      const t = raw as Awaited<ReturnType<typeof networkTotals>>;
      const data = [
        { name: "Wi-Fi", value: t.wifiInB + t.wifiOutB, color: COLORS.wifi },
        { name: "Ethernet", value: t.ethInB + t.ethOutB, color: COLORS.eth },
        { name: "Other", value: t.otherInB + t.otherOutB, color: "#737373" },
      ].filter((d) => d.value > 0);
      if (!data.length) return null;
      return donutOption({ data, valueFormat: formatBytes });
    },
  },
  {
    key: "live_cpu",
    label: "Live total CPU (gauge)",
    group: "Live",
    chartTypes: ["gauge"],
    defaultTitle: "Total CPU",
    defaultRange: "1h",
    live: true,
    usesRange: false,
    load: () => liveSnapshot(),
    toOption: (raw) => {
      const snap = raw as Awaited<ReturnType<typeof liveSnapshot>>;
      const value = snap ? snap.apps.reduce((s, a) => s + a.cpuPct, 0) : 0;
      return gaugeOption({
        value: Math.round(value),
        max: 100 * cores,
        color: COLORS.cpu,
        valueFormat: (v) => formatPercent(v),
      });
    },
  },
];

export const PANEL_KINDS: Record<string, PanelKind> = Object.fromEntries(
  KINDS.map((k) => [k.key, k]),
);

export const PANEL_LIST = KINDS;

/** All args declared by a kind are present (e.g. an app was picked). */
export function argsReady(kind: PanelKind, args: Record<string, unknown>): boolean {
  return (kind.argFields ?? []).every((f) => args[f.key] != null && args[f.key] !== "");
}

export function rangeFor(key: string): Range {
  return RANGES.find((r) => r.key === key) ?? RANGES[1];
}
