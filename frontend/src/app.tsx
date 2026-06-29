import { useState } from "react";
import { AppLayout, type ViewName } from "./components/app-layout";
import type { AppAggregate } from "./lib/types";
import { AppDetailView } from "./views/app-detail-view";
import { AppListView } from "./views/app-list-view";
import { DashboardView } from "./views/dashboard-view";
import { DashboardsView } from "./views/dashboards-view";
import { FocusView } from "./views/focus-view";
import { GroupsView } from "./views/groups-view";
import { NetworkView } from "./views/network-view";
import { SettingsView } from "./views/settings-view";

export function App() {
  const [view, setView] = useState<ViewName>("dashboard");
  const [selectedApp, setSelectedApp] = useState<AppAggregate | null>(null);

  const navigate = (v: ViewName) => {
    setSelectedApp(null);
    setView(v);
  };

  return (
    <AppLayout current={view} onNavigate={navigate}>
      {view === "dashboard" && <DashboardView />}
      {view === "dashboards" && <DashboardsView />}
      {view === "apps" &&
        (selectedApp ? (
          <AppDetailView app={selectedApp} onBack={() => setSelectedApp(null)} />
        ) : (
          <AppListView onSelect={setSelectedApp} />
        ))}
      {view === "network" && <NetworkView />}
      {view === "focus" && <FocusView />}
      {view === "groups" && <GroupsView />}
      {view === "settings" && <SettingsView />}
    </AppLayout>
  );
}
