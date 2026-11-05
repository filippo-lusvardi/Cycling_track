// The legend: a small tree drawn by the app's own tree code, with its parts labelled. Tap a label, or a term in the list,
// for what it means. Its data is a fixed sample, so the labels always land on what they name, whatever your tree is like.
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { GardenScene } from "@/components/garden/GardenScene";
import { PageSky } from "@/components/sky/SkyPage";
import { CrownView } from "@/components/tree/Crown";
import { TreeBody, useWidth } from "@/components/tree/TreeBody";
import type { LegendTab } from "@/lib/ask";
import { buildGarden, type CropMap } from "@/lib/garden";
import { ASK_GUIDE, GARDEN_GUIDE, TREE_GUIDE, type GuideItem } from "@/lib/guides";
import { t } from "@/lib/i18n";
import type { Activity, OffKind, Wellness } from "@/lib/intervals";
import { addDays } from "@/lib/training";
import { buildDays, crownFor, seasonLabel } from "@/lib/tree";
import { cn } from "@/lib/utils";
import { closeLegend, useLegend } from "./legend-store";

/** The sample tree's width: the labels below are placed for it. */
const W = 358;
const TODAY = "2026-06-15";
const GARDEN_H = 470;

/** Where each part is on the sample tree, and where its label sits. */
const SPOTS: { id: string; x: number; y: number; lx: number; ly: number }[] = [
  { id: "crown", x: 71, y: 240, lx: 8, ly: 150 },
  { id: "sky", x: 300, y: 125, lx: 292, ly: 84 },
  { id: "trunk", x: 179, y: 330, lx: 205, ly: 312 },
  { id: "branches", x: 256, y: 370, lx: 285, ly: 356 },
  { id: "leaves", x: 41, y: 430, lx: 6, ly: 392 },
  { id: "owl", x: 118, y: 432, lx: 108, ly: 392 },
  { id: "squirrel", x: 146, y: 445, lx: 60, ly: 465 },
  { id: "sprouts", x: 187, y: 398, lx: 215, ly: 395 },
  { id: "knots", x: 179, y: 471, lx: 205, ly: 465 },
  { id: "birds", x: 230, y: 515, lx: 225, ly: 535 },
];

function sampleTree() {
  const acts: Activity[] = [];
  const wellness: Wellness[] = [];
  const names = [
    t("Lake loop", "Giro del lago"),
    t("Long ride", "Lungo"),
    t("Easy spin", "Fondo lento"),
  ];
  for (let i = 60; i >= 0; i--) {
    const d = addDays(TODAY, -i);
    const ctl = 42 + 10 * Math.sin((60 - i) / 12);
    wellness.push({
      id: d,
      ctl,
      atl: ctl + 4,
      rampRate: 1,
      weight: null,
      bodyFat: null,
      hrv: 62,
      sleepSecs: 26000,
      sleepQuality: null,
      soreness: null,
      fatigue: null,
      stress: null,
      mood: null,
      motivation: null,
      eftp: null,
      wPrime: null,
      pMax: null,
      comments: null,
    });
    if (i % 7 === 0 || i % 7 === 2 || i % 7 === 4) {
      const big = i === 2;
      acts.push({
        id: `s${i}`,
        start_date_local: `${d}T09:00:00`,
        type: "Ride",
        name: names[i % names.length],
        moving_time: big ? 21000 : 5400 + (i % 5) * 1500,
        icu_training_load: big ? 220 : 55 + (i % 6) * 15,
        total_elevation_gain: big ? 2100 : 300 + (i % 7) * 180,
        distance: big ? 120000 : 40000 + (i % 5) * 9000,
        icu_intensity: 60 + (i % 5) * 9,
        brioches: i === 4 ? 2 : 0,
      } as unknown as Activity);
    }
  }
  acts.push({
    id: "run",
    start_date_local: `${addDays(TODAY, -1)}T18:00:00`,
    type: "Run",
    name: t("Run", "Corsa"),
    moving_time: 2400,
    icu_training_load: 30,
    total_elevation_gain: 50,
    distance: 6000,
    icu_intensity: 70,
    brioches: 0,
  } as unknown as Activity);
  acts.sort((a, b) => b.start_date_local.localeCompare(a.start_date_local));
  const off = new Map<string, OffKind>([[addDays(TODAY, -3), "SICK"]]);
  const crown = {
    ...crownFor(wellness, acts, TODAY, [], false),
    score: 84,
    season: "summer" as const,
    seasonPhase: 0.5,
    seasonLabel: seasonLabel("summer", 0.5),
    leaves: 64,
    weather: "sun" as const,
    weatherPhase: 0.5,
  };
  return { crown, days: buildDays(acts, wellness, addDays(TODAY, -60), TODAY, off) };
}

