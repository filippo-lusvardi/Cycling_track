import { Decoder, Stream } from "@garmin/fitsdk";
import { describe, expect, it } from "vitest";
import { parseBrouter } from "./brouter";
import { decodeLine, encodeLine, rodeIt } from "./course";
import { calibrate, lineSeconds, riderFrom, speedOn } from "./estimate";
import { coursePoints, fileName, fitCourse, gpxCourse } from "./fit-course";
import {
  climbLoops,
  fits,
  pickDistinct,
  triangleLoops,
  type KnownClimb,
  type Wish,
} from "./generate";
import { between, gainOf, joinLines, offset, resample, selfOverlap, thin } from "./geo";
import {
  addRide,
  emptyRoads,
  homeOf,
  nearestNode,
  ownShare,
  packRoads,
  roadLines,
  roadPath,
  unpackRoads,
} from "./my-roads";
import { DEFAULT_OPTIONS, legVias, planRoute, routeVias, stopsOn } from "./plan";
import { road, straightRouter, TRENTO } from "./test-lines";

describe("BRouter answers", () => {
  it("reads positions, altitudes and distances, filling a missing altitude", () => {
    const l = parseBrouter({
      features: [
        {
          geometry: {
            coordinates: [
              [11.12, 46.06, 200],
              [11.121, 46.06],
              [11.122, 46.06, 210],
            ],
          },
        },
      ],
    });
    expect(l.lat).toEqual([46.06, 46.06, 46.06]);
    expect(l.alt).toEqual([200, 200, 210]);
    expect(l.dist[2]).toBeGreaterThan(150);
    expect(l.dist[2]).toBeLessThan(160);
  });
});

describe("geometry", () => {
  it("joins lines without repeating the shared point", () => {
    const a = road(TRENTO, 90, 1000);
    const b = road({ lat: a.lat.at(-1)!, lng: a.lng.at(-1)! }, 90, 1000);
    const j = joinLines([a, b]);
    expect(j.lat.length).toBe(a.lat.length + b.lat.length - 1);
    expect(j.dist.at(-1)).toBeCloseTo(2000, -1);
  });

  it("resamples and thins", () => {
    const l = road(TRENTO, 0, 1000, 0, 7);
    const r = resample(l, 20);
    expect(r.dist[1]).toBeCloseTo(20, 5);
    expect(r.dist.at(-1)).toBeCloseTo(l.dist.at(-1)!, 5);
    const pts = l.lat.map((lat, i) => ({ lat, lng: l.lng[i]! }));
    const v = thin(pts, 300);
    expect(v[0]).toEqual(pts[0]);
    expect(v.at(-1)).toEqual(pts.at(-1));
    expect(v.length).toBe(4);
  });

  it("counts climbing past altitude noise", () => {
    expect(gainOf([100, 101, 100, 101, 100])).toBe(0);
    expect(gainOf([100, 150, 120, 170])).toBe(100);
  });

  it("sees an out-and-back as overlap and a loop as none", () => {
    const out = road(TRENTO, 90, 3000);
    const back = {
      lat: [...out.lat].reverse(),
      lng: [...out.lng].reverse(),
      alt: out.alt,
      dist: out.dist,
    };
    expect(selfOverlap(joinLines([out, back]))).toBeGreaterThan(0.6);
    expect(selfOverlap(road(TRENTO, 90, 5000))).toBe(0);
  });
});

