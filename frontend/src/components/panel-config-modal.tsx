import { useMemo, useState, type ReactNode } from "react";
import { CHART_LABELS, PANEL_KINDS, PANEL_LIST, type ChartType } from "../lib/panels";
import { RANGES } from "../lib/range";
import type { AppAggregate } from "../lib/types";

export interface PanelDraft {
  title: string;
  kind: string;
  chartType: ChartType;
  rangeKey: string;
  argsJson: string;
}

export function defaultDraft(): PanelDraft {
  const k = PANEL_LIST[0];
  return {
    title: k.defaultTitle,
    kind: k.key,
    chartType: k.chartTypes[0],
    rangeKey: k.defaultRange,
    argsJson: "{}",
  };
}

export function PanelConfigModal({
  draft,
  apps,
  onSave,
  onClose,
}: {
  draft: PanelDraft;
  apps: AppAggregate[];
  onSave: (d: PanelDraft) => void;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(draft.title);
  const [kindKey, setKindKey] = useState(draft.kind);
  const [chartType, setChartType] = useState<ChartType>(draft.chartType);
  const [rangeKey, setRangeKey] = useState(draft.rangeKey);
  const initialArgs = useMemo<Record<string, unknown>>(() => {
    try {
      return JSON.parse(draft.argsJson || "{}");
    } catch {
      return {};
    }
  }, [draft.argsJson]);
  const [appId, setAppId] = useState<string>(
    initialArgs.appId != null ? String(initialArgs.appId) : "",
  );

  const kind = PANEL_KINDS[kindKey];

  const groups = useMemo(() => {
    const g: Record<string, typeof PANEL_LIST> = {};
    PANEL_LIST.forEach((k) => (g[k.group] ??= []).push(k));
    return g;
  }, []);

  const changeKind = (key: string) => {
    const k = PANEL_KINDS[key];
    setKindKey(key);
    setChartType(k.chartTypes[0]);
    setRangeKey(k.defaultRange);
    if (!title.trim() || title === kind.defaultTitle) setTitle(k.defaultTitle);
  };

  const needsApp = (kind.argFields ?? []).some((f) => f.type === "app");
  const canSave = title.trim() !== "" && (!needsApp || appId !== "");

  const save = () => {
    const args: Record<string, unknown> = {};
    if (needsApp && appId !== "") args.appId = Number(appId);
    onSave({
      title: title.trim(),
      kind: kindKey,
      chartType,
      rangeKey,
      argsJson: JSON.stringify(args),
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-xl border border-[#2a2a2a] bg-[#141414] p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-4 text-base font-semibold text-neutral-100">Configure panel</h2>

        <div className="flex flex-col gap-3 text-sm">
          <Field label="Data">
            <select value={kindKey} onChange={(e) => changeKind(e.target.value)} className={SELECT}>
              {Object.entries(groups).map(([group, kinds]) => (
                <optgroup key={group} label={group}>
                  {kinds.map((k) => (
                    <option key={k.key} value={k.key}>
                      {k.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </Field>

          {kind.chartTypes.length > 1 && (
            <Field label="Chart">
              <select
                value={chartType}
                onChange={(e) => setChartType(e.target.value as ChartType)}
                className={SELECT}
              >
                {kind.chartTypes.map((c) => (
                  <option key={c} value={c}>
                    {CHART_LABELS[c]}
                  </option>
                ))}
              </select>
            </Field>
          )}

          {needsApp && (
            <Field label="Application">
              <select value={appId} onChange={(e) => setAppId(e.target.value)} className={SELECT}>
                <option value="">Select an application…</option>
                {apps.map((a) => (
                  <option key={a.appId} value={a.appId}>
                    {a.name}
                  </option>
                ))}
              </select>
            </Field>
          )}

          {kind.usesRange !== false && (
            <Field label="Time range">
              <select value={rangeKey} onChange={(e) => setRangeKey(e.target.value)} className={SELECT}>
                {RANGES.map((r) => (
                  <option key={r.key} value={r.key}>
                    {r.label}
                  </option>
                ))}
              </select>
            </Field>
          )}

          <Field label="Title">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className={SELECT}
              placeholder="Panel title"
            />
          </Field>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg border border-[#2a2a2a] px-3 py-1.5 text-sm text-neutral-400 hover:text-neutral-200"
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={!canSave}
            className="rounded-lg bg-[#2563eb] px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

const SELECT =
  "w-full rounded-lg border border-[#2a2a2a] bg-[#0f0f0f] px-2.5 py-1.5 text-neutral-200 outline-none focus:border-[#3b82f6]";

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-neutral-500">{label}</span>
      {children}
    </label>
  );
}