function SampleTree() {
  const { crown, days } = useMemo(sampleTree, []);
  return (
    <div className="pointer-events-none" aria-hidden inert>
      <CrownView
        crown={crown}
        today={TODAY}
        trunk={days[0]!.trunk}
        w={W}
        limit={null}
        quiet
        block=""
        onOpen={() => {}}
      />
      <TreeBody days={days.slice(0, 22)} w={W} today={TODAY} quiet blocks={[]} open={() => {}} />
    </div>
  );
}

/** Where each part is on the sample garden, and where its label sits. */
const GARDEN_SPOTS: { id: string; x: number; y: number; lx: number; ly: number }[] = [
  { id: "plants", x: 102, y: 305, lx: 20, ly: 262 },
  { id: "ripening", x: 275, y: 324, lx: 250, ly: 345 },
  { id: "soil", x: 285, y: 262, lx: 296, ly: 275 },
  { id: "animals", x: 166, y: 318, lx: 120, ly: 342 },
  { id: "garden-sky", x: 240, y: 150, lx: 280, ly: 112 },
];

/** Sky drawn above the scene's land that the legend doesn't need. */
const GARDEN_TRIM = 100;

/** The garden's drawing across the window, its labels scaled with it. */
function Fit({ children }: { children: ReactNode }) {
  const [ref, px] = useWidth();
  const k = px ? Math.min(px, 448) / W : 1;
  return (
    <div
      ref={ref}
      className="mx-auto mt-auto w-full max-w-md shrink-0 overflow-hidden md:[mask-image:linear-gradient(to_right,transparent,black_6%,black_94%,transparent)]"
      style={{ height: (GARDEN_H - GARDEN_TRIM) * k }}
    >
      <div
        className="relative"
        style={{
          width: W,
          height: GARDEN_H,
          transform: `translateY(${-GARDEN_TRIM * k}px) scale(${k})`,
          transformOrigin: "top left",
        }}
      >
        {children}
      </div>
    </div>
  );
}

/** A garden with a bit of everything: several beds, fruit at every stage, the animals. */
function sampleGarden() {
  const map: CropMap = { run: "tomato", strength: "pumpkin", walk: "herbs", swim: "lily", v: 2 };
  const session = (id: string, type: string, ago: number, minutes: number, km: number, climb = 0) =>
    ({
      id,
      type,
      name: id,
      start_date_local: `${addDays(TODAY, -ago)}T18:00:00`,
      moving_time: minutes * 60,
      distance: km * 1000,
      total_elevation_gain: climb,
      icu_training_load: minutes,
      icu_intensity: 70,
      brioches: 0,
    }) as unknown as Activity;
  const acts = [
    session("r1", "Run", 0, 40, 8),
    session("r2", "Run", 4, 55, 11),
    session("r3", "Run", 12, 90, 20),
    session("r4", "Run", 20, 45, 9),
    session("g1", "WeightTraining", 2, 45, 0),
    session("g2", "WeightTraining", 9, 60, 0),
    session("g3", "WeightTraining", 16, 45, 0),
    session("w1", "Hike", 6, 180, 12, 700),
    session("w2", "Walk", 14, 70, 5, 200),
    session("s1", "Swim", 3, 40, 2),
    session("s2", "Swim", 11, 50, 2.5),
  ];
  return { map, garden: buildGarden(acts, TODAY, map, "ride") };
}

function SampleGarden() {
  const { map, garden } = useMemo(sampleGarden, []);
  return (
    <div className="pointer-events-none" aria-hidden inert>
      <GardenScene
        garden={garden}
        map={map}
        sky={{ season: "summer", weather: "sun", weatherPhase: 0.5 }}
        w={W}
        h={GARDEN_H}
        now={new Date(`${TODAY}T12:00:00`)}
      />
    </div>
  );
}

