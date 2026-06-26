import { useEffect, useState } from "react";
import { Card } from "../components/card";
import { Page } from "../components/page";
import { UpdateChecker } from "../components/update-checker";
import { useCommand } from "../hooks/use-command";
import { getTrackingConfig, restartApp, setTrackingConfig } from "../lib/ipc";
import type { TrackingConfig } from "../lib/types";

export function SettingsView() {
  const { data, reload } = useCommand(getTrackingConfig, []);
  const [cfg, setCfg] = useState<TrackingConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | undefined>();

  useEffect(() => {
    if (data) setCfg(data);
  }, [data]);

  if (!cfg) {
    return (
      <Page title="Settings">
        <p className="text-sm text-neutral-500">Loading…</p>
      </Page>
    );
  }

  const patch = (p: Partial<TrackingConfig>) => setCfg({ ...cfg, ...p });

  const save = async () => {
    setSaving(true);
    setStatus(undefined);
    try {
      await setTrackingConfig(cfg);
      await reload();
      setStatus("Saved.");
    } catch (e) {
      setStatus(`Error: ${String(e)}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Page
      title="Settings"
      action={
        <div className="flex items-center gap-3">
          {status && <span className="text-xs text-neutral-400">{status}</span>}
          <button
            onClick={save}
            disabled={saving}
            className="rounded-lg bg-[#4f9dff] px-3 py-1.5 text-sm font-medium text-black disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      }
    >
      <Card title="Tracking">
        <label className="flex items-center justify-between py-2">
          <span className="text-sm">
            Ignore Windows system processes
            <span className="block text-xs text-neutral-500">
              Skip executables under %SystemRoot%. Force-track specific ones below to watch
              suspicious processes.
            </span>
          </span>
          <input
            type="checkbox"
            checked={cfg.ignoreSystemProcesses}
            onChange={(e) => patch({ ignoreSystemProcesses: e.target.checked })}
            className="h-4 w-4 accent-[#4f9dff]"
          />
        </label>

        <div className="grid grid-cols-2 gap-4 pt-2">
          <NumberField
            label="Poll interval (seconds)"
            hint="Applies after restart"
            min={1}
            value={cfg.pollSecs}
            onChange={(v) => patch({ pollSecs: v })}
          />
          <NumberField
            label="Raw retention (days)"
            hint="Older samples roll up to daily totals"
            min={1}
            value={cfg.rawRetentionDays}
            onChange={(v) => patch({ rawRetentionDays: v })}
          />
        </div>
      </Card>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card title="Force-track (always include)">
          <p className="mb-2 text-xs text-neutral-500">
            Full exe paths to track even if they are system processes.
          </p>
          <ListEditor
            items={cfg.forceTrackExes}
            placeholder="C:\Windows\System32\suspicious.exe"
            onChange={(items) => patch({ forceTrackExes: items })}
          />
        </Card>

        <Card title="Ignore (always exclude)">
          <p className="mb-2 text-xs text-neutral-500">Full exe paths to never track.</p>
          <ListEditor
            items={cfg.ignoreExes}
            placeholder="C:\Path\to\app.exe"
            onChange={(items) => patch({ ignoreExes: items })}
          />
        </Card>
      </div>

      <div className="mt-4 text-xs text-neutral-500">
        Changing the poll interval requires a restart.{" "}
        <button onClick={() => restartApp()} className="text-[#4f9dff] hover:underline">
          Restart now
        </button>
      </div>

      <UpdateChecker />
    </Page>
  );
}

function NumberField({
  label,
  hint,
  value,
  min,
  onChange,
}: {
  label: string;
  hint?: string;
  value: number;
  min?: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="block">
      <span className="text-sm">{label}</span>
      {hint && <span className="block text-xs text-neutral-500">{hint}</span>}
      <input
        type="number"
        min={min}
        value={value}
        onChange={(e) => onChange(Math.max(min ?? 0, Number(e.target.value) || 0))}
        className="mt-1 w-32 rounded-lg border border-[#262626] bg-[#0f0f0f] px-2 py-1 text-sm tabular-nums"
      />
    </label>
  );
}

function ListEditor({
  items,
  placeholder,
  onChange,
}: {
  items: string[];
  placeholder?: string;
  onChange: (items: string[]) => void;
}) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const v = draft.trim();
    if (v && !items.includes(v)) onChange([...items, v]);
    setDraft("");
  };
  return (
    <div>
      <div className="flex gap-2">
        <input
          value={draft}
          placeholder={placeholder}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          className="flex-1 rounded-lg border border-[#262626] bg-[#0f0f0f] px-2 py-1 text-sm"
        />
        <button
          onClick={add}
          className="rounded-lg border border-[#262626] px-3 py-1 text-sm text-neutral-300 hover:bg-[#1c1c1c]"
        >
          Add
        </button>
      </div>
      <ul className="mt-2 flex flex-col gap-1">
        {items.length === 0 && <li className="text-xs text-neutral-600">None.</li>}
        {items.map((it) => (
          <li
            key={it}
            className="flex items-center justify-between gap-2 rounded bg-[#141414] px-2 py-1 text-xs"
          >
            <span className="truncate" title={it}>
              {it}
            </span>
            <button
              onClick={() => onChange(items.filter((x) => x !== it))}
              className="shrink-0 text-neutral-500 hover:text-red-400"
            >
              ✕
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
