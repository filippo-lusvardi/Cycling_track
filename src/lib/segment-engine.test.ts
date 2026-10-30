import { describe, expect, it } from "vitest";
import { packTrack, unpackTrack, packedBytes } from "./compact";
import { createSegmentEngine, yearChunks, type KV, type RideRef } from "./segment-engine";
import { groupSegment, ridesIn } from "./segment-index";
import { findAttempts, haversine, segmentFromRange, type TrackLike } from "./segments";
import { branch, join, profile, ride, road } from "@/test/ride-fixtures";

function memKV(): KV & { gets: number } {
  const m = new Map<string, unknown>();
  const kv = {
    gets: 0,
    async get<T>(k: string) {
      kv.gets++;
      return structuredClone(m.get(k)) as T | undefined;
    },
    async set(k: string, v: unknown) {
      m.set(k, structuredClone(v));
    },
    async del(k: string) {
      m.delete(k);
    },
    async keys() {
      return [...m.keys()];
    },
  };
  return kv;
}

const base = road(30, 7);
const climb = profile(30, [[10, 14, 6]]);
const RIDES = {
  today: { ...ride("today", 3, base, climb, { altNoise: 2 }), date: "2026-10-30T09:00:00" },
  sunday: { ...ride("sunday", 9, join(base, 10), profile(30, [[9.5, 10, 2.5], [10, 14, 6]]), { altNoise: 2 }), date: "2026-10-25T09:00:00" },
  half: { ...ride("half", 5, branch(base, 12, 30), profile(30, [[10, 12, 6]])), date: "2026-10-20T09:00:00" },
} satisfies Record<string, TrackLike>;
type RideId = keyof typeof RIDES;

function setup(ids: RideId[]) {
  const listed = new Set(ids);
  const env = {
    meta: memKV(),
    tracks: memKV(),
    downloads: 0,
    offline: false,
    listed,
  };
  const engine = createSegmentEngine({
    meta: env.meta,
    tracks: env.tracks,
    async listRides(from, to): Promise<RideRef[]> {
      if (env.offline) throw new TypeError("offline");
      return [...env.listed]
        .map((id) => RIDES[id])
        .filter((t) => t.date.slice(0, 10) >= from && t.date.slice(0, 10) <= to)
        .map((t) => ({ id: t.id, name: t.name, date: t.date }));
    },
    async downloadTrack(ref) {
      if (env.offline) throw new TypeError("offline");
      env.downloads++;
      return RIDES[ref.id as RideId];
    },
    historyFrom: () => "2025-11-01",
    today: () => "2026-10-31",
  });
  return { engine, env };
}

/** Auto segments as the list shows them: ride count from the cached efforts. */
const autos = (engine: ReturnType<typeof setup>["engine"]) => {
  const s = engine.getSnapshot();
  return s.groups.map((g) => ({ g, seg: groupSegment(g), rides: ridesIn(s.efforts[g.id]) }));
};

describe("compact tracks", () => {
  it("round-trips within a metre and is much smaller", () => {
    const t = RIDES.today;
    const back = unpackTrack(structuredClone(packTrack(t)));
    expect(Math.max(...t.lat.map((la, i) => haversine(la, t.lng[i]!, back.lat[i]!, back.lng[i]!)))).toBeLessThan(1);
    expect(back.watts[10]).toBe(220);
    expect(packedBytes(packTrack(t)) / t.lat.length).toBe(24);
  });
});

describe("segment engine", () => {
  it("first sync: downloads each ride once and finds the climb and its half", async () => {
    const { engine, env } = setup(["today", "sunday", "half"]);
    await engine.sync();
    expect(env.downloads).toBe(3);
    const a = autos(engine).sort((x, y) => y.seg.length - x.seg.length);
    expect(a).toHaveLength(2);
    expect(a[0]!.rides).toBe(2); // full climb: today + sunday (different approach roads)
    expect(a[1]!.rides).toBe(3); // first half: everyone
    // The cached efforts are exactly what matching the stored rides gives.
    for (const { g, seg } of a) {
      const direct = Object.values(RIDES).filter((t) => findAttempts(t, seg).length).length;
      expect(ridesIn(engine.getSnapshot().efforts[g.id])).toBe(direct);
    }
  });

  it("a new ride is downloaded and matched on its own; old rides aren't re-read", async () => {
    const { engine, env } = setup(["sunday", "half"]);
    await engine.sync();
    expect(env.downloads).toBe(2);
    env.listed.add("today");
    env.tracks.gets = 0;
    await engine.sync();
    expect(env.downloads).toBe(3);
    const full = autos(engine).find((x) => x.seg.length > 3500)!;
    expect(full.rides).toBe(2);
    // Only the new ride's local check, plus re-reads for groups whose shared core moved: far fewer than all rides × segments.
    expect(env.tracks.gets).toBeLessThanOrEqual(4);
  });

  it("a climb starred before grouping follows the group, so every ride counts", async () => {
    const { engine } = setup(["today", "sunday"]);
    // Old-style star: pins from Sunday's own detection, starting on its side road (only Sunday passes that start).
    const sunday = RIDES.sunday;
    const legacy = { ...segmentFromRange(sunday, 9.55, 14, "auto"), starred: true };
    expect(findAttempts(RIDES.today, legacy)).toHaveLength(0);
    engine.setSaved([legacy]);
    await engine.sync();
    const s = engine.getSnapshot();
    const gid = s.links[legacy.id]!;
    expect(gid).toBeDefined();
    expect(ridesIn(s.efforts[gid])).toBe(2);
  });

  it("rebuilds from stored tracks without downloading after an analysis change", async () => {
    const { engine, env } = setup(["today", "sunday"]);
    await engine.sync();
    await engine.rebuild();
    expect(env.downloads).toBe(2);
    expect(autos(engine).some((x) => x.rides === 2)).toBe(true);
  });

  it("works offline from what it already has", async () => {
    const { engine, env } = setup(["today", "sunday"]);
    await engine.sync();
    env.offline = true;
    await engine.sync();
    expect(engine.getSnapshot().status.phase).toBe("idle");
    expect(autos(engine).some((x) => x.rides === 2)).toBe(true);
  });
});

describe("history listing", () => {
  it("splits a long range into yearly chunks, newest first", () => {
    expect(yearChunks("2024-03-01", "2026-10-31")).toEqual([
      ["2025-10-31", "2026-10-31"],
      ["2024-10-30", "2025-10-30"],
      ["2024-03-01", "2024-10-29"],
    ]);
  });
});
