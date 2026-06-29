// TS mirrors of the Rust DTOs (serde camelCase). See backend/src/dto.rs.

export interface AppSnapshot {
  appId: number;
  name: string;
  exePath: string;
  isSystem: boolean;
  cpuPct: number;
  memBytes: number;
  diskReadB: number;
  diskWriteB: number;
  runSecs: number;
  isFocused: boolean;
}

export interface NetSnapshot {
  wifiInB: number;
  wifiOutB: number;
  ethInB: number;
  ethOutB: number;
  otherInB: number;
  otherOutB: number;
}

export interface LiveSnapshot {
  ts: number;
  apps: AppSnapshot[];
  net: NetSnapshot;
  focusedAppId: number | null;
  focusedTitle: string | null;
}

export interface AppAggregate {
  appId: number;
  name: string;
  exePath: string;
  isSystem: boolean;
  lastSeen: number;
  totalFocusSecs: number;
  totalRunSecs: number;
  avgCpuPct: number;
  avgMemBytes: number;
}

export interface MetricPoint {
  ts: number;
  cpuPct: number;
  memBytes: number;
  diskReadB: number;
  diskWriteB: number;
}

export interface NetPoint {
  ts: number;
  wifiInB: number;
  wifiOutB: number;
  ethInB: number;
  ethOutB: number;
  otherInB: number;
  otherOutB: number;
}

export interface NetTotals {
  wifiInB: number;
  wifiOutB: number;
  ethInB: number;
  ethOutB: number;
  otherInB: number;
  otherOutB: number;
}

export interface FocusSummaryRow {
  appId: number;
  name: string;
  focusSecs: number;
}

export interface TitleFocusRow {
  title: string;
  focusSecs: number;
}

export interface BrowserProfileRow {
  profile: string;
  focusSecs: number;
}

export interface UrlRow {
  url: string;
  focusSecs: number;
}

export interface WindowFocusRow {
  appId: number;
  name: string;
  title: string;
  focusSecs: number;
}

export interface FocusTimelineSeries {
  id: number; // title id; 0 = "(no title)", -1 = "Other". In group mode: group id.
  appName: string;
  title: string;
  totalSecs: number;
  color: string; // explicit color (group mode); empty = pick by index
}

// ── Focus groups ────────────────────────────────────────────────────────────

export type GroupField = "exe" | "title" | "browser_profile" | "url";
export type GroupOp = "contains" | "equals" | "regex";

export interface FocusGroupRule {
  field: GroupField;
  op: GroupOp;
  value: string;
}

export interface FocusGroup {
  id: number;
  name: string;
  color: string;
  rules: FocusGroupRule[];
}

/** Group payload sent on save (server assigns id/order). */
export interface FocusGroupInput {
  name: string;
  color: string;
  rules: FocusGroupRule[];
}

export interface FocusGroupSummaryRow {
  groupId: number; // 0 = "Ungrouped"
  name: string;
  color: string;
  focusSecs: number;
}

/** Known executables + titles + browser profiles + URLs for autocompleting group rule values. */
export interface FocusFilterOptions {
  exes: string[];
  titles: string[];
  browserProfiles: string[];
  urls: string[];
}

export interface FocusTimelinePoint {
  ts: number;
  secs: number[]; // aligned to FocusTimeline.series order
}

export interface FocusTimeline {
  bucketSecs: number;
  series: FocusTimelineSeries[];
  points: FocusTimelinePoint[];
}

export interface DayFocus {
  day: number; // unix secs at UTC midnight
  focusSecs: number;
}

export interface Panel {
  id: number;
  dashboardId: number;
  title: string;
  kind: string;
  chartType: string;
  argsJson: string;
  rangeKey: string;
  x: number;
  y: number;
  w: number;
  h: number;
  sort: number;
}

export interface Dashboard {
  id: number;
  name: string;
  isDefault: boolean;
  sort: number;
  panels: Panel[];
}

/** Panel payload sent on save (server assigns id/dashboardId). */
export interface PanelInput {
  title: string;
  kind: string;
  chartType: string;
  argsJson: string;
  rangeKey: string;
  x: number;
  y: number;
  w: number;
  h: number;
  sort: number;
}

export interface TrackingConfig {
  ignoreSystemProcesses: boolean;
  pollSecs: number;
  rawRetentionDays: number;
  ignoreExes: string[];
  forceTrackExes: string[];
}
