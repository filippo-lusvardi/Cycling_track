// What happened to the tree while you were away, played once over the tree. A new ride: one thread of light carrying
// the real ride climbs the trunk (it swells and brightens with the effort, so intervals read as beads and a long
// steady ride as a calm line), the branch pushes out behind its point of light and the leaves open as it passes. New
// brioches: birds fly in. A tap anywhere ends it; the rows underneath then draw exactly what was here.
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import {
  BRANCH_BLOSSOMS,
  BRANCH_LEAF,
  BRANCH_LEAVES_FROM,
  branchCurve,
  branchLabel,
  Birds,
  BranchBlossoms,
  Label,
  Leaves,
  ReturnShoot,
  seatsOf,
  YOUNG_WOOD,
} from "./TreeRows";
import { Bird, FLIGHT_SECONDS, FlyingBird } from "./Critters";
import type { Play } from "@/hooks/use-tree-arrivals";
import { effortProfile, rideFtp } from "@/lib/arrivals";
import type { Activity } from "@/lib/intervals";
import { getStreams } from "@/lib/source";
import type { TreeBranch, TreeDay } from "@/lib/tree";

const SAP = "color-mix(in oklab, var(--birch) 78%, white)";
/** How fast the thread climbs, px a second. */
const SPEED = 230;
/** A ride with no detail arriving in this time grows without its thread, never waiting on the network. */
const PROFILE_WAIT_MS = 2500;
const GROW_ALONE = 1.1;
const AFTER_GROWTH = 0.5;
const BIRD_GAP = 0.38;
const clamp = (v: number) => Math.min(1, Math.max(0, v));
const ease = (v: number) => 1 - (1 - clamp(v)) ** 3;

async function rideProfile(a: Activity | undefined) {
  if (!a) return null;
  const timeout = new Promise<null>((r) => setTimeout(() => r(null), PROFILE_WAIT_MS));
  const load = getStreams(a.id).then(
    (s) => effortProfile(s, rideFtp(a)),
    () => null,
  );
  return Promise.race([load, timeout]);
}

type Spot = { top: number; y0: number };
type Shoot = { x: number; y: number; side: -1 | 1; scale: number };