describe("your roads", () => {
  const east = road(TRENTO, 90, 3000);
  // The same road ridden again with ~8 m of GPS offset.
  const eastAgain = road(offset(TRENTO, 0, 8), 90, 3000);

  it("lays two rides of the same road on the same nodes and counts both", () => {
    const r = emptyRoads();
    addRide(r, "a", east.lat, east.lng);
    const nodes = r.nodes.size;
    addRide(r, "b", eastAgain.lat, eastAgain.lng);
    expect(r.nodes.size).toBeLessThan(nodes * 1.1);
    const mid = nearestNode(r, offset(TRENTO, 90, 1500), 40)!;
    expect(Math.max(...r.nodes.get(mid)!.edges.values())).toBe(2);
    addRide(r, "a", east.lat, east.lng);
    expect(Math.max(...r.nodes.get(mid)!.edges.values())).toBe(2);
  });

  it("finds a path along them and prefers the road ridden more", () => {
    const r = emptyRoads();
    // Two ways from A to B: straight east (ridden once) and a dog-leg north (ridden three times).
    const a = TRENTO;
    const b = offset(TRENTO, 90, 2000);
    const north = road(a, 0, 600);
    const across = road(offset(a, 0, 600), 90, 2000);
    const down = road(offset(b, 0, 600), 180, 600);
    addRide(r, "s", road(a, 90, 2000).lat, road(a, 90, 2000).lng);
    for (const id of ["n1", "n2", "n3", "n4", "n5", "n6", "n7", "n8"]) {
      const l = joinLines([north, across, down]);
      addRide(r, id, l.lat, l.lng);
    }
    const p = roadPath(r, nearestNode(r, a)!, nearestNode(r, b)!)!;
    expect(p).not.toBeNull();
    expect(Math.max(...p.map((q) => between(q, a)))).toBeGreaterThan(500);
    expect(homeOf(r)).not.toBeNull();
    expect(between(homeOf(r)!, a)).toBeLessThan(30);
  });

  it("says how much of a line is on them, and survives packing", () => {
    const r = emptyRoads();
    addRide(r, "a", east.lat, east.lng);
    expect(ownShare(r, east)).toBeGreaterThan(0.95);
    expect(ownShare(r, road(offset(TRENTO, 0, 1000), 90, 3000))).toBe(0);
    const back = unpackRoads(packRoads(r));
    expect(back.nodes.size).toBe(r.nodes.size);
    expect(ownShare(back, east)).toBeGreaterThan(0.95);
    expect(back.rides.has("a")).toBe(true);
    const lines = roadLines(back, [
      [45, 10],
      [47, 12],
    ]);
    expect(lines.length).toBeGreaterThan(0);
    // A node every 40 m or so along the 3 km.
    expect(lines.reduce((s, l) => s + l.lat.length - 1, 0)).toBeGreaterThan(50);
  });
});

describe("planning", () => {
  it("routes a leg along your roads when they don't stretch it, and straight when they do", () => {
    const r = emptyRoads();
    const l = road(TRENTO, 90, 6000);
    addRide(r, "a", l.lat, l.lng);
    const end = offset(TRENTO, 90, 6000);
    const vias = legVias(TRENTO, end, r);
    expect(vias.length).toBeGreaterThan(3);
    // A ride that goes far north and back is no way to cross 1 km east.
    const u = joinLines([
      road(TRENTO, 0, 4000),
      road(offset(TRENTO, 0, 4000), 90, 1000),
      road(offset(offset(TRENTO, 0, 4000), 90, 1000), 180, 4000),
    ]);
    const r2 = emptyRoads();
    addRide(r2, "u", u.lat, u.lng);
    expect(legVias(TRENTO, offset(TRENTO, 90, 1000), r2)).toHaveLength(2);
    expect(legVias(TRENTO, end, null)).toHaveLength(2);
  });

  it("closes a loop and places the checkpoints", async () => {
    const cps = [TRENTO, offset(TRENTO, 90, 3000), offset(TRENTO, 45, 3000)];
    const o = { ...DEFAULT_OPTIONS, loop: true };
    expect(routeVias(cps, o, null)).toHaveLength(4);
    const p = await planRoute(cps, o, { route: straightRouter(), roads: null });
    expect(p.stops).toHaveLength(4);
    expect(p.stops[0]).toBe(0);
    expect(p.stops.at(-1)).toBe(p.line.lat.length - 1);
    expect(p.stops[1]).toBeLessThan(p.stops[2]!);
    expect(stopsOn(p.line, cps, true)).toEqual(p.stops);
  });
});

