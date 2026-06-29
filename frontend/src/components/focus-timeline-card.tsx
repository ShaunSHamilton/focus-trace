import { memo, useMemo, useState } from "react";
import { useCommand } from "../hooks/use-command";
import { seriesColor } from "../lib/colors";
import { formatClock, formatDuration } from "../lib/format";
import { focusGroupTimeline, focusTimeline } from "../lib/ipc";
import { FOCUS_RANGES, rangeBounds, type FocusRangeKey } from "../lib/range";
import type { FocusTimelineSeries } from "../lib/types";
import { Card } from "./card";
import { FocusTimelineChart } from "./charts/focus-timeline-chart";

type TimelineMode = "window" | "group";

export const FocusTimelineCard = memo(function FocusTimelineCard() {
  const [rangeKey, setRangeKey] = useState<FocusRangeKey>("1d");
  const [mode, setMode] = useState<TimelineMode>("window");
  const [hidden, setHidden] = useState<Set<number>>(new Set());
  const [open, setOpen] = useState<Set<string>>(new Set());
  const range = FOCUS_RANGES.find((r) => r.key === rangeKey)!;

  const { data, loading, error } = useCommand(
    () => {
      const { from, to } = rangeBounds(range.secs);
      return mode === "group"
        ? focusGroupTimeline(from, to, range.bucket)
        : focusTimeline(from, to, range.bucket, 30);
    },
    [rangeKey, mode],
    { live: true },
  );

  // Per-series color: explicit `color` when present (group mode), else a stable
  // palette hue by index ("Other" is neutral grey).
  const colorFor = useMemo(() => {
    const map = new Map<number, string>();
    (data?.series ?? []).forEach((s, i) =>
      map.set(s.id, s.color || (s.id === -1 ? "#737373" : seriesColor(i))),
    );
    return (id: number) => map.get(id) ?? "#737373";
  }, [data]);

  const xFormat = (ts: number) => {
    if (range.secs <= 86_400) return formatClock(ts);
    return new Date(ts * 1000).toLocaleString([], {
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
    });
  };

  const selectRange = (k: FocusRangeKey) => {
    setHidden(new Set());
    setOpen(new Set());
    setRangeKey(k);
  };

  const selectMode = (m: TimelineMode) => {
    setHidden(new Set());
    setOpen(new Set());
    setMode(m);
  };

  const toggle = (id: number) =>
    setHidden((h) => {
      const next = new Set(h);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // Toggle every title in an executable group together (partial → hide all).
  const toggleGroup = (items: FocusTimelineSeries[]) =>
    setHidden((h) => {
      const next = new Set(h);
      const allHidden = items.every((s) => next.has(s.id));
      for (const s of items) {
        if (allHidden) next.delete(s.id);
        else next.add(s.id);
      }
      return next;
    });

  const toggleOpen = (app: string) =>
    setOpen((o) => {
      const next = new Set(o);
      if (next.has(app)) next.delete(app);
      else next.add(app);
      return next;
    });

  const series = data?.series ?? [];

  // Group series by executable (appName); "Other" aggregate falls back to title.
  // Sorted by group total so the heaviest executables surface first.
  const groups = useMemo(() => {
    const m = new Map<string, FocusTimelineSeries[]>();
    for (const s of data?.series ?? []) {
      const key = s.appName || s.title;
      (m.get(key) ?? m.set(key, []).get(key)!).push(s);
    }
    return [...m.entries()]
      .map(([app, items]) => ({
        app,
        items,
        total: items.reduce((a, s) => a + s.totalSecs, 0),
      }))
      .sort((a, b) => b.total - a.total);
  }, [data]);

  return (
    <Card
      title="Focused windows over time"
      className="mt-4"
      action={
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg border border-[#262626] bg-[#0f0f0f] p-0.5 text-xs">
            {(["window", "group"] as const).map((m) => (
              <button
                key={m}
                onClick={() => selectMode(m)}
                className={`rounded-md px-2 py-1 transition ${
                  mode === m
                    ? "bg-[#262626] text-neutral-100"
                    : "text-neutral-500 hover:text-neutral-300"
                }`}
              >
                {m === "window" ? "Windows" : "Groups"}
              </button>
            ))}
          </div>
          <div className="inline-flex flex-wrap rounded-lg border border-[#262626] bg-[#0f0f0f] p-0.5 text-xs">
            {FOCUS_RANGES.map((r) => (
              <button
                key={r.key}
                onClick={() => selectRange(r.key)}
                className={`rounded-md px-2 py-1 transition ${
                  rangeKey === r.key
                    ? "bg-[#262626] text-neutral-100"
                    : "text-neutral-500 hover:text-neutral-300"
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
      }
    >
      {error && <p className="text-sm text-red-400">{error}</p>}
      {loading && !data && <p className="text-sm text-neutral-500">Loading…</p>}

      {data && (
        <>
          <FocusTimelineChart
            timeline={data}
            hidden={hidden}
            colorFor={colorFor}
            xFormat={xFormat}
          />

          {series.length > 0 && (
            <div className="mt-3">
              <div className="mb-1.5 flex items-center gap-3 text-xs text-neutral-500">
                <span>
                  {series.length - hidden.size} of {series.length} shown
                </span>
                <button onClick={() => setHidden(new Set())} className="hover:text-neutral-300">
                  All
                </button>
                <button
                  onClick={() => setHidden(new Set(series.map((s) => s.id)))}
                  className="hover:text-neutral-300"
                >
                  None
                </button>
              </div>
              {mode === "group" ? (
                <div className="flex max-h-32 flex-wrap gap-1.5 overflow-auto">
                  {series.map((s) => {
                    const off = hidden.has(s.id);
                    return (
                      <button
                        key={s.id}
                        onClick={() => toggle(s.id)}
                        className={`flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs transition ${
                          off
                            ? "border-[#222] text-neutral-600"
                            : "border-[#333] text-neutral-300 hover:bg-[#1c1c1c]"
                        }`}
                      >
                        <span
                          className="h-2 w-2 shrink-0 rounded-full"
                          style={{ background: colorFor(s.id), opacity: off ? 0.3 : 1 }}
                        />
                        <span className="max-w-[180px] truncate">{s.title}</span>
                        <span className="text-neutral-500">{formatDuration(s.totalSecs)}</span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="max-h-48 overflow-auto rounded-lg border border-[#1f1f1f]">
                {groups.map((g) => {
                  const allHidden = g.items.every((s) => hidden.has(s.id));
                  const someHidden = g.items.some((s) => hidden.has(s.id));
                  const isOpen = open.has(g.app);
                  return (
                    <div key={g.app} className="border-b border-[#1a1a1a] last:border-b-0">
                      <div className="flex items-center text-xs">
                        <button
                          onClick={() => toggleOpen(g.app)}
                          title={isOpen ? "Collapse" : "Expand"}
                          className="flex w-6 shrink-0 justify-center self-stretch py-1 text-neutral-600 hover:text-neutral-300"
                        >
                          <span className={`transition-transform ${isOpen ? "rotate-90" : ""}`}>
                            ▸
                          </span>
                        </button>
                        <button
                          onClick={() => toggleGroup(g.items)}
                          title={allHidden ? "Show all" : "Hide all"}
                          className="flex min-w-0 flex-1 items-center gap-1.5 py-1 pr-2 transition hover:bg-[#1c1c1c]"
                        >
                          <span
                            className="h-2.5 w-2.5 shrink-0 rounded-sm border border-[#444]"
                            style={{
                              background: allHidden
                                ? "transparent"
                                : someHidden
                                  ? "#444"
                                  : "#4f9dff",
                            }}
                          />
                          <span
                            className={`truncate ${allHidden ? "text-neutral-600" : "text-neutral-200"}`}
                          >
                            {g.app}
                          </span>
                          <span className="shrink-0 text-neutral-600">{g.items.length}</span>
                          <span className="ml-auto shrink-0 text-neutral-500">
                            {formatDuration(g.total)}
                          </span>
                        </button>
                      </div>
                      {isOpen && (
                        <div className="pb-1">
                          {g.items.map((s) => {
                            const off = hidden.has(s.id);
                            return (
                              <button
                                key={s.id}
                                onClick={() => toggle(s.id)}
                                title={s.title}
                                className={`flex w-full items-center gap-1.5 py-0.5 pl-8 pr-2 text-xs transition hover:bg-[#1c1c1c] ${
                                  off ? "text-neutral-600" : "text-neutral-300"
                                }`}
                              >
                                <span
                                  className="h-2 w-2 shrink-0 rounded-full"
                                  style={{ background: colorFor(s.id), opacity: off ? 0.3 : 1 }}
                                />
                                <span className="truncate text-left">{s.title}</span>
                                <span className="ml-auto shrink-0 text-neutral-500">
                                  {formatDuration(s.totalSecs)}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </Card>
  );
});