export function Arrivals({
  play,
  days,
  acts,
  w,
  quiet,
  root,
  bloomed,
  onDone,
  loadProfile = rideProfile,
}: {
  play: Play;
  days: TreeDay[];
  acts: Activity[];
  w: number;
  quiet: boolean;
  root: RefObject<HTMLDivElement | null>;
  bloomed?: Set<string> | undefined;
  onDone: () => void;
  loadProfile?: (a: Activity | undefined) => Promise<number[] | null>;
}) {
  const [time, setTime] = useState(0);
  const [profile, setProfile] = useState<number[] | null | undefined>(play.sap ? undefined : null);
  const [spots, setSpots] = useState<Record<string, Spot> | null>(null);
  const [shoot, setShoot] = useState<Shoot | null>(null);
  const [from, setFrom] = useState(0);
  const finished = useRef(false);
  const finish = useRef(onDone);
  finish.current = onDone;
  const end = () => {
    if (finished.current) return;
    finished.current = true;
    finish.current();
  };

  // Where each row sits; a row that's off screen just stays as it is, with nothing to watch.
  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return end();
    const box = el.getBoundingClientRect();
    setFrom(Math.min(window.innerHeight - box.top, box.height));
    const found: Record<string, Spot> = {};
    const ids = [play.sap, ...play.birds.map((c) => c.id)].filter((x) => x != null);
    for (const id of ids) {
      const g = el.querySelector<SVGGElement>(`[data-branch="${CSS.escape(id)}"]`);
      const row = g?.closest("svg")?.getBoundingClientRect();
      if (!g || !row || row.top > window.innerHeight || row.bottom < 0) continue;
      found[id] = { top: row.top - box.top, y0: Number(g.dataset["y0"]) };
    }
    setSpots(found);
    const s = play.shootDay ? el.querySelector<SVGGElement>("[data-shoot]") : null;
    if (s) {
      const svg = s.closest("svg")!.getBoundingClientRect();
      const d = s.dataset;
      setShoot({
        x: Number(d["x"]),
        y: svg.top - box.top + Number(d["y"]),
        side: Number(d["side"]) as 1 | -1,
        scale: Number(d["scale"]),
      });
    }
    // Measured once: the rows only change back when this is over.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!play.sap) return;
    let live = true;
    void loadProfile(acts.find((a) => a.id === play.sap)).then((p) => live && setProfile(p));
    return () => {
      live = false;
    };
    // The ride to play doesn't change while it plays.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A tap anywhere ends it, and still does what it would have done.
  useEffect(() => {
    window.addEventListener("pointerdown", end, true);
    return () => window.removeEventListener("pointerdown", end, true);
  }, []);

  const day = play.sap ? days.find((d) => d.branches.some((b) => b.id === play.sap)) : undefined;
  const ride: TreeBranch | undefined = day?.branches.find((b) => b.id === play.sap);
  const spot = play.sap ? spots?.[play.sap] : undefined;

  const y0 = (spot?.top ?? 0) + (spot?.y0 ?? 0);
  const len = profile ? Math.min(280, 70 + (ride?.minutes ?? 60) * 0.55) : 0;
  const tArrive = profile ? Math.max(0, from - y0) / SPEED : 0;
  const tAbsorb = spot ? (profile ? tArrive + len / SPEED : GROW_ALONE) : 0;
  // The sap's own new birds follow its growth; birds on other rides come when it's over.
  const birdsAt = spot ? tAbsorb + AFTER_GROWTH : 0;
  const flights = play.birds.filter((c) => spots?.[c.id]);
  const total = Math.max(
    spot ? tAbsorb + AFTER_GROWTH : 0,
    ...flights.map((c) => birdsAt + FLIGHT_SECONDS + (Math.abs(c.to - c.from) - 1) * BIRD_GAP),
  );

  const ready = spots !== null && profile !== undefined;
  useEffect(() => {
    if (!ready) return;
    if (total <= 0) return end();
    const t0 = performance.now();
    let id = 0;
    const tick = (now: number) => {
      const s = (now - t0) / 1000;
      if (s >= total + 0.05) return end();
      setTime(s);
      id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [ready, total]);

  if (!ready) return null;

  const cx = w / 2;
  const t = time;
  const head = from - SPEED * t;
  const absorbed = !spot ? 1 : profile ? clamp((y0 - head) / (len || 1)) : clamp(t / GROW_ALONE);

  return (
    <svg
      className="pointer-events-none absolute left-0 top-0 z-10"
      width={w}
      height={1}
      style={{ overflow: "visible" }}
      aria-hidden
    >
      {spot && ride && day && (
        <g transform={`translate(0 ${spot.top})`}>
          <GrowingBranch
            b={ride}
            cx={cx}
            trunk={day.trunk}
            y0={spot.y0}
            grown={ease(absorbed)}
            opened={absorbed + Math.max(0, t - tAbsorb) / AFTER_GROWTH}
            light={1 - clamp((t - tAbsorb) / 0.4)}
            bloomed={!!bloomed?.has(ride.id)}
          />
          <g opacity={clamp((t - (tAbsorb + AFTER_GROWTH - 0.35)) / 0.35)}>
            <Label
              cx={cx}
              trunk={day.trunk}
              side={ride.side}
              y={spot.y0 - 14}
              title={ride.name}
              sub={branchLabel(day, ride, quiet)}
            />
            <Birds
              b={{ ...ride, brioches: 0 }}
              at={branchCurve(ride, cx, day.trunk, spot.y0).at}
              length={branchCurve(ride, cx, day.trunk, spot.y0).length}
              from={BRANCH_LEAVES_FROM}
            />
          </g>
        </g>
      )}
      {spot && profile && head + len > y0 && (
        <Thread profile={profile} head={head} len={len} cx={cx} clipTop={y0} width={w} />
      )}
      {shoot && (
        <ReturnShoot
          x={shoot.x}
          y={shoot.y}
          side={shoot.side}
          scale={shoot.scale}
          at={shoot.y > from ? 9 : t - (from - shoot.y) / SPEED}
        />
      )}
      {flights.flatMap((c) => {
        const found = days
          .flatMap((d) => d.branches.map((b) => ({ b, d })))
          .find((x) => x.b.id === c.id);
        const at = spots![c.id]!;
        if (!found) return [];
        return [
          <Flights
            key={c.id}
            change={c}
            b={found.b}
            trunk={found.d.trunk}
            top={at.top}
            y0={at.y0}
            cx={cx}
            w={w}
            t={t - birdsAt}
          />,
        ];
      })}
    </svg>
  );
}

function Thread({
  profile,
  head,
  len,
  cx,
  clipTop,
  width,
}: {
  profile: number[];
  head: number;
  len: number;
  cx: number;
  clipTop: number;
  width: number;
}) {
  const n = profile.length - 1;
  const points = profile.map((raw, i) => {
    const u = i / n;
    const near = (k: number) => profile[Math.min(n, Math.max(0, i + k))]!;
    const e = (raw + near(-1) + near(1)) / 3;
    return {
      u,
      e,
      y: head + u * len,
      half: (0.45 + 2.3 * e) * Math.min(1, u / 0.05, (1 - u) / 0.05),
    };
  });
  const d = `M${points.map((p) => `${cx - p.half},${p.y}`).join(" L")} L${[...points]
    .reverse()
    .map((p) => `${cx + p.half},${p.y}`)
    .join(" L")} Z`;
  return (
    <>
      <defs>
        <filter id="sap-glow" x="-300%" y="-10%" width="700%" height="120%">
          <feGaussianBlur stdDeviation="2.4" />
        </filter>
        <linearGradient
          id="sap-thread"
          gradientUnits="userSpaceOnUse"
          x1="0"
          x2="0"
          y1={head}
          y2={head + len}
        >
          {points
            .filter((_, i) => i % 2 === 0)
            .map((p) => (
              <stop key={p.u} offset={p.u} stopColor={SAP} stopOpacity={0.4 + 0.6 * p.e} />
            ))}
        </linearGradient>
        <clipPath id="sap-below">
          <rect x="0" y={clipTop} width={width} height={Math.max(1, head + len - clipTop + 4)} />
        </clipPath>
      </defs>
      <g clipPath="url(#sap-below)">
        <path d={d} fill={SAP} opacity={0.4} filter="url(#sap-glow)" />
        <path d={d} fill="url(#sap-thread)" />
      </g>
    </>
  );
}

function GrowingBranch({
  b,
  cx,
  trunk,
  y0,
  grown,
  opened,
  light,
  bloomed,
}: {
  b: TreeBranch;
  cx: number;
  trunk: number;
  y0: number;
  grown: number;
  opened: number;
  light: number;
  bloomed: boolean;
}) {
  const { at } = branchCurve(b, cx, trunk, y0);
  const line = (from: number, to: number) => {
    const steps = 40;
    return Array.from({ length: steps + 1 }, (_, i) => {
      const [x, y] = at(from + ((to - from) * i) / steps);
      return `${i ? "L" : "M"}${x},${y}`;
    }).join(" ");
  };
  if (grown <= 0) return null;
  return (
    <g>
      <path
        d={line(0, grown)}
        fill="none"
        stroke={YOUNG_WOOD}
        strokeWidth={b.thickness * (0.6 + 0.4 * grown)}
        strokeLinecap="round"
      />
      <Leaves b={b} at={at} from={BRANCH_LEAVES_FROM} size={BRANCH_LEAF} opened={opened} />
      {bloomed && <BranchBlossoms b={b} at={at} {...BRANCH_BLOSSOMS} opened={opened} />}
      {light > 0 && (
        <path
          d={line(Math.max(0, grown - 0.22), grown)}
          fill="none"
          stroke={SAP}
          strokeWidth={1.5}
          strokeLinecap="round"
          opacity={light}
        />
      )}
    </g>
  );
}

/** One ride's birds in the air: arriving ones land one after another, ones taken off the count fly away. */
function Flights({
  change,
  b,
  trunk,
  top,
  y0,
  cx,
  w,
  t,
}: {
  change: { from: number; to: number };
  b: TreeBranch;
  trunk: number;
  top: number;
  y0: number;
  cx: number;
  w: number;
  t: number;
}) {
  const leaving = change.to < change.from;
  const most = Math.max(change.from, change.to);
  const fewest = Math.min(change.from, change.to);
  const { at, length } = branchCurve(b, cx, trunk, y0);
  // Seats as they are with everyone there, so a bird flies to or from the place it has on the tree.
  const { seats } = seatsOf({ ...b, brioches: most }, at, length, BRANCH_LEAVES_FROM);
  const span = Math.min(w / 2 + 40, 360);
  const birds: ReactNode[] = seats.slice(fewest).map((seat, i) => {
    const at2 = t - i * BIRD_GAP;
    if (at2 <= 0)
      return leaving ? (
        <Bird key={i} x={seat.x} y={seat.y} side={b.side} s={seat.scale} kind={seat.kind} />
      ) : null;
    if (at2 >= FLIGHT_SECONDS)
      return leaving ? null : (
        <Bird key={i} x={seat.x} y={seat.y} side={b.side} s={seat.scale} kind={seat.kind} />
      );
    return (
      <FlyingBird
        key={i}
        at={at2}
        x={seat.x}
        y={seat.y}
        side={b.side}
        s={seat.scale}
        kind={seat.kind}
        span={span}
        leaving={leaving}
      />
    );
  });
  return <g transform={`translate(0 ${top})`}>{birds}</g>;
}