describe("time", () => {
  const r = riderFrom(280, 70);

  it("goes slower uphill and faster downhill, capped", () => {
    expect(speedOn(0.08, r)).toBeLessThan(speedOn(0, r));
    expect(speedOn(-0.08, r)).toBeGreaterThan(speedOn(0, r));
    expect(speedOn(-0.2, r)).toBeLessThanOrEqual(15);
    // An easy 174 W on the flat: high 20s km/h.
    expect(speedOn(0, r) * 3.6).toBeGreaterThan(25);
    expect(speedOn(0, r) * 3.6).toBeLessThan(36);
  });

  it("takes your own rides as the correction", () => {
    const flat = road(TRENTO, 90, 20000);
    const model = lineSeconds(flat, r);
    // You rode it in 1.2 times the model's time, with a 10 minute stop in the middle that doesn't count.
    const time = flat.dist.map((d) => (d / 20000) * model * 1.2 + (d > 10000 ? 600 : 0));
    expect(calibrate([{ ...flat, time }], r)).toBeCloseTo(1.2, 1);
    expect(calibrate([], r)).toBe(1);
    expect(lineSeconds(flat, { ...r, factor: 1.2 })).toBeCloseTo(model * 1.2, 0);
  });
});

describe("loops from a wish", () => {
  const wish: Wish = {
    seconds: 3600,
    climbs: ["short", "steep"],
    start: TRENTO,
    options: DEFAULT_OPTIONS,
  };
  const climb = (id: string, b: number, km: number, length: number, grade: number): KnownClimb => {
    const start = offset(TRENTO, b, km * 1000);
    return { id, name: id, start, top: offset(start, b, length), length, grade };
  };

  it("reads short, long, steep and gentle", () => {
    expect(fits({ length: 1500, grade: 9 }, ["short", "steep"])).toBe(true);
    expect(fits({ length: 4000, grade: 9 }, ["short", "steep"])).toBe(false);
    expect(fits({ length: 1500, grade: 5 }, ["steep"])).toBe(false);
    expect(fits({ length: 8000, grade: 4 }, ["long", "gentle"])).toBe(true);
    expect(fits({ length: 8000, grade: 4 }, ["flat"])).toBe(true);
  });

  it("goes through the known climbs that fit, uphill, within reach", () => {
    const known = [
      climb("sardagna", 270, 3, 1800, 10),
      climb("povo", 90, 4, 2000, 8),
      climb("bondone", 250, 4, 15000, 7), // too long
      climb("far", 0, 40, 1500, 9), // too far
      climb("easy", 180, 3, 1500, 4), // not steep
    ];
    const loops = climbLoops(wish, 28000, known);
    expect(loops.length).toBeGreaterThan(0);
    const ids = new Set(loops.flatMap((l) => l.through.map((c) => c.id)));
    expect([...ids].sort()).toEqual(["povo", "sardagna"]);
    const one = loops.find((l) => l.through.length === 1)!;
    // Start, then the climb's foot before its top.
    expect(one.checkpoints[1]).toEqual(one.through[0]!.start);
    expect(one.checkpoints[2]).toEqual(one.through[0]!.top);
    expect(climbLoops({ ...wish, climbs: ["flat"] }, 28000, known)).toEqual([]);
  });

  it("draws triangles of about the right size, and keeps distinct ones", () => {
    const tris = triangleLoops(wish, 26000, null, 4);
    expect(tris).toHaveLength(4);
    const t = tris[0]!;
    const crow =
      between(t.checkpoints[0]!, t.checkpoints[1]!) +
      between(t.checkpoints[1]!, t.checkpoints[2]!) +
      between(t.checkpoints[2]!, t.checkpoints[0]!);
    expect(crow * 1.3).toBeGreaterThan(22000);
    expect(crow * 1.3).toBeLessThan(30000);
    const line = road(TRENTO, 90, 5000);
    const p = (key: string, score: number, l = line) => ({
      key,
      checkpoints: [],
      planned: { line: l, stops: [], own: 0 },
      seconds: 0,
      climbs: [],
      through: [],
      score,
    });
    const picked = pickDistinct([p("a", 2), p("b", 1), p("c", 3, road(TRENTO, 0, 5000))], 3);
    expect(picked.map((x) => x.key)).toEqual(["b", "c"]);
  });
});

