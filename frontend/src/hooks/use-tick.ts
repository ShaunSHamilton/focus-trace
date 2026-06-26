import { listen } from "@tauri-apps/api/event";
import { useEffect, useState } from "react";

/**
 * Increments once per backend telemetry tick (the `telemetry-update` event).
 * Include the returned value in a `useCommand` dep array to re-fetch live.
 */
export function useTick(): number {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let active = true;

    listen("telemetry-update", () => setTick((t) => t + 1)).then((u) => {
      if (active) unlisten = u;
      else u();
    });

    return () => {
      active = false;
      unlisten?.();
    };
  }, []);

  return tick;
}
