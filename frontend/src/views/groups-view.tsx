import { useEffect, useState } from "react";
import { Card } from "../components/card";
import { Page } from "../components/page";
import { useCommand } from "../hooks/use-command";
import { GROUP_PALETTE } from "../lib/colors";
import { focusFilterOptions, listFocusGroups, saveFocusGroups } from "../lib/ipc";
import type { FocusGroup, FocusGroupRule, GroupField, GroupOp } from "../lib/types";

const EXE_LIST_ID = "group-opts-exes";
const TITLE_LIST_ID = "group-opts-titles";

const FIELDS: { value: GroupField; label: string }[] = [
  { value: "exe", label: "Executable" },
  { value: "title", label: "Window title" },
];
const OPS: { value: GroupOp; label: string }[] = [
  { value: "contains", label: "contains" },
  { value: "equals", label: "equals" },
  { value: "regex", label: "matches regex" },
];

/** Editor state: a group with a stable local key (groups have no id until saved). */
interface DraftGroup {
  key: string;
  name: string;
  color: string;
  rules: FocusGroupRule[];
}

let keySeq = 0;
const nextKey = () => `g${keySeq++}`;

const toDraft = (g: FocusGroup): DraftGroup => ({
  key: nextKey(),
  name: g.name,
  color: g.color || GROUP_PALETTE[0],
  rules: g.rules.map((r) => ({ ...r })),
});

