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

export interface WindowFocusRow {
  appId: number;
  name: string;
  title: string;
  focusSecs: number;
}

export interface TrackingConfig {
  ignoreSystemProcesses: boolean;
  pollSecs: number;
  rawRetentionDays: number;
  ignoreExes: string[];
  forceTrackExes: string[];
}
