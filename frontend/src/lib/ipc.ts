// Typed wrappers over Tauri IPC commands. Tauri converts camelCase JS args to
// the Rust commands' snake_case parameters automatically.

import { invoke } from "@tauri-apps/api/core";
import type {
  AppAggregate,
  FocusSummaryRow,
  FocusTimeline,
  LiveSnapshot,
  MetricPoint,
  NetPoint,
  NetTotals,
  TitleFocusRow,
  TrackingConfig,
  WindowFocusRow,
} from "./types";

export const restartApp = () => invoke<void>("restart_app");

export const liveSnapshot = () => invoke<LiveSnapshot | null>("live_snapshot");

export const listApps = (windowSecs?: number) =>
  invoke<AppAggregate[]>("list_apps", { windowSecs });

export const appHistory = (
  appId: number,
  from: number,
  to: number,
  bucketSecs?: number,
) => invoke<MetricPoint[]>("app_history", { appId, from, to, bucketSecs });

export const networkHistory = (from: number, to: number, bucketSecs?: number) =>
  invoke<NetPoint[]>("network_history", { from, to, bucketSecs });

export const networkTotals = (from: number, to: number) =>
  invoke<NetTotals>("network_totals", { from, to });

export const focusSummary = (from: number, to: number, limit?: number) =>
  invoke<FocusSummaryRow[]>("focus_summary", { from, to, limit });

export const appWindowFocus = (
  appId: number,
  from: number,
  to: number,
  limit?: number,
) => invoke<TitleFocusRow[]>("app_window_focus", { appId, from, to, limit });

export const windowFocusSummary = (from: number, to: number, limit?: number) =>
  invoke<WindowFocusRow[]>("window_focus_summary", { from, to, limit });

export const focusTimeline = (
  from: number,
  to: number,
  bucketSecs?: number,
  limit?: number,
) => invoke<FocusTimeline>("focus_timeline", { from, to, bucketSecs, limit });

export const getTrackingConfig = () =>
  invoke<TrackingConfig>("get_tracking_config");

export const setTrackingConfig = (config: TrackingConfig) =>
  invoke<void>("set_tracking_config", { config });