export function GroupsView() {
  const { data, reload } = useCommand(listFocusGroups, []);
  const { data: options } = useCommand(focusFilterOptions, [], { live: true });
  const [groups, setGroups] = useState<DraftGroup[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | undefined>();

  useEffect(() => {
    if (data) setGroups(data.map(toDraft));
  }, [data]);

  const patch = (key: string, p: Partial<DraftGroup>) =>
    setGroups((gs) => gs!.map((g) => (g.key === key ? { ...g, ...p } : g)));

  const addGroup = () =>
    setGroups((gs) => [
      ...(gs ?? []),
      {
        key: nextKey(),
        name: "",
        color: GROUP_PALETTE[(gs?.length ?? 0) % GROUP_PALETTE.length],
        rules: [{ field: "exe", op: "contains", value: "" }],
      },
    ]);

  const removeGroup = (key: string) =>
    setGroups((gs) => gs!.filter((g) => g.key !== key));

  const setRules = (key: string, rules: FocusGroupRule[]) => patch(key, { rules });

  const save = async () => {
    if (!groups) return;
    setSaving(true);
    setStatus(undefined);
    try {
      // Drop empty groups and rules with no value before persisting.
      const clean = groups
        .map((g) => ({
          name: g.name.trim(),
          color: g.color,
          rules: g.rules.filter((r) => r.value.trim() !== ""),
        }))
        .filter((g) => g.name !== "" && g.rules.length > 0);
      await saveFocusGroups(clean);
      await reload();
      setStatus(`Saved ${clean.length} group${clean.length === 1 ? "" : "s"}.`);
    } catch (e) {
      setStatus(`Error: ${String(e)}`);
    } finally {
      setSaving(false);
    }
  };

  if (!groups) {
    return (
      <Page title="Groups">
        <p className="text-sm text-neutral-500">Loading…</p>
      </Page>
    );
  }

  return (
    <Page
      title="Groups"
      action={
        <div className="flex items-center gap-3">
          {status && <span className="text-xs text-neutral-400">{status}</span>}
          <button
            onClick={addGroup}
            className="rounded-lg border border-[#262626] px-3 py-1.5 text-sm text-neutral-300 hover:bg-[#1c1c1c]"
          >
            + Group
          </button>
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
      <p className="mb-4 max-w-2xl text-sm text-neutral-500">
        Roll focus time into custom buckets. A session joins the first group with a matching
        rule (top to bottom); anything unmatched stays under <em>Ungrouped</em>. Use these in
        the Focus view and timeline via the “Groups” toggle.
      </p>

      {/* Shared autocomplete sources for rule values (by field). */}
      <datalist id={EXE_LIST_ID}>
        {(options?.exes ?? []).map((v) => (
          <option key={v} value={v} />
        ))}
      </datalist>
      <datalist id={TITLE_LIST_ID}>
        {(options?.titles ?? []).map((v) => (
          <option key={v} value={v} />
        ))}
      </datalist>

      {groups.length === 0 && (
        <Card title="No groups yet">
          <p className="text-sm text-neutral-500">
            Create a group (e.g. “Work”) and add rules like{" "}
            <code className="text-neutral-300">title contains figma</code> or{" "}
            <code className="text-neutral-300">executable equals code.exe</code>.
          </p>
        </Card>
      )}

      <div className="flex flex-col gap-4">
        {groups.map((g) => (
          <GroupEditor
            key={g.key}
            group={g}
            onName={(name) => patch(g.key, { name })}
            onColor={(color) => patch(g.key, { color })}
            onRules={(rules) => setRules(g.key, rules)}
            onRemove={() => removeGroup(g.key)}
          />
        ))}
      </div>
    </Page>
  );
}

function GroupEditor({
  group,
  onName,
  onColor,
  onRules,
  onRemove,
}: {
  group: DraftGroup;
  onName: (v: string) => void;
  onColor: (v: string) => void;
  onRules: (r: FocusGroupRule[]) => void;
  onRemove: () => void;
}) {
  const setRule = (i: number, p: Partial<FocusGroupRule>) =>
    onRules(group.rules.map((r, j) => (j === i ? { ...r, ...p } : r)));
  const addRule = () => onRules([...group.rules, { field: "exe", op: "contains", value: "" }]);
  const removeRule = (i: number) => onRules(group.rules.filter((_, j) => j !== i));

  return (
    <Card>
      <div className="mb-3 flex items-center gap-3">
        <ColorPicker value={group.color} onChange={onColor} />
        <input
          value={group.name}
          placeholder="Group name (e.g. Work)"
          onChange={(e) => onName(e.target.value)}
          className="flex-1 rounded-lg border border-[#262626] bg-[#0f0f0f] px-2 py-1.5 text-sm font-medium"
        />
        <button
          onClick={onRemove}
          className="shrink-0 rounded-lg border border-[#262626] px-2 py-1.5 text-sm text-neutral-500 hover:border-red-900 hover:text-red-400"
          title="Delete group"
        >
          ✕
        </button>
      </div>

      <div className="flex flex-col gap-2 border-l border-[#262626] pl-3">
        {group.rules.map((r, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="w-6 shrink-0 text-xs text-neutral-600">{i === 0 ? "if" : "or"}</span>
            <Select
              value={r.field}
              onChange={(v) => setRule(i, { field: v as GroupField })}
              options={FIELDS}
            />
            <Select
              value={r.op}
              onChange={(v) => setRule(i, { op: v as GroupOp })}
              options={OPS}
            />
            <input
              value={r.value}
              list={r.field === "title" ? TITLE_LIST_ID : EXE_LIST_ID}
              placeholder={r.field === "title" ? "e.g. — Figma" : "e.g. chrome.exe"}
              onChange={(e) => setRule(i, { value: e.target.value })}
              className="flex-1 rounded-lg border border-[#262626] bg-[#0f0f0f] px-2 py-1 text-sm"
            />
            <button
              onClick={() => removeRule(i)}
              className="shrink-0 px-1 text-neutral-600 hover:text-red-400"
              title="Remove rule"
            >
              ✕
            </button>
          </div>
        ))}
        <button
          onClick={addRule}
          className="self-start text-xs text-[#4f9dff] hover:underline"
        >
          + rule
        </button>
      </div>
    </Card>
  );
}

function ColorPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative shrink-0">
      <button
        onClick={() => setOpen((o) => !o)}
        className="h-6 w-6 rounded-full border border-[#333]"
        style={{ background: value }}
        title="Pick color"
      />
      {open && (
        <div className="absolute z-10 mt-1 flex w-40 flex-wrap gap-1.5 rounded-lg border border-[#262626] bg-[#161616] p-2 shadow-lg">
          {GROUP_PALETTE.map((c) => (
            <button
              key={c}
              onClick={() => {
                onChange(c);
                setOpen(false);
              }}
              className="h-5 w-5 rounded-full border border-[#333]"
              style={{ background: c }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function Select({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="shrink-0 rounded-lg border border-[#262626] bg-[#0f0f0f] px-2 py-1 text-sm text-neutral-300"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
