import { Card } from "../components/card";
import { Page } from "../components/page";
import { StatTile } from "../components/stat-tile";
import { useTelemetry } from "../hooks/use-telemetry";
import { COLORS } from "../lib/colors";
import { formatBytes, formatPercent } from "../lib/format";

export function DashboardView() {
  const snap = useTelemetry();

  if (!snap) {
    return (
      <Page title="Dashboard">
        <p className="text-sm text-neutral-500">Waiting for the first telemetry tick…</p>
      </Page>
    );
  }

  const apps = [...snap.apps].sort((a, b) => b.cpuPct - a.cpuPct);
  const totalCpu = apps.reduce((s, a) => s + a.cpuPct, 0);
  const totalMem = apps.reduce((s, a) => s + a.memBytes, 0);
  const net = snap.net;
  const netIn = net.wifiInB + net.ethInB + net.otherInB;
  const netOut = net.wifiOutB + net.ethOutB + net.otherOutB;
  const focused = apps.find((a) => a.appId === snap.focusedAppId);

  return (
    <Page
      title="Dashboard"
      action={<span className="text-xs text-neutral-500">live · updates each tick</span>}
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Tracked apps" value={apps.length} />
        <StatTile label="Focused" value={focused?.name ?? "—"} accent={COLORS.accent} />
        <StatTile label="Total CPU" value={formatPercent(totalCpu)} accent={COLORS.cpu} />
        <StatTile label="Total RAM" value={formatBytes(totalMem)} accent={COLORS.mem} />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Net ↓ (last tick)" value={formatBytes(netIn)} accent={COLORS.netIn} />
        <StatTile label="Net ↑ (last tick)" value={formatBytes(netOut)} accent={COLORS.netOut} />
        <StatTile
          label="Wi-Fi ↓ / ↑"
          value={`${formatBytes(net.wifiInB)} / ${formatBytes(net.wifiOutB)}`}
          accent={COLORS.wifi}
        />
        <StatTile
          label="Ethernet ↓ / ↑"
          value={`${formatBytes(net.ethInB)} / ${formatBytes(net.ethOutB)}`}
          accent={COLORS.eth}
        />
      </div>

      <Card title="Top apps by CPU" className="mt-4">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-neutral-500">
              <th className="pb-2 font-medium">App</th>
              <th className="pb-2 text-right font-medium">CPU</th>
              <th className="pb-2 text-right font-medium">Memory</th>
            </tr>
          </thead>
          <tbody>
            {apps.slice(0, 12).map((a) => (
              <tr key={a.appId} className="border-t border-[#1f1f1f]">
                <td className="py-1.5">
                  <span className="inline-flex items-center gap-2">
                    {a.appId === snap.focusedAppId && (
                      <span
                        className="h-1.5 w-1.5 rounded-full"
                        style={{ background: COLORS.accent }}
                        title="Focused"
                      />
                    )}
                    {a.name}
                  </span>
                </td>
                <td className="py-1.5 text-right tabular-nums" style={{ color: COLORS.cpu }}>
                  {formatPercent(a.cpuPct)}
                </td>
                <td className="py-1.5 text-right tabular-nums text-neutral-300">
                  {formatBytes(a.memBytes)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </Page>
  );
}
