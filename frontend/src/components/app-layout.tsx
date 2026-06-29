import type { ReactNode } from "react";

export type ViewName =
  | "dashboard"
  | "dashboards"
  | "apps"
  | "network"
  | "focus"
  | "groups"
  | "settings";

const NAV: { name: ViewName; label: string; icon: string }[] = [
  { name: "dashboard", label: "Dashboard", icon: "▦" },
  { name: "dashboards", label: "Dashboards", icon: "▥" },
  { name: "apps", label: "Applications", icon: "▤" },
  { name: "network", label: "Network", icon: "↯" },
  { name: "focus", label: "Focus", icon: "◎" },
  { name: "groups", label: "Groups", icon: "◫" },
  { name: "settings", label: "Settings", icon: "⚙" },
];

export function AppLayout({
  current,
  onNavigate,
  children,
}: {
  current: ViewName;
  onNavigate: (v: ViewName) => void;
  children: ReactNode;
}) {
  return (
    <div className="flex h-screen overflow-hidden">
      <aside className="flex w-52 shrink-0 flex-col border-r border-[#262626] bg-[#0c0c0c]">
        <div className="flex items-center gap-2 px-4 py-4">
          <img src="/icon.png" alt="" className="h-6 w-6 rounded" />
          <span className="text-sm font-semibold">Focus Trace</span>
        </div>
        <nav className="flex flex-1 flex-col gap-0.5 px-2">
          {NAV.map((n) => (
            <button
              key={n.name}
              onClick={() => onNavigate(n.name)}
              className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition ${
                current === n.name
                  ? "bg-[#1c1c1c] text-neutral-100"
                  : "text-neutral-400 hover:bg-[#161616] hover:text-neutral-200"
              }`}
            >
              <span className="w-4 text-center text-neutral-500">{n.icon}</span>
              {n.label}
            </button>
          ))}
        </nav>
        <div className="px-4 py-3 text-[10px] text-neutral-600">
          Windows telemetry
        </div>
      </aside>
      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}
