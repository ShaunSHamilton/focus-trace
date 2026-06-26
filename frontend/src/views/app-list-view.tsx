import { useState } from "react";
import { Page } from "../components/page";
import { useCommand } from "../hooks/use-command";
import { COLORS } from "../lib/colors";
import { formatBytes, formatDateTime, formatDuration, formatPercent } from "../lib/format";
import { listApps } from "../lib/ipc";
import type { AppAggregate } from "../lib/types";

type SortKey = "name" | "totalFocusSecs" | "totalRunSecs" | "avgCpuPct" | "avgMemBytes" | "lastSeen";

const COLUMNS: { key: SortKey; label: string; numeric: boolean }[] = [
  { key: "name", label: "Application", numeric: false },
  { key: "totalFocusSecs", label: "Focus", numeric: true },
  { key: "totalRunSecs", label: "Running", numeric: true },
  { key: "avgCpuPct", label: "Avg CPU", numeric: true },
  { key: "avgMemBytes", label: "Avg RAM", numeric: true },
  { key: "lastSeen", label: "Last seen", numeric: true },
];

export function AppListView({ onSelect }: { onSelect: (a: AppAggregate) => void }) {
  const { data, loading, error } = useCommand(() => listApps(), []);
  const [sort, setSort] = useState<SortKey>("totalFocusSecs");
  const [asc, setAsc] = useState(false);

  const rows = [...(data ?? [])].sort((a, b) => {
    let cmp: number;
    if (sort === "name") cmp = a.name.localeCompare(b.name);
    else cmp = (a[sort] as number) - (b[sort] as number);
    return asc ? cmp : -cmp;
  });

  const toggle = (k: SortKey) => {
    if (k === sort) setAsc((v) => !v);
    else {
      setSort(k);
      setAsc(k === "name");
    }
  };

  return (
    <Page
      title="Applications"
      action={<span className="text-xs text-neutral-500">{rows.length} tracked</span>}
    >
      {error && <p className="text-sm text-red-400">{error}</p>}
      {loading && !data && <p className="text-sm text-neutral-500">Loading…</p>}

      <div className="overflow-x-auto rounded-xl border border-[#262626]">
        <table className="w-full text-sm">
          <thead className="bg-[#141414]">
            <tr className="text-left text-xs uppercase tracking-wide text-neutral-500">
              {COLUMNS.map((c) => (
                <th
                  key={c.key}
                  onClick={() => toggle(c.key)}
                  className={`cursor-pointer select-none px-3 py-2 font-medium hover:text-neutral-300 ${
                    c.numeric ? "text-right" : ""
                  }`}
                >
                  {c.label}
                  {sort === c.key && <span className="ml-1">{asc ? "▲" : "▼"}</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((a) => (
              <tr
                key={a.appId}
                onClick={() => onSelect(a)}
                className="cursor-pointer border-t border-[#1f1f1f] hover:bg-[#161616]"
              >
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span>{a.name}</span>
                    {a.isSystem && (
                      <span className="rounded bg-[#2a2a2a] px-1.5 py-0.5 text-[10px] text-neutral-400">
                        system
                      </span>
                    )}
                  </div>
                  <div className="max-w-md truncate text-[11px] text-neutral-600">{a.exePath}</div>
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {formatDuration(a.totalFocusSecs)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {formatDuration(a.totalRunSecs)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums" style={{ color: COLORS.cpu }}>
                  {formatPercent(a.avgCpuPct)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-neutral-300">
                  {formatBytes(a.avgMemBytes)}
                </td>
                <td className="px-3 py-2 text-right text-[11px] text-neutral-500">
                  {formatDateTime(a.lastSeen)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Page>
  );
}
