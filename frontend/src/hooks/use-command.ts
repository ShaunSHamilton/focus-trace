import { listen } from "@tauri-apps/api/event";
import { useCallback, useEffect, useRef, useState } from "react";

interface CommandError {
  user?: string;
  debug?: string;
}

interface Options {
  /** Re-run on every `telemetry-update` tick (live views). */
  live?: boolean;
}

/**
 * Run an IPC command, exposing data/loading/error and a manual reload.
 *
 * Avoids per-tick UI flicker: `loading` is only set on the first fetch (not on
 * background refetches), and `data` keeps its previous reference when the new
 * result is deep-equal — so an unchanged tick causes no re-render.
 */
export function useCommand<T>(fn: () => Promise<T>, deps: unknown[], opts?: Options) {
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const loaded = useRef(false);

  const run = useCallback(() => {
    if (!loaded.current) setLoading(true);
    fn()
      .then((d) => {
        // Keep the old reference when nothing changed → no downstream re-render.
        setData((prev) =>
          prev !== undefined && JSON.stringify(prev) === JSON.stringify(d) ? prev : d,
        );
        loaded.current = true;
        setError(undefined);
      })
      .catch((e: CommandError | string) => {
        const msg = typeof e === "string" ? e : e.user ?? e.debug ?? "Unknown error";
        setError(msg);
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => run(), [run]);

  const live = opts?.live ?? false;
  useEffect(() => {
    if (!live) return;
    let unlisten: (() => void) | undefined;
    let active = true;
    listen("telemetry-update", () => run()).then((u) => {
      if (active) unlisten = u;
      else u();
    });
    return () => {
      active = false;
      unlisten?.();
    };
  }, [run, live]);

  return { data, error, loading, reload: run };
}
