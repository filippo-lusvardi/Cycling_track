import { useCallback, useEffect, useState } from "react";

/** JSON value persisted in this device's storage; read after hydration to avoid mismatches. */
export function useLocalStore<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(initial);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw) setValue(JSON.parse(raw) as T);
    } catch {
      /* ignore */
    }
    const onChange = (e: Event) => {
      if ((e as CustomEvent).detail === key) {
        const raw = localStorage.getItem(key);
        if (raw) setValue(JSON.parse(raw) as T);
      }
    };
    window.addEventListener("local-store", onChange);
    return () => window.removeEventListener("local-store", onChange);
  }, [key]);
  const update = useCallback(
    (fn: (prev: T) => T) => {
      setValue((prev) => {
        const next = fn(prev);
        localStorage.setItem(key, JSON.stringify(next));
        queueMicrotask(() => window.dispatchEvent(new CustomEvent("local-store", { detail: key })));
        return next;
      });
    },
    [key],
  );
  return [value, update] as const;
}
