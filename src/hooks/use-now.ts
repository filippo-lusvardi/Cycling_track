import { useEffect, useState } from "react";

/** The current time, refreshed every `every` ms (5 minutes by default) and when the page comes back into view. */
export function useNow(every = 5 * 60_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const tick = () => setNow(new Date());
    const id = setInterval(tick, every);
    const onShow = () => document.visibilityState === "visible" && tick();
    document.addEventListener("visibilitychange", onShow);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onShow);
    };
  }, [every]);
  return now;
}
