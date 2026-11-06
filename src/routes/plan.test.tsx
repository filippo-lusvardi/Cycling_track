// @vitest-environment jsdom
// The plan page against a fake intervals.icu: everything the page needs goes through fetch, so what's kept is what's real.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { API_KEY, writeSetting } from "@/lib/settings";
import { Route } from "./plan.index";
import { Route as SettingsRoute } from "./plan.settings";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Row = Record<string, unknown> & { id: number };
let events: Row[];
let nextId: number;
let writes: { method: string; url: string; body: Record<string, unknown> }[];

function fakeIntervals(url: string, init?: RequestInit) {
  const method = init?.method ?? "GET";
  const body = init?.body ? (JSON.parse(init.body as string) as Record<string, unknown>) : {};
  if (method !== "GET") writes.push({ method, url, body });
  let answer: unknown = [];
  const one = /\/events\/(\d+)/.exec(url);
  if (/\/athlete\/0$/.test(url)) answer = { sportSettings: [{ types: ["Ride"], ftp: 250 }] };
  if (/\/events/.test(url)) {
    if (method === "POST") {
      const made = { id: nextId++, ...body };
      events.push(made);
      answer = made;
    } else if (method === "DELETE" && one) {
      events = events.filter((x) => x.id !== Number(one[1]));
    } else if (method === "PUT" && one) {
      const e = events.find((x) => x.id === Number(one[1]))!;
      Object.assign(e, body);
      answer = e;
    } else answer = events;
  }
  return Promise.resolve(new Response(JSON.stringify(answer), { status: 200 }));
}

let root: Root;
let host: HTMLDivElement;
const settle = () =>
  act(async () => {
    for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 15));
  });
const button = (name: string) =>
  [...host.querySelectorAll("button")].find((b) => b.textContent?.includes(name));

const link = (name: string) =>
  [...host.querySelectorAll("a")].find((b) => b.textContent?.includes(name));

