// Typed wrappers over Tauri IPC commands. Tauri converts camelCase JS args to
// the Rust commands' snake_case parameters automatically.

import { invoke } from "@tauri-apps/api/core";
import type {
  AppAggregate,
  FocusSummaryRow,
  LiveSnapshot,
  MetricPoint,
  NetPoint,
  NetTotals,
  TrackingConfig,
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

export const getTrackingConfig = () =>
  invoke<TrackingConfig>("get_tracking_config");

export const setTrackingConfig = (config: TrackingConfig) =>
  invoke<void>("set_tracking_config", { config });