/** How to use the search bar: what it does, with things to type. */
function AskGuide() {
  return (
    <div className="mx-auto w-full max-w-xl space-y-3 px-4 pb-4 pt-1">
      {ASK_GUIDE.map((g) => (
        <section key={g.id} className="rounded-xl border border-border bg-card p-4">
          <h2 className="font-semibold">{g.term}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{g.text}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {g.points?.map((p) => (
              <span
                key={p}
                className="rounded-full bg-secondary px-2.5 py-1 text-xs text-foreground"
              >
                {p}
              </span>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function Meaning({ item }: { item: GuideItem }) {
  return (
    <>
      <h2 className="font-semibold">{item.term}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{item.text}</p>
      {item.points && (
        <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-muted-foreground">
          {item.points.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}
    </>
  );
}

export function Legend({ garden }: { garden: boolean }) {
  const state = useLegend();
  const [tab, setTab] = useState<LegendTab>("tree");
  const [term, setTerm] = useState("crown");
  const chips = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!state) return;
    setTab(state.tab);
    setTerm(state.term);
  }, [state]);
  const items =
    tab === "tree"
      ? TREE_GUIDE.filter((g) => g.id && (garden || g.id !== "sprouts"))
      : tab === "garden"
        ? GARDEN_GUIDE.filter((g) => g.id)
        : ASK_GUIDE;
  const item = items.find((g) => g.id === term) ?? items[0]!;
  const byId = new Map(items.map((g) => [g.id, g]));
  const spots = tab === "tree" ? SPOTS : GARDEN_SPOTS;
  useEffect(() => {
    chips.current
      ?.querySelector('[aria-pressed="true"]')
      ?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [term, tab, state]);

  const pick = (nextTab: LegendTab) => {
    setTab(nextTab);
    setTerm(nextTab === "tree" ? "crown" : nextTab === "garden" ? "plants" : "find");
  };

  const labels = (
    <>
      <svg className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden>
        {spots
          .filter((s) => byId.has(s.id))
          .map((s) => {
            const on = s.id === item.id;
            return (
              <g key={s.id} opacity={on ? 1 : 0.75}>
                <line
                  x1={s.lx + 20}
                  y1={s.ly + 13}
                  x2={s.x}
                  y2={s.y}
                  stroke={on ? "var(--primary)" : "white"}
                />
                <circle cx={s.x} cy={s.y} r={2.5} fill={on ? "var(--primary)" : "white"} />
              </g>
            );
          })}
      </svg>
      {spots
        .filter((s) => byId.has(s.id))
        .map((s) => (
          <button
            key={s.id}
            onClick={() => setTerm(s.id)}
            aria-pressed={s.id === item.id}
            className={cn(
              "absolute min-h-7 rounded-full border border-border px-2.5 py-1 text-xs shadow-lg",
              s.id === item.id
                ? "bg-primary font-semibold text-primary-foreground"
                : "bg-card/85 text-foreground backdrop-blur",
            )}
            style={{ left: s.lx, top: s.ly }}
          >
            {byId.get(s.id)!.term}
          </button>
        ))}
    </>
  );

  return (
    <DialogPrimitive.Root open={!!state} onOpenChange={(o) => !o && closeLegend()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Content
          aria-describedby={undefined}
          onOpenAutoFocus={(e) => e.preventDefault()}
          className="fixed inset-0 z-50 flex flex-col outline-none"
          style={{ background: "var(--page-sky, var(--background))" }}
        >
          <PageSky bodies={false} own />
          <div className="relative z-10 flex items-center justify-between px-4 pb-1 pt-[calc(0.75rem+env(safe-area-inset-top))]">
            <DialogPrimitive.Title className="on-sky text-2xl font-bold tracking-tight">
              {t("Legend", "Legenda")}
            </DialogPrimitive.Title>
            <DialogPrimitive.Close
              aria-label={t("Close", "Chiudi")}
              className="flex h-11 w-11 items-center justify-center rounded-full border border-border bg-card/85 shadow-lg backdrop-blur"
            >
              <X className="h-4 w-4" />
            </DialogPrimitive.Close>
          </div>
          <div className="relative z-10 flex min-h-0 flex-1 flex-col overflow-y-auto [scrollbar-width:none]">
            {tab === "tree" ? (
              <div className="relative mx-auto shrink-0" style={{ width: W }}>
                <SampleTree />
                {labels}
              </div>
            ) : tab === "ask" ? (
              <AskGuide />
            ) : (
              garden && (
                <Fit>
                  <SampleGarden />
                  {labels}
                </Fit>
              )
            )}
          </div>
          <div className="relative z-10 rounded-t-2xl border border-border bg-card px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-4 shadow-lg">
            {tab !== "ask" && (
              <>
                <div className="max-h-[26dvh] overflow-y-auto [scrollbar-width:none]">
                  <Meaning item={item} />
                </div>
                <div
                  ref={chips}
                  className="-mx-1 mt-3 flex gap-1 overflow-x-auto px-1 pb-1 [scrollbar-width:none]"
                >
                  {items.map((g) => (
                    <button
                      key={g.id}
                      onClick={() => setTerm(g.id!)}
                      aria-pressed={g.id === item.id}
                      className={cn(
                        "shrink-0 rounded-full px-3 py-1.5 text-xs",
                        g.id === item.id ? "bg-secondary text-foreground" : "text-muted-foreground",
                      )}
                    >
                      {g.term}
                    </button>
                  ))}
                </div>
              </>
            )}
            {
              <div
                className={cn("flex gap-1", tab !== "ask" && "mt-2 border-t border-border pt-2")}
              >
                {(garden ? (["tree", "garden", "ask"] as const) : (["tree", "ask"] as const)).map(
                  (v) => (
                    <button
                      key={v}
                      onClick={() => pick(v)}
                      aria-pressed={tab === v}
                      className={cn(
                        "min-h-9 rounded-full px-3 text-sm",
                        tab === v ? "bg-secondary text-foreground" : "text-muted-foreground",
                      )}
                    >
                      {v === "tree"
                        ? t("Tree", "Albero")
                        : v === "garden"
                          ? t("Garden", "Orto")
                          : t("Search", "Ricerca")}
                    </button>
                  ),
                )}
              </div>
            }
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
