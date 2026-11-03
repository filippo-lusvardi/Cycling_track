// Speed measurements from real devices, sent to Firebase Performance Monitoring as custom traces only: how long
// screens take to show. Automatic instrumentation stays off, so no request URLs (intervals.icu paths name the
// athlete) are collected. The SDK loads when the browser is idle, never before the first screen, and nothing is
// sent when the user turns it off in Settings (or in development).
import { useEffect, useRef } from "react";
import { app } from "./firebase";
import { NO_PERF, readSetting } from "./settings";

type Attrs = Record<string, string>;
type Rec = { name: string; start: number; dur: number; attrs: Attrs };

const queue: Rec[] = [];
let sdk: Promise<((r: Rec) => void) | null> | null = null;

const off = () =>
  import.meta.env.DEV ||
  !!import.meta.env.VITE_USE_EMULATORS ||
  readSetting<boolean>(NO_PERF) === true;

function load() {
  sdk ??= import("firebase/performance")
    .then(({ initializePerformance, trace }) => {
      const perf = initializePerformance(app, { instrumentationEnabled: false });
      return (r: Rec) => trace(perf, r.name).record(r.start, r.dur, { attributes: r.attrs });
    })
    .catch((e) => {
      console.warn("Performance monitoring unavailable", e);
      return null;
    });
  return sdk;
}

const idle = (fn: () => void) =>
  "requestIdleCallback" in window
    ? requestIdleCallback(fn, { timeout: 10_000 })
    : setTimeout(fn, 3000);

let flushing = false;
function flush() {
  if (flushing) return;
  flushing = true;
  idle(() => {
    void load().then((send) => {
      flushing = false;
      for (const r of queue.splice(0)) if (send && !off()) send(r);
    });
  });
}

/** Record one measurement: `start` in epoch ms, `dur` in ms. */
export function record(name: string, start: number, dur: number, attrs: Attrs = {}) {
  if (off() || !(dur >= 0)) return;
  queue.push({
    name,
    start: Math.round(start),
    dur: Math.round(dur),
    attrs: {
      ...attrs,
      // Installed app or a browser tab; app files from the service worker's cache or the network.
      installed: matchMedia("(display-mode: standalone)").matches ? "yes" : "no",
      warm: navigator.serviceWorker?.controller ? "yes" : "no",
    },
  });
  flush();
}

/** The page the app was opened on (a screen reached later says nothing about startup). */
const landing = location.pathname;

/**
 * Time since the page started loading, as `name`: once per page load, and with `on` only when the app was opened on
 * one of those paths.
 */
const sinceLoad = new Set<string>();
export function recordSinceLoad(name: string, on?: string[]) {
  if (sinceLoad.has(name) || (on && !on.includes(landing))) return;
  sinceLoad.add(name);
  record(name, performance.timeOrigin, performance.now());
}

/**
 * Time from this screen opening until `ready` first turns true, as `name`, once per visit.
 * `cached`: whether what was drawn came from this device's copy.
 */
export function useScreenTrace(name: string, ready: boolean, cached?: boolean) {
  const start = useRef(Date.now());
  const done = useRef(false);
  useEffect(() => {
    if (!ready || done.current) return;
    done.current = true;
    record(name, start.current, Date.now() - start.current, {
      ...(cached != null ? { cached: cached ? "yes" : "no" } : {}),
    });
  }, [name, ready, cached]);
}
