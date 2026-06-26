import { useCallback, useEffect, useState } from "react";

interface CommandError {
  user?: string;
  debug?: string;
}

/** Run an IPC command, exposing data/loading/error and a manual reload. */
export function useCommand<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(true);

  const run = useCallback(() => {
    setLoading(true);
    fn()
      .then((d) => {
        setData(d);
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

  return { data, error, loading, reload: run };
}
