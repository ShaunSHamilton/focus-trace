import { useState } from "react";
import { Card } from "../components/card";
import { Page } from "../components/page";
import { TimeRangeSelector } from "../components/time-range-selector";
import { useCommand } from "../hooks/use-command";
import { COLORS } from "../lib/colors";
import { formatDuration } from "../lib/format";
import { appWindowFocus, focusSummary, windowFocusSummary } from "../lib/ipc";
import { RANGES, rangeBounds, type RangeKey } from "../lib/range";
import type { FocusSummaryRow } from "../lib/types";

export function FocusView() {
  const [rangeKey, setRangeKey] = useState<RangeKey>("24h");
  const range = RANGES.find((r) => r.key === rangeKey)!;

  const { data: apps, loading } = useCommand(
    () => {
      const { from, to } = rangeBounds(range.secs);
      return focusSummary(from, to, 30);
    },
    [rangeKey],
    { live: true },
  );

  const { data: titles } = useCommand(
    () => {
      const { from, to } = rangeBounds(range.secs);
      return windowFocusSummary(from, to, 25);
    },
    [rangeKey],
    { live: true },
  );

  const appRows = apps ?? [];
  const appMax = Math.max(1, ...appRows.map((r) => r.focusSecs));
  const titleRows = titles ?? [];
  const titleMax = Math.max(1, ...titleRows.map((r) => r.focusSecs));

  return (
    <Page title="Focus time" action={<TimeRangeSelector value={rangeKey} onChange={setRangeKey} />}>
      <Card title="Time in foreground, by app">
        {loading && !apps && <p className="text-sm text-neutral-500">Loading…</p>}
        {!loading && appRows.length === 0 && (
          <p className="text-sm text-neutral-500">No focus activity in this range.</p>
        )}
        <ul className="flex flex-col gap-2">
          {appRows.map((r) => (
            <AppFocusRow key={r.appId} row={r} max={appMax} rangeSecs={range.secs} />
          ))}
        </ul>
        {appRows.length > 0 && (
          <p className="mt-3 text-[11px] text-neutral-600">Expand an app to see its window titles.</p>
        )}
      </Card>

      <Card title="Top window titles" className="mt-4">
        {titleRows.length === 0 && (
          <p className="text-sm text-neutral-500">No window titles recorded in this range.</p>
        )}
        <ul className="flex flex-col gap-2">
          {titleRows.map((t, i) => (
            <li key={i} className="flex items-center gap-3">
              <div className="w-56 shrink-0" title={`${t.name} — ${t.title}`}>
                <span className="block truncate text-sm text-neutral-200">{t.title}</span>
                <span className="block truncate text-[11px] text-neutral-500">{t.name}</span>
              </div>
              <Bar fraction={t.focusSecs / titleMax} color={COLORS.accent} />
              <span className="w-20 shrink-0 text-right text-sm tabular-nums text-neutral-300">
                {formatDuration(t.focusSecs)}
              </span>
            </li>
          ))}
        </ul>
      </Card>
    </Page>
  );
}

function AppFocusRow({
  row,
  max,
  rangeSecs,
}: {
  row: FocusSummaryRow;
  max: number;
  rangeSecs: number;
}) {
  const [open, setOpen] = useState(false);
  return (
    <li>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-3 text-left"
      >
        <span className="w-3 text-xs text-neutral-500">{open ? "▾" : "▸"}</span>
        <span className="w-40 shrink-0 truncate text-sm" title={row.name}>
          {row.name}
        </span>
        <Bar fraction={row.focusSecs / max} color={COLORS.accent} />
        <span className="w-20 shrink-0 text-right text-sm tabular-nums text-neutral-300">
          {formatDuration(row.focusSecs)}
        </span>
      </button>
      {open && <TitleBreakdown appId={row.appId} rangeSecs={rangeSecs} />}
    </li>
  );
}

function TitleBreakdown({ appId, rangeSecs }: { appId: number; rangeSecs: number }) {
  const { data, loading } = useCommand(
    () => {
      const { from, to } = rangeBounds(rangeSecs);
      return appWindowFocus(appId, from, to, 10);
    },
    [appId, rangeSecs],
    { live: true },
  );

  const rows = data ?? [];
  const max = Math.max(1, ...rows.map((r) => r.focusSecs));

  return (
    <ul className="mb-2 ml-6 mt-1 flex flex-col gap-1 border-l border-[#262626] pl-3">
      {loading && !data && <li className="text-xs text-neutral-500">Loading…</li>}
      {!loading && rows.length === 0 && (
        <li className="text-xs text-neutral-600">No window titles recorded.</li>
      )}
      {rows.map((t, i) => (
        <li key={i} className="flex items-center gap-2">
          <span className="w-48 shrink-0 truncate text-xs text-neutral-400" title={t.title}>
            {t.title}
          </span>
          <div className="relative h-3 flex-1 overflow-hidden rounded bg-[#1a1a1a]">
            <div
              className="h-full rounded"
              style={{ width: `${(t.focusSecs / max) * 100}%`, background: COLORS.mem, opacity: 0.7 }}
            />
          </div>
          <span className="w-16 shrink-0 text-right text-xs tabular-nums text-neutral-400">
            {formatDuration(t.focusSecs)}
          </span>
        </li>
      ))}
    </ul>
  );
}

function Bar({ fraction, color }: { fraction: number; color: string }) {
  return (
    <div className="relative h-6 flex-1 overflow-hidden rounded bg-[#1a1a1a]">
      <div
        className="h-full rounded"
        style={{ width: `${Math.min(100, fraction * 100)}%`, background: color, opacity: 0.85 }}
      />
    </div>
  );
}
