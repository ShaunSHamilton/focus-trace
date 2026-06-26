import { useEffect, useMemo, useRef, useState } from "react";
import GridLayout, {
  useContainerWidth,
  type Layout,
  type LayoutItem,
} from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";
import { Page } from "../components/page";
import { PanelView } from "../components/panel";
import { defaultDraft, PanelConfigModal, type PanelDraft } from "../components/panel-config-modal";
import { useCommand } from "../hooks/use-command";
import {
  createDashboard,
  deleteDashboard,
  listApps,
  listDashboards,
  renameDashboard,
  savePanels,
} from "../lib/ipc";
import type { Dashboard, Panel } from "../lib/types";

const COLS = 12;
const ROW_H = 38;

// Editor-side panel: a server Panel plus a stable RGL key (negative id = unsaved).
interface EditPanel {
  key: string;
  title: string;
  kind: string;
  chartType: string;
  rangeKey: string;
  argsJson: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

const toEdit = (p: Panel): EditPanel => ({
  key: String(p.id),
  title: p.title,
  kind: p.kind,
  chartType: p.chartType,
  rangeKey: p.rangeKey,
  argsJson: p.argsJson,
  x: p.x,
  y: p.y,
  w: p.w,
  h: p.h,
});

const asPanel = (e: EditPanel, dashboardId: number, sort: number): Panel => ({
  id: 0,
  dashboardId,
  title: e.title,
  kind: e.kind,
  chartType: e.chartType,
  argsJson: e.argsJson,
  rangeKey: e.rangeKey,
  x: e.x,
  y: e.y,
  w: e.w,
  h: e.h,
  sort,
});

export function DashboardsView() {
  const { data: dashboards, reload } = useCommand(() => listDashboards(), []);
  const { data: apps } = useCommand(() => listApps(), []);
  const { width, containerRef } = useContainerWidth();

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [editing, setEditing] = useState(false);
  const [working, setWorking] = useState<EditPanel[]>([]);
  const [name, setName] = useState("");
  const [modal, setModal] = useState<{ draft: PanelDraft; key: string | null } | null>(null);
  const tempCounter = useRef(-1);

  const list = useMemo(() => dashboards ?? [], [dashboards]);
  const current: Dashboard | undefined =
    list.find((d) => d.id === selectedId) ?? list[0];

  // Keep `name` in sync with the current dashboard when not actively editing.
  useEffect(() => {
    if (!editing) setName(current?.name ?? "");
  }, [current?.id, current?.name, editing]);

  const startEdit = () => {
    if (!current) return;
    setWorking(current.panels.map(toEdit));
    setName(current.name);
    setEditing(true);
  };

  const cancelEdit = () => {
    setEditing(false);
    setModal(null);
  };

  const save = async () => {
    if (!current) return;
    if (name.trim() && name.trim() !== current.name) {
      await renameDashboard(current.id, name.trim());
    }
    await savePanels(
      current.id,
      working.map((e, i) => ({
        title: e.title,
        kind: e.kind,
        chartType: e.chartType,
        argsJson: e.argsJson,
        rangeKey: e.rangeKey,
        x: e.x,
        y: e.y,
        w: e.w,
        h: e.h,
        sort: i,
      })),
    );
    setEditing(false);
    setModal(null);
    reload();
  };

  const addDashboard = async () => {
    const id = await createDashboard(`Dashboard ${list.length + 1}`);
    await reload();
    setSelectedId(id);
    setWorking([]);
    setName(`Dashboard ${list.length + 1}`);
    setEditing(true);
  };

  const removeDashboard = async () => {
    if (!current) return;
    if (!window.confirm(`Delete dashboard "${current.name}"?`)) return;
    await deleteDashboard(current.id);
    setEditing(false);
    setSelectedId(null);
    reload();
  };

  const onLayoutChange = (next: Layout) => {
    if (!editing) return;
    setWorking((ws) =>
      ws.map((p) => {
        const l = next.find((x) => x.i === p.key);
        return l ? { ...p, x: l.x, y: l.y, w: l.w, h: l.h } : p;
      }),
    );
  };

  const openAdd = () => setModal({ draft: defaultDraft(), key: null });

  const openConfigure = (p: EditPanel) =>
    setModal({
      draft: {
        title: p.title,
        kind: p.kind,
        chartType: p.chartType as PanelDraft["chartType"],
        rangeKey: p.rangeKey,
        argsJson: p.argsJson,
      },
      key: p.key,
    });

  const applyModal = (draft: PanelDraft) => {
    setWorking((ws) => {
      if (modal?.key) {
        return ws.map((p) => (p.key === modal.key ? { ...p, ...draft } : p));
      }
      // New panel: place at the bottom of the grid.
      const maxY = ws.reduce((m, p) => Math.max(m, p.y + p.h), 0);
      return [
        ...ws,
        { key: `new${tempCounter.current--}`, ...draft, x: 0, y: maxY, w: 6, h: 6 },
      ];
    });
    setModal(null);
  };

  const removePanel = (key: string) =>
    setWorking((ws) => ws.filter((p) => p.key !== key));

  const display: EditPanel[] = editing ? working : (current?.panels ?? []).map(toEdit);
  const layout: LayoutItem[] = display.map((p) => ({
    i: p.key,
    x: p.x,
    y: p.y,
    w: p.w,
    h: p.h,
    minW: 2,
    minH: 3,
  }));

  return (
    <Page
      title={
        editing ? (
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="rounded-lg border border-[#2a2a2a] bg-[#0f0f0f] px-2 py-1 text-lg font-semibold text-neutral-100 outline-none focus:border-[#3b82f6]"
          />
        ) : (
          "Dashboards"
        )
      }
      action={
        <div className="flex items-center gap-2">
          {!editing && list.length > 1 && (
            <select
              value={current?.id ?? ""}
              onChange={(e) => setSelectedId(Number(e.target.value))}
              className="rounded-lg border border-[#262626] bg-[#0f0f0f] px-2 py-1 text-sm text-neutral-200"
            >
              {list.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          )}
          {editing ? (
            <>
              <button onClick={openAdd} className={BTN}>
                + Panel
              </button>
              {list.length > 1 && (
                <button onClick={removeDashboard} className={`${BTN} text-red-300`}>
                  Delete
                </button>
              )}
              <button onClick={cancelEdit} className={BTN}>
                Cancel
              </button>
              <button onClick={save} className={BTN_PRIMARY}>
                Save
              </button>
            </>
          ) : (
            <>
              <button onClick={addDashboard} className={BTN}>
                + Dashboard
              </button>
              {current && (
                <button onClick={startEdit} className={BTN}>
                  Edit
                </button>
              )}
            </>
          )}
        </div>
      }
    >
      {!current ? (
        <p className="text-sm text-neutral-500">
          No dashboards yet. Create one to get started.
        </p>
      ) : display.length === 0 ? (
        <p className="text-sm text-neutral-500">
          {editing ? 'Empty dashboard — use "+ Panel" to add charts.' : "This dashboard has no panels."}
        </p>
      ) : (
        <div ref={containerRef}>
          <GridLayout
            className="layout"
            width={width}
            layout={layout}
            gridConfig={{
              cols: COLS,
              rowHeight: ROW_H,
              margin: [12, 12],
              containerPadding: [0, 0],
            }}
            dragConfig={{ enabled: editing, handle: ".panel-drag" }}
            resizeConfig={{ enabled: editing }}
            onLayoutChange={onLayoutChange}
          >
            {display.map((p) => (
              <div key={p.key}>
                <PanelView
                  panel={asPanel(p, current.id, 0)}
                  editing={editing}
                  onConfigure={() => openConfigure(p)}
                  onRemove={() => removePanel(p.key)}
                />
              </div>
            ))}
          </GridLayout>
        </div>
      )}

      {modal && (
        <PanelConfigModal
          draft={modal.draft}
          apps={apps ?? []}
          onSave={applyModal}
          onClose={() => setModal(null)}
        />
      )}
    </Page>
  );
}

const BTN =
  "rounded-lg border border-[#262626] bg-[#0f0f0f] px-2.5 py-1 text-sm text-neutral-300 hover:bg-[#1a1a1a]";
const BTN_PRIMARY =
  "rounded-lg bg-[#2563eb] px-3 py-1 text-sm font-medium text-white hover:bg-[#1d4ed8]";
