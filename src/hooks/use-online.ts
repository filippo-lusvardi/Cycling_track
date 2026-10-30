import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { useEffect, useState, useSyncExternalStore } from "react";

function subscribe(cb: () => void) {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
}

export function useOnline() {
  return useSyncExternalStore(subscribe, () => navigator.onLine, () => true);
}

/** When the newest cached intervals.icu data was fetched, as "d MMM HH:mm". */
export function useLastSynced() {
  const qc = useQueryClient();
  const [at, setAt] = useState(0);
  useEffect(() => {
    const cache = qc.getQueryCache();
    const read = () => setAt(Math.max(0, ...cache.getAll().map((q) => q.state.dataUpdatedAt)));
    read();
    return cache.subscribe(read);
  }, [qc]);
  return at ? format(at, "d MMM HH:mm") : null;
}