function show(at = "/plan") {
  const top = createRootRoute();
  const router = createRouter({
    history: createMemoryHistory({ initialEntries: [at] }),
    routeTree: top.addChildren([
      createRoute({
        getParentRoute: () => top,
        path: "/plan",
        component: Route.options.component!,
      }),
      createRoute({
        getParentRoute: () => top,
        path: "/plan/settings",
        component: SettingsRoute.options.component!,
      }),
    ]),
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  act(() =>
    root.render(
      <QueryClientProvider client={client}>
        <RouterProvider router={router as never} />
      </QueryClientProvider>,
    ),
  );
}

describe("the plan page", () => {
  beforeEach(() => {
    localStorage.clear();
    writeSetting(API_KEY, "secret");
    events = [];
    writes = [];
    nextId = 100;
    vi.stubGlobal("fetch", vi.fn(fakeIntervals));
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  });
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("starts a plan as one note, with nothing in Firestore, then puts the week on the calendar", async () => {
    show();
    await settle();
    expect(host.textContent).toContain("Your plan");
    expect(host.textContent).toContain("I'm starting out");
    await act(async () => button("Start the plan")!.click());
    await settle();

    const note = writes.find((w) => w.body["category"] === "NOTE")!;
    expect(note.method).toBe("POST");
    expect(note.body["name"]).toBe("Cirmolo plan");
    expect(note.body).not.toHaveProperty("type");
    expect(host.textContent).toContain("The road from here");

    const workouts = events.filter((e) => e["category"] === "WORKOUT");
    expect(workouts.length).toBeGreaterThan(0);
    for (const w of workouts) expect(["Ride", "VirtualRide"]).toContain(w["type"]);
    // The note now knows them, so a reload shows the calendar's sessions rather than a new layout.
    const saved = String(events.find((e) => e["category"] === "NOTE")!["description"]);
    for (const w of workouts) expect(saved).toContain(`"eventId":"${w.id}"`);
    expect(button("Put on the calendar")).toBeUndefined();
  });

  it("changes the goal, and deletes the plan with what's still to come", async () => {
    show();
    await settle();
    await act(async () => button("Start the plan")!.click());
    await settle();
    expect(button("Stay well")).toBeUndefined();
    await act(async () => link("Settings")!.click());
    await settle();
    await act(async () => button("Stay well")!.click());
    await settle();
    const after = String(events.find((e) => e["category"] === "NOTE")!["description"]);
    expect(after).toContain('"goal":"healthy"');

    await act(async () => button("Delete the plan")!.click());
    await settle();
    await act(async () =>
      [...host.querySelectorAll("button")].find((b) => b.textContent === "Delete")!.click(),
    );
    await settle();
    expect(events.filter((e) => e["category"] === "NOTE")).toHaveLength(0);
    expect(events.filter((e) => e["category"] === "WORKOUT")).toHaveLength(0);
    expect(host.textContent).toContain("Start the plan");
  });

  it("shows an existing plan after a reload, without starting another", async () => {
    show();
    await settle();
    await act(async () => button("Start the plan")!.click());
    await settle();
    const notes = () => events.filter((e) => e["category"] === "NOTE").length;
    expect(notes()).toBe(1);
    act(() => root.unmount());
    root = createRoot(host);
    show();
    await settle();
    expect(host.textContent).toContain("The road from here");
    expect(notes()).toBe(1);
  });

  it("sets a day's time by tapping, and saves it from now on", async () => {
    show();
    await settle();
    await act(async () => button("Start the plan")!.click());
    await settle();
    await act(async () => link("Settings")!.click());
    await settle();
    expect(button("From now on")!.disabled).toBe(true);
    const more = host.querySelector<HTMLButtonElement>('[aria-label="Mon: more time"]')!;
    await act(async () => more.click());
    expect(host.textContent).toContain("30m");
    await act(async () => more.click());
    await act(async () => button("From now on")!.click());
    await settle();
    const saved = String(events.find((e) => e["category"] === "NOTE")!["description"]);
    expect(saved).toContain('"week":[{"minutes":45');
  });

  it("opens a planned workout's blocks when its line is tapped", async () => {
    show();
    await settle();
    await act(async () => button("Start the plan")!.click());
    await settle();
    expect(document.body.textContent).not.toContain("line: FTP");
    const line = [...host.querySelectorAll("button")].find((b) =>
      /\d+h|Endurance|Long/.test(b.textContent ?? ""),
    );
    await act(async () => line!.click());
    await settle();
    expect(document.body.textContent).toContain("line: FTP 250W");
    // Each step's power is already showing: one that isn't the FTP line's.
    expect(document.body.textContent).toMatch(/\b(?!250)\d{2,3}W/);
  });

  it("opens the workout a proposal would put in place", async () => {
    // A Friday: the Saturday changed below is still to come, and a proposal only touches what is.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime("2026-11-06T09:00:00");
    show();
    await settle();
    await act(async () => button("Start the plan")!.click());
    await settle();
    await act(async () => link("Settings")!.click());
    await settle();
    // The long day gone, so another has to take its place.
    const less = host.querySelector<HTMLButtonElement>('[aria-label="Sat: less time"]')!;
    while (!less.disabled) await act(async () => less.click());
    await act(async () => button("From now on")!.click());
    await settle();
    await act(async () => link("Plan")!.click());
    await settle();
    expect(host.textContent).toContain("A proposal for the next days");
    const card = [...host.querySelectorAll("div")].find(
      (d) => d.className.includes("p-4") && d.textContent?.startsWith("A proposal"),
    )!;
    const change = [...card.querySelectorAll("button")].find(
      (b) => !["Accept", "Leave it"].includes(b.textContent ?? ""),
    );
    await act(async () => change!.click());
    await settle();
    expect(document.body.textContent).toContain("line: FTP");
  });

  describe("on a phone", () => {
    const wide = window.innerWidth;
    beforeEach(() => {
      window.innerWidth = 360;
    });
    afterEach(() => {
      window.innerWidth = wide;
    });

    it("lists the days in a line each and opens one to change it", async () => {
      show();
      await settle();
      expect(host.querySelector('[aria-label="Tue: more time"]')).toBeNull();
      const tue = button("Tue")!;
      await act(async () => tue.click());
      expect(tue.getAttribute("aria-expanded")).toBe("true");
      await act(async () =>
        host.querySelector<HTMLButtonElement>('[aria-label="Tue: more time"]')!.click(),
      );
      expect(tue.textContent).toContain("1h 15m");
      // Another day closes this one.
      await act(async () => button("Wed")!.click());
      expect(host.querySelector('[aria-label="Tue: more time"]')).toBeNull();
      expect(host.querySelector('[aria-label="Wed: more time"]')).not.toBeNull();
    });
  });
});
