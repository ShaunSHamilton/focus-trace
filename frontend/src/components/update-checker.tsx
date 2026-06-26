import { getVersion } from "@tauri-apps/api/app";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { useEffect, useState } from "react";
import { restartApp } from "../lib/ipc";
import { Card } from "./card";

type State =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "uptodate" }
  | { kind: "available"; update: Update }
  | { kind: "downloading"; pct: number | null }
  | { kind: "error"; message: string };

export function UpdateChecker() {
  const [version, setVersion] = useState<string>("");
  const [state, setState] = useState<State>({ kind: "idle" });

  useEffect(() => {
    getVersion().then(setVersion).catch(() => {});
  }, []);

  // Only ever runs on explicit user action — there is no auto-update.
  const checkForUpdates = async () => {
    setState({ kind: "checking" });
    try {
      const update = await check();
      setState(update ? { kind: "available", update } : { kind: "uptodate" });
    } catch (e) {
      setState({ kind: "error", message: errorMessage(e) });
    }
  };

  const install = async (update: Update) => {
    setState({ kind: "downloading", pct: null });
    try {
      let total = 0;
      let received = 0;
      await update.downloadAndInstall((ev) => {
        if (ev.event === "Started") {
          total = ev.data.contentLength ?? 0;
        } else if (ev.event === "Progress") {
          received += ev.data.chunkLength;
          setState({
            kind: "downloading",
            pct: total > 0 ? Math.round((received / total) * 100) : null,
          });
        } else if (ev.event === "Finished") {
          setState({ kind: "downloading", pct: 100 });
        }
      });
      // Installed — restart into the new version.
      await restartApp();
    } catch (e) {
      setState({ kind: "error", message: errorMessage(e) });
    }
  };

  return (
    <Card title="Updates" className="mt-4">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm">
          <span className="text-neutral-300">Focus Trace</span>{" "}
          <span className="text-neutral-500">v{version || "…"}</span>
          <div className="text-xs text-neutral-500">{statusLine(state)}</div>
        </div>
        <button
          onClick={checkForUpdates}
          disabled={state.kind === "checking" || state.kind === "downloading"}
          className="shrink-0 rounded-lg border border-[#262626] px-3 py-1.5 text-sm text-neutral-200 hover:bg-[#1c1c1c] disabled:opacity-50"
        >
          {state.kind === "checking" ? "Checking…" : "Check for updates"}
        </button>
      </div>

      {state.kind === "available" && (
        <div className="mt-3 rounded-lg border border-[#262626] bg-[#0f0f0f] p-3">
          <div className="text-sm">
            Version <span className="font-medium text-neutral-100">{state.update.version}</span>{" "}
            is available.
          </div>
          {state.update.body && (
            <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap text-xs text-neutral-400">
              {state.update.body}
            </pre>
          )}
          <button
            onClick={() => install(state.update)}
            className="mt-3 rounded-lg bg-[#4f9dff] px-3 py-1.5 text-sm font-medium text-black"
          >
            Download &amp; install
          </button>
        </div>
      )}

      {state.kind === "downloading" && (
        <div className="mt-3">
          <div className="h-2 overflow-hidden rounded bg-[#1a1a1a]">
            <div
              className="h-full bg-[#4f9dff] transition-all"
              style={{ width: `${state.pct ?? 10}%` }}
            />
          </div>
          <div className="mt-1 text-xs text-neutral-500">
            {state.pct === 100 ? "Installing — restarting…" : "Downloading…"}
          </div>
        </div>
      )}
    </Card>
  );
}

function statusLine(state: State): string {
  switch (state.kind) {
    case "uptodate":
      return "You're on the latest version.";
    case "error":
      return `Error: ${state.message}`;
    default:
      return "Check GitHub for new releases.";
  }
}

function errorMessage(e: unknown): string {
  if (typeof e === "string") return e;
  if (e && typeof e === "object" && "message" in e) return String((e as { message: unknown }).message);
  return String(e);
}
