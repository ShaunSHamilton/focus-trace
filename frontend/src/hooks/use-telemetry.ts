import { listen } from "@tauri-apps/api/event";
import { useEffect, useState } from "react";
import { liveSnapshot } from "../lib/ipc";
import type { LiveSnapshot } from "../lib/types";

/** Subscribe to the backend's `telemetry-update` event for live metrics. */
export function useTelemetry(): LiveSnapshot | null {
  const [snap, setSnap] = useState<LiveSnapshot | null>(null);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let active = true;

    liveSnapshot()
      .then((s) => {
        if (active && s) setSnap(s);
      })
      .catch(() => {});

    listen<LiveSnapshot>("telemetry-update", (e) => setSnap(e.payload)).then((u) => {
      if (active) unlisten = u;
      else u();
    });

    return () => {
      active = false;
      unlisten?.();
    };
  }, []);

  return snap;
}
