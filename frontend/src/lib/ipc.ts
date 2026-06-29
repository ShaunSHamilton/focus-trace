// Typed wrappers over Tauri IPC commands. Tauri converts camelCase JS args to
// the Rust commands' snake_case parameters automatically.

import { invoke } from "@tauri-apps/api/core";
import type {
  AppAggregate,
  BrowserProfileRow,
  Dashboard,
  DayFocus,
  FocusFilterOptions,
  FocusGroup,
  FocusGroupInput,
  FocusGroupSummaryRow,
  FocusSummaryRow,
  FocusTimeline,
  LiveSnapshot,
  MetricPoint,
  NetPoint,
  NetTotals,
  PanelInput,
  TitleFocusRow,
  TrackingConfig,
  UrlRow,
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

export const appBrowserProfileFocus = (
  appId: number,
  from: number,
  to: number,
  limit?: number,
) => invoke<BrowserProfileRow[]>("app_browser_profile_focus", { appId, from, to, limit });

export const appUrlFocus = (
  appId: number,
  from: number,
  to: number,
  limit?: number,
) => invoke<UrlRow[]>("app_url_focus", { appId, from, to, limit });

export const focusTimeline = (
  from: number,
  to: number,
  bucketSecs?: number,
  limit?: number,
) => invoke<FocusTimeline>("focus_timeline", { from, to, bucketSecs, limit });

export const focusByDay = (from: number, to: number) =>
  invoke<DayFocus[]>("focus_by_day", { from, to });

// ── Focus groups ────────────────────────────────────────────────────────────

export const listFocusGroups = () => invoke<FocusGroup[]>("list_focus_groups");

export const saveFocusGroups = (groups: FocusGroupInput[]) =>
  invoke<void>("save_focus_groups", { groups });

export const focusFilterOptions = () =>
  invoke<FocusFilterOptions>("focus_filter_options");

export const focusByGroup = (from: number, to: number) =>
  invoke<FocusGroupSummaryRow[]>("focus_by_group", { from, to });

export const focusGroupTimeline = (
  from: number,
  to: number,
  bucketSecs?: number,
) => invoke<FocusTimeline>("focus_group_timeline", { from, to, bucketSecs });

// ── Custom dashboards ─────────────────────────────────────────────────────────

export const listDashboards = () => invoke<Dashboard[]>("list_dashboards");

export const createDashboard = (name: string) =>
  invoke<number>("create_dashboard", { name });

export const renameDashboard = (id: number, name: string) =>
  invoke<void>("rename_dashboard", { id, name });

export const deleteDashboard = (id: number) =>
  invoke<void>("delete_dashboard", { id });

export const savePanels = (dashboardId: number, panels: PanelInput[]) =>
  invoke<void>("save_panels", { dashboardId, panels });

export const getTrackingConfig = () =>
  invoke<TrackingConfig>("get_tracking_config");

export const setTrackingConfig = (config: TrackingConfig) =>
  invoke<void>("set_tracking_config", { config });