describe("the route as files", () => {
  const line = joinLines([
    road(TRENTO, 90, 3000, 0),
    road(offset(TRENTO, 90, 3000), 90, 2000, 0.08, 20, 200),
  ]);
  const times = line.dist.map((d) => d / 8);

  it("writes a FIT course a device reads: records, course points, the totals", () => {
    const points = coursePoints(
      [
        { dist: 0, name: "Partenza" },
        { dist: 5000, name: "Arrivo in cima alla salita lunga" },
      ],
      [
        {
          startKm: 3,
          endKm: 5,
          length: 2000,
          gain: 160,
          avgGrade: 8,
          maxGrade: 9,
          category: "3",
        } as never,
      ],
      () => "Sardagna",
    );
    const bytes = fitCourse(
      { name: "Giro di prova", line, times, points },
      new Date("2026-11-11T10:00:00Z"),
    );
    const dec = new Decoder(Stream.fromByteArray(Array.from(bytes)));
    expect(dec.isFIT()).toBe(true);
    expect(dec.checkIntegrity()).toBe(true);
    const { messages, errors } = dec.read();
    expect(errors).toEqual([]);
    expect(messages.fileIdMesgs?.[0]?.type).toBe("course");
    expect(messages.courseMesgs?.[0]?.name).toBe("Giro di prova");
    expect(messages.recordMesgs!.length).toBeGreaterThan(150);
    const cp = messages.coursePointMesgs!;
    expect(cp.map((c) => c.type)).toEqual(["checkpoint", "thirdCategory", "summit", "checkpoint"]);
    expect(String(cp.at(-1)!.name).length).toBeLessThanOrEqual(15);
    expect(messages.lapMesgs?.[0]?.totalAscent).toBeGreaterThan(150);
    const last = messages.recordMesgs!.at(-1)!;
    expect(last.altitude).toBeCloseTo(360, 0);
    expect(last.distance).toBeCloseTo(line.dist.at(-1)!, 0);
  });

  it("writes a GPX and a safe file name", () => {
    const gpx = gpxCourse("Giro <di> prova", line, [{ ...TRENTO, name: "Duomo & co" }]);
    expect(gpx).toContain("<name>Giro &lt;di&gt; prova</name>");
    expect(gpx).toContain("Duomo &amp; co");
    expect(gpx.match(/<trkpt/g)!.length).toBeGreaterThan(200);
    expect(fileName("Giro di Sardagna e Povo!", "fit")).toBe("Giro-di-Sardagna-e-Povo.fit");
    expect(fileName("…", "gpx")).toBe("percorso.gpx");
  });
});

describe("stored routes", () => {
  it("survive encoding to within a metre", () => {
    const l = road(TRENTO, 30, 10000, 0.03);
    const back = decodeLine(encodeLine(l));
    expect(back.lat.length).toBe(Math.ceil(10000 / 20) + 1);
    expect(
      between(
        { lat: back.lat.at(-1)!, lng: back.lng.at(-1)! },
        { lat: l.lat.at(-1)!, lng: l.lng.at(-1)! },
      ),
    ).toBeLessThan(1.5);
    expect(back.alt.at(-1)).toBeCloseTo(l.alt.at(-1)!, 0);
    expect(encodeLine(l).length).toBeLessThan(10000);
  });

  it("know a ride that went round them", () => {
    const l = road(TRENTO, 30, 10000);
    expect(rodeIt(l, road(offset(TRENTO, 120, 10), 30, 11000))).toBe(true);
    expect(rodeIt(l, road(TRENTO, 30, 4000))).toBe(false);
  });
});
