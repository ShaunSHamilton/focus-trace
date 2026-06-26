import { useMemo } from "react";
import { useCommand } from "../hooks/use-command";
import { argsReady, PANEL_KINDS, rangeFor, type ChartType } from "../lib/panels";
import type { Panel } from "../lib/types";
import { ChartEmpty, EChart } from "./charts/echart";

export function PanelView({
  panel,
  editing,
  onConfigure,
  onRemove,
}: {
  panel: Panel;
  editing: boolean;
  onConfigure: () => void;
  onRemove: () => void;
}) {
  const kind = PANEL_KINDS[panel.kind];
  const range = rangeFor(panel.rangeKey);
  const args = useMemo<Record<string, unknown>>(() => {
    try {
      return JSON.parse(panel.argsJson || "{}");
    } catch {
      return {};
    }
  }, [panel.argsJson]);
  const ready = kind ? argsReady(kind, args) : false;

  const { data, loading, error } = useCommand(
    () => (kind && ready ? kind.load(args, range) : Promise.resolve(null)),
    [panel.kind, panel.argsJson, panel.rangeKey, ready],
    { live: kind?.live },
  );

  const option = data != null && kind ? kind.toOption(data, panel.chartType as ChartType, range) : null;

  return (
    <section className="flex h-full flex-col overflow-hidden rounded-xl border border-[#262626] bg-[#161616]">
      <header
        className={`flex items-center justify-between gap-2 border-b border-[#1f1f1f] px-3 py-2 ${
          editing ? "panel-drag cursor-move" : ""
        }`}
      >
        <h3 className="truncate text-sm font-medium text-neutral-300" title={panel.title}>
          {panel.title}
        </h3>
        {editing && (
          <div className="flex shrink-0 items-center gap-1">
            <button
              onClick={onConfigure}
              onMouseDown={(e) => e.stopPropagation()}
              className="rounded px-1.5 py-0.5 text-xs text-neutral-400 hover:bg-[#222] hover:text-neutral-200"
              title="Configure"
            >
              ⚙
            </button>
            <button
              onClick={onRemove}
              onMouseDown={(e) => e.stopPropagation()}
              className="rounded px-1.5 py-0.5 text-xs text-neutral-400 hover:bg-[#3a1a1a] hover:text-red-300"
              title="Remove"
            >
              ✕
            </button>
          </div>
        )}
      </header>
      <div className="min-h-0 flex-1 p-2">
        {!kind ? (
          <ChartEmpty message={`Unknown panel "${panel.kind}"`} />
        ) : !ready ? (
          <ChartEmpty message="Configure this panel" />
        ) : error ? (
          <ChartEmpty message={error} />
        ) : loading && data == null ? (
          <ChartEmpty message="Loading…" />
        ) : option ? (
          <EChart option={option} height="100%" />
        ) : (
          <ChartEmpty message="No data in range" />
        )}
      </div>
    </section>
  );
}
