// Getting around by asking: a bar with the tree, a line to ask on and the sprout. Tapping the line opens the field with
// the keyboard up; typing narrows things down to a few alternatives to choose from. Drawn with what the app already has:
// the floating switch's pill, the Activities rows, the More sheet.
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { useQueries, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  Activity as ActivityIcon,
  Archive,
  Check,
  BookOpen,
  CalendarDays,
  ChartSpline,
  CircleDot,
  HeartPulse,
  Mountain,
  Search,
  Settings,
  Sprout,
  TreeDeciduous,
  Trees,
  X,
  Zap,
  type LucideIcon,
  CalendarRange,
} from "lucide-react";
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { get as idbGet } from "idb-keyval";
import { isCheckedIn, useCheckInState } from "@/components/CheckIn";
import { Bird, Owl, Squirrel } from "@/components/tree/Critters";
import { useLocalStore } from "@/hooks/use-local-store";
import { useNow } from "@/hooks/use-now";
import { useSegmentNames } from "@/hooks/use-segment-names";
import { useSegmentLibrary } from "@/hooks/use-segments";
import { useSuggestInput } from "@/hooks/use-suggest-input";
import { uid } from "@/lib/firebase";
import { analysisBoth, knownRunThreshold, mainSport } from "@/lib/sport";
import {
  allEntries,
  alternatives,
  barText,
  spanAnswer,
  whenEntries,
  gardenPage,
  INDEX,
  norm,
  nowEntries,
  PAGE_DEST,
  PAGE_LABEL,
  todayRideEntry,
  type AskData,
  type Dest,
  type Entry,
  type ListPage,
  type Moment,
  type Page,
} from "@/lib/ask";
import {
  explainRows,
  hintRows,
  intentEntries,
  liveEntries,
  powerPeriodAsked,
  type IntentData,
  type WriteAction,
} from "@/lib/ask-intents";
import {
  memberRows,
  membersAsked,
  treeKey,
  type AskMember,
  type MemberTree,
  type MemberTrees,
} from "@/lib/ask-members";
import { pastAsked, pastRows, pastWindow } from "@/lib/ask-past";
import { correctCommand, simplify } from "@/lib/ask-sentence";
import { lastSaved, rememberUndo, runWrite, undoLast } from "@/lib/ask-write";
import { t } from "@/lib/i18n";
import { isPlanned, type Wellness } from "@/lib/intervals";
import type { RunData } from "@/lib/run-data";
import { attemptsIn } from "@/lib/segment-index";
import { crownFor } from "@/lib/tree";
import {
  activitiesQuery,
  allActivitiesQuery,
  eventsQuery,
  offEventsQuery,
  powerCurveRangeQuery,
  powerCurvesQuery,
  racesQuery,
  rideZonesQuery,
  runDataQuery,
  thresholdsQuery,
  wellnessQuery,
  wellnessRangeQuery,
} from "@/lib/queries";
import {
  CHECK_IN,
  GARDEN,
  gardenOn,
  LAST_RIDE_SEEN,
  LAST_SEASON,
  readSetting,
  writeSetting,
  zoneTops,
} from "@/lib/settings";
import { hasSource, sourceKind } from "@/lib/source";
import { addDays, isoDate } from "@/lib/training";
import type { Season } from "@/lib/tree";
import { cn } from "@/lib/utils";
import { openLegend } from "./legend-store";

const PILL =
  "flex items-center gap-1 rounded-full border border-border bg-card/85 p-1 shadow-lg backdrop-blur";

/** A workout's own shape, as its chart draws it: a ramp, then efforts with an easy one between. */
function WorkoutProfile({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className={className}>
      <path d="M2 21 V16 L7 11 V21 Z" />
      <rect x="9" y="5" width="3.4" height="16" rx="0.8" />
      <rect x="14" y="13" width="2.2" height="8" rx="0.6" opacity=".55" />
      <rect x="17.5" y="5" width="3.4" height="16" rx="0.8" />
    </svg>
  );
}

const ICON: Record<Page, LucideIcon | typeof WorkoutProfile> = {
  tree: TreeDeciduous,
  garden: Sprout,
  body: HeartPulse,
  analysis: ChartSpline,
  segments: Mountain,
  rides: ActivityIcon,
  ride: ActivityIcon,
  calendar: CalendarDays,
  workouts: WorkoutProfile,
  plan: CalendarRange,
  pantry: Archive,
  years: CircleDot,
  settings: Settings,
  forest: Trees,
  legend: BookOpen,
  zones: Zap,
  recap: CalendarDays,
  programme: CalendarDays,
  save: Check,
};

/** What you last chose, shown on the bar for as long as you're on the page it opened. */
let asked: { q: string; path: string; search: string } | null = null;
const askedListeners = new Set<() => void>();
const setAsked = (next: typeof asked) => {
  asked = next;
  askedListeners.forEach((l) => l());
};
const useAsked = () =>
  useSyncExternalStore(
    (l) => {
      askedListeners.add(l);
      return () => askedListeners.delete(l);
    },
    () => asked,
  );

/** The moment of the day, from what the app knows anyway. Light enough for the bar: never the whole history. */
function useMoment(): Moment {
  const now = useNow();
  const today = isoDate(now);
  const enabled = hasSource();
  const { data: wellness } = useQuery({ ...wellnessQuery(14), enabled });
  const { data: recent } = useQuery({ ...activitiesQuery(2), enabled });
  const { data: events } = useQuery({ ...eventsQuery({ oldest: today, newest: today }), enabled });
  const [season] = useLocalStore<Season | null>(LAST_SEASON, readSetting<Season>(LAST_SEASON));
  const [wanted] = useLocalStore(CHECK_IN, true);
  const [state] = useCheckInState(today);
  const [seen, setSeen] = useLocalStore<string | null>(LAST_RIDE_SEEN, null);
  const path = useRouterState({ select: (s) => s.location.pathname });
  const opened = /^\/rides\/([^/]+)/.exec(path)?.[1];
  useEffect(() => {
    if (opened && opened !== seen) {
      setSeen(() => opened);
      writeSetting(LAST_RIDE_SEEN, opened);
    }
  }, [opened, seen, setSeen]);
  const ride =
    (recent ?? [])
      .filter((a) => a.start_date_local.slice(0, 10) === today)
      .sort((a, b) => b.start_date_local.localeCompare(a.start_date_local))[0] ?? null;
  return {
    season,
    checkInDue:
      wanted &&
      !!wellness &&
      (!isCheckedIn(wellness.find((w) => w.id === today)) || state === "typed") &&
      state !== "done" &&
      state !== "dismissed",
    ride,
    rideSeen: !!ride && ride.id === (opened ?? seen),
    planned: (events ?? []).some((e) => e.date === today && isPlanned(e)),
    hour: now.getHours(),
    weekday: now.getDay(),
  };
}

function useGo() {
  const navigate = useNavigate();
  return (dest: Dest) => {
    if (dest.kind === "legend") return openLegend(dest.term, dest.tab);
    if (dest.kind !== "route") return;
    void navigate({ to: dest.to, search: dest.search ?? {}, params: dest.params ?? {} } as never);
  };
}

const pathOf = (dest: Dest) =>
  dest.kind === "route"
    ? Object.entries(dest.params ?? {}).reduce((p, [k, v]) => p.replace(`$${k}`, v), dest.to)
    : null;

function Door({
  label,
  icon: Icon,
  on,
  onClick,
}: {
  label: string;
  icon: LucideIcon;
  on: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      aria-current={on ? "page" : undefined}
      className={cn(
        "flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground",
        on && "bg-secondary text-primary hover:text-primary",
      )}
    >
      <Icon className="h-5 w-5" />
    </button>
  );
}

/** The legend's own creatures, drawn as they are on the tree. */
const LEGEND_ART: Record<string, ReactNode> = {
  "legend-owl": (
    <svg viewBox="-8 -20 16 21" width={20} height={26} aria-hidden>
      <Owl x={0} y={0} />
    </svg>
  ),
  "legend-squirrel": (
    <svg viewBox="-11.5 -20 23 21" width={26} height={24} aria-hidden>
      <Squirrel x={0} y={0} side={1} />
    </svg>
  ),
  "legend-birds": (
    <svg viewBox="-9 -14 19 15" width={25} height={20} aria-hidden>
      <Bird x={0} y={0} side={1} />
    </svg>
  ),
};

function Tile({ e }: { e: Entry }) {
  const Icon = ICON[e.page];
  const color =
    e.kind === "ride" ? "var(--pine)" : e.kind === "perf" ? "var(--fitness)" : "var(--primary)";
  return (
    <span
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
      style={{ background: `color-mix(in oklab, ${color} 22%, transparent)`, color }}
    >
      {LEGEND_ART[e.id] ?? <Icon className="h-4 w-4" />}
    </span>
  );
}

/** What you typed, picked out in the accent. */
function Marked({ text, query }: { text: string; query: string }) {
  const q = norm(query).trim();
  const i = q ? norm(text).indexOf(q) : -1;
  if (i < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, i)}
      <span className="text-primary">{text.slice(i, i + q.length)}</span>
      {text.slice(i + q.length)}
    </>
  );
}

function All({
  garden,
  onClose,
  onGo,
}: {
  garden: boolean;
  onClose: () => void;
  onGo: (p: ListPage) => void;
}) {
  return (
    <div className="max-h-[85dvh] overflow-y-auto rounded-t-2xl border border-border bg-card p-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))] shadow-lg lg:max-h-[80vh] lg:rounded-2xl lg:pb-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">{t("All", "Tutto")}</h2>
        <button
          onClick={onClose}
          aria-label={t("Back", "Indietro")}
          className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      {INDEX.map(({ when, pages }) => (
        <div key={when()} className="mt-3">
          <div className="eyebrow mb-1.5">{when()}</div>
          <div className="grid grid-cols-3 gap-2">
            {pages
              .filter((p) => garden || !gardenPage(p))
              .map((p) => {
                const Icon = ICON[p];
                return (
                  <button
                    key={p}
                    onClick={() => onGo(p)}
                    className="flex flex-col items-center gap-1.5 rounded-xl bg-secondary py-3 text-sm"
                  >
                    <Icon className="h-5 w-5" />
                    {PAGE_LABEL[p]()}
                  </button>
                );
              })}
          </div>
        </div>
      ))}
    </div>
  );
}

/** How far the on-screen keyboard reaches up the window, so the field can sit on top of it. */
function useKeyboardInset(on: boolean) {
  const [inset, setInset] = useState(0);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!on || !vv) return;
    const measure = () =>
      setInset(Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop)));
    measure();
    vv.addEventListener("resize", measure);
    vv.addEventListener("scroll", measure);
    return () => {
      vv.removeEventListener("resize", measure);
      vv.removeEventListener("scroll", measure);
    };
  }, [on]);
  return inset;
}

/** The forests you're in: the last ones this device saw at once, then live. Firestore loads only when someone asks. */
function useForestNames(typed: boolean) {
  const [list, setList] = useState<{ id: string; name: string; members: string[] }[]>([]);
  const [names, setNames] = useState<Record<string, { uid: string; name: string }[]>>({});
  useEffect(() => {
    let stop: (() => void) | undefined;
    let gone = false;
    void idbGet<{
      forests?: { id: string; name: string; members: string[] }[];
      live?: Record<string, { members?: { uid: string; name: string }[] }>;
    }>(`forest-view:${uid()}`)
      .then((v) => {
        if (gone) return;
        if (v?.forests) setList(v.forests);
        if (v?.live)
          setNames(
            Object.fromEntries(
              Object.entries(v.live).flatMap(([fid, l]) => (l.members ? [[fid, l.members]] : [])),
            ),
          );
      })
      .catch(() => {});
    void import("@/lib/forest/forests")
      .then((m) => {
        // Offline, Firestore can report "none" from an empty cache: that mustn't wipe what this device last saw.
        if (!gone)
          stop = m.watchMyForests(
            (found) => void (found.length && setList(found)),
            () => {},
          );
      })
      .catch(() => {});
    return () => {
      gone = true;
      stop?.();
    };
  }, []);
  // Who's in them is read once, and only for someone typing a name.
  const asked = useRef(new Set<string>());
  useEffect(() => {
    if (!typed) return;
    for (const f of list) {
      if (asked.current.has(f.id)) continue;
      asked.current.add(f.id);
      void import("@/lib/forest/forests")
        .then((m) => m.readMembers(f.id))
        .then((found) => setNames((n) => ({ ...n, [f.id]: found })))
        .catch(() => {});
    }
  }, [typed, list]);
  return useMemo(() => {
    const me = uid();
    return {
      forests: list.map((f) => ({ id: f.id, name: f.name, trees: f.members.length })),
      members: list.flatMap((f): AskMember[] =>
        (names[f.id] ?? []).flatMap((m) =>
          m.uid !== me && m.name ? [{ fid: f.id, forest: f.name, uid: m.uid, name: m.name }] : [],
        ),
      ),
    };
  }, [list, names]);
}

/** Only exists while the panel is open, so everything it loads is loaded only for someone asking. */
function AskBody({
  moment,
  garden,
  onAll,
  onChoose,
}: {
  moment: Moment;
  garden: boolean;
  onAll: () => void;
  onChoose: (e: Entry) => void;
}) {
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const listId = useId();
  useEffect(() => input.current?.focus(), []);
  const today = isoDate(new Date());
  const sport = mainSport();
  const runs = sport === "run" || analysisBoth();
  const enabled = hasSource();
  const { data: acts } = useQuery({ ...allActivitiesQuery(), enabled });
  const { data: wellness } = useQuery({ ...wellnessQuery(90), enabled });
  const { data: races } = useQuery({ ...racesQuery(today), enabled });
  const { data: events } = useQuery({
    ...eventsQuery({ oldest: today, newest: addDays(today, 90) }),
    enabled,
  });
  const { data: rideZones } = useQuery({
    ...rideZonesQuery("ride"),
    enabled: enabled && sport !== "run",
  });
  const { data: runZones } = useQuery({ ...rideZonesQuery("run"), enabled: enabled && runs });
  const { data: thresholds } = useQuery({ ...thresholdsQuery(sport), enabled });
  const { data: curves } = useQuery({ ...powerCurvesQuery(), enabled: enabled && sport !== "run" });
  const { data: offEvents } = useQuery({
    ...offEventsQuery({ oldest: addDays(today, -90), newest: today }),
    enabled,
  });
  const period = useMemo(
    () => (sport === "run" ? null : powerPeriodAsked(q, today)),
    [q, today, sport],
  );
  const range = useQuery({
    ...powerCurveRangeQuery(period?.from ?? "", period?.to ?? ""),
    enabled: enabled && !!period,
  });
  const rangeCurve = useMemo(
    () =>
      period && (range.data !== undefined || range.isError)
        ? { ...period, curve: range.data ?? null, ...(range.isError ? { failed: true } : {}) }
        : undefined,
    [period, range.data, range.isError],
  );
  const qc = useQueryClient();
  const suggest = useSuggestInput();
  const zones = sport === "run" ? runZones : rideZones;
  const [checkIn] = useLocalStore(CHECK_IN, true);
  const lib = useSegmentLibrary({ sync: false });
  const nameOf = useSegmentNames(lib.list);
  const { forests, members } = useForestNames(q.trim().length >= 3);
  const data: AskData = useMemo(
    () => ({
      today,
      garden,
      acts,
      wellness,
      races,
      events,
      forests,
      climbs: lib.list.map((c) => ({
        id: c.id,
        name: nameOf(c),
        length: c.length,
        gain: c.gain,
        rides: c.rides,
        saved: c.saved,
      })),
      params: {
        sport,
        runs,
        rideZones,
        runZones,
        thresholds,
        runThreshold: knownRunThreshold(),
        paceTops: zoneTops().pace,
        curves,
        wellness,
      },
    }),
    [
      today,
      garden,
      acts,
      wellness,
      races,
      events,
      forests,
      lib.list,
      nameOf,
      sport,
      runs,
      rideZones,
      runZones,
      thresholds,
      curves,
    ],
  );
  const crown = useMemo(
    () => (wellness && acts ? crownFor(wellness, acts, today, offEvents ?? [], checkIn) : null),
    [wellness, acts, today, offEvents, checkIn],
  );
  const entries = useMemo(
    () => [
      ...allEntries(data),
      ...liveEntries({
        today,
        sport,
        checkIn,
        acts,
        wellness,
        score: crown?.score,
        form: crown?.form,
        zones,
        threshold: knownRunThreshold(),
        pacePct: zoneTops().pace,
        planned: events,
        races,
        suggest,
      }),
    ],
    [data, today, sport, checkIn, acts, wellness, crown, zones, events, races, suggest],
  );
  // What the commands read: passes on each climb, and the running analysis only if it's already been done.
  const intentData: IntentData = useMemo(
    () => ({
      today,
      sport,
      native: sourceKind() === "native",
      acts,
      curves,
      rangeCurve,
      offEvents,
      events,
      suggest,
      ftp: rideZones?.ftp ?? null,
      weight: latestWeight(wellness),
      runThreshold: knownRunThreshold(),
      runs: qc
        .getQueryData<RunData>(runDataQuery().queryKey)
        ?.runs.map((r) => ({ id: r.a.id, bests: r.s.bests, date: r.date, curve: r.s.paceCurve })),
      climbs: lib.list.map((c) => ({
        id: c.id,
        name: nameOf(c),
        length: c.length,
        saved: c.saved,
        attempts: attemptsIn(lib.efforts[c.effortsKey], sport),
      })),
    }),
    [
      today,
      sport,
      acts,
      curves,
      rangeCurve,
      offEvents,
      events,
      qc,
      lib.list,
      lib.efforts,
      nameOf,
      rideZones,
      wellness,
      suggest,
    ],
  );
  const typed = q.trim().length > 0;
  // A value as it was: the days it needs are read when the question is complete.
  const pastAsk = useMemo(() => {
    const d = { today, acts, climbs: intentData.climbs };
    return pastAsked(q, d) ?? pastAsked(simplify(q), d);
  }, [q, today, acts, intentData.climbs]);
  const pastSpan = pastAsk ? pastWindow(pastAsk) : null;
  const pastDays = useQuery({
    ...wellnessRangeQuery({ oldest: pastSpan?.from ?? "", newest: pastSpan?.to ?? "" }),
    enabled: enabled && !!pastSpan,
  });
  const past = useMemo(
    () => ({
      today,
      acts,
      climbs: intentData.climbs,
      wellness: pastDays.data,
      failed: pastDays.isError,
    }),
    [today, acts, intentData.climbs, pastDays.data, pastDays.isError],
  );
  // Someone's tree is read when a name comes with a word for what's wanted, not while the name is being typed.
  const askedMembers = useMemo(() => membersAsked(q, members), [q, members]);
  const memberTrees = useQueries({
    queries: askedMembers.map((m) => ({
      // The same entry their tree's page reads and keeps.
      queryKey: ["forest-tree", m.fid, m.uid],
      queryFn: async () => (await import("@/lib/forest/trees")).readTree(m.fid, m.uid),
      staleTime: 15 * 60_000,
    })),
  });
  const trees: MemberTrees = Object.fromEntries(
    askedMembers.map((m, i) => [
      treeKey(m),
      memberTrees[i]?.isError ? null : (memberTrees[i]?.data as MemberTree | null | undefined),
    ]),
  );
  const treesKey = memberTrees.map((r) => r.dataUpdatedAt).join();
  const found = useMemo(() => {
    const among = (text: string) =>
      alternatives(text, moment.season, [
        ...hintRows(text),
        ...pastRows(text, past),
        ...memberRows(text, members, trees, today),
        ...intentEntries(text, { ...intentData, lastSaved: lastSaved() }),
        ...whenEntries(text, today).filter((e) => e.exact),
        ...(moment.ride ? [todayRideEntry(moment.ride)] : []),
        ...entries,
      ]);
    const literal = among(q);
    if (literal.length) return literal;
    // A sentence gets a second reading, for what it comes down to.
    const said = simplify(q);
    const reading =
      said && said !== q.trim().toLowerCase()
        ? among(said)
            // Only reading: nothing is ever saved from a sentence.
            .filter((e) => e.dest.kind !== "write")
            .map((e) => ({ ...e, ghost: null }))
        : literal;
    if (reading.length) return reading;
    // Then one slip on the command word; only here, so a word that means something else keeps its meaning.
    const fixed = correctCommand(q);
    return fixed ? among(fixed).map((e) => ({ ...e, ghost: null })) : reading;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `trees` changes with `treesKey`.
  }, [q, today, moment.season, moment.ride, entries, intentData, past, members, treesKey]);
  const now = useMemo(() => nowEntries(moment, entries), [moment, entries]);
  const nothing = typed && !found.length;
  const explained = useMemo(
    () => (nothing ? explainRows(q, intentData) : []),
    [nothing, q, intentData],
  );
  const maybe = nothing ? entries.filter((e) => e.id === "planned" || e.id === "today") : [];
  const list: Entry[] = typed ? (nothing ? (explained.length ? explained : maybe) : found) : now;
  const ghost = typed ? (found[0]?.ghost ?? null) : null;

  useEffect(() => setActive(0), [q]);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, list.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter" && list[active]) {
      e.preventDefault();
      onChoose(list[active]);
    } else if (e.key === "Tab" && ghost && !e.shiftKey) {
      e.preventDefault();
      setQ(q.trimEnd() + ghost);
    }
  };

  return (
    // The field first for the reader, but on a phone it sits at the bottom: the best answer stays by the thumb.
    <div className="flex flex-col-reverse gap-2 lg:flex-col">
      <div className={PILL}>
        <div className="flex h-11 min-w-0 flex-1 items-center gap-2 pl-3 pr-1">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="relative min-w-0 flex-1">
            {!q && (
              <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center text-muted-foreground">
                {t("Ask the tree…", "Chiedi all'albero…")}
              </span>
            )}
            {q && ghost && (
              <span
                className="pointer-events-none absolute inset-y-0 left-0 flex items-center overflow-hidden whitespace-pre"
                aria-hidden
              >
                <span className="invisible">{q.trimEnd()}</span>
                <span className="text-muted-foreground/70">{ghost}</span>
              </span>
            )}
            <input
              ref={input}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={onKey}
              role="combobox"
              aria-expanded={list.length > 0}
              aria-controls={listId}
              aria-activedescendant={list[active] ? `${listId}-${active}` : undefined}
              aria-label={t("Ask the tree", "Chiedi all'albero")}
              enterKeyHint="go"
              autoCapitalize="none"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              className="relative w-full bg-transparent text-base text-foreground outline-none"
            />
          </div>
        </div>
        <button
          onClick={onAll}
          className="flex min-h-11 shrink-0 items-center rounded-full px-3 text-sm text-muted-foreground hover:text-foreground"
        >
          {t("All", "Tutto")}
        </button>
      </div>
      <div
        className={cn(
          "rounded-xl border border-border bg-card p-1 shadow-lg",
          !list.length && "hidden",
        )}
      >
        {nothing && !explained.length && (
          <div role="status" className="px-3 pb-1 pt-2 text-sm text-muted-foreground">
            {t("I don't know that yet. Maybe:", "Non lo so ancora. Forse:")}
          </div>
        )}
        <div id={listId} role="listbox" className="flex flex-col-reverse lg:flex-col">
          {list.map((e, i) => {
            const answer = spanAnswer(e, data);
            return (
              <button
                key={e.id}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                tabIndex={-1}
                onClick={() => onChoose(e)}
                onMouseEnter={() => setActive(i)}
                className={cn(
                  "flex min-h-12 w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors",
                  i === active && typed ? "bg-secondary" : "hover:bg-secondary",
                )}
              >
                <Tile e={e} />
                <span className="min-w-0 flex-1">
                  <span className="block font-medium leading-snug">
                    <Marked text={e.q} query={typed && !nothing ? q : ""} />
                  </span>
                  {answer && (
                    <span className="mt-0.5 line-clamp-2 text-xs leading-snug text-muted-foreground">
                      {answer}
                    </span>
                  )}
                </span>
                {e.id.startsWith("note-") ? null : e.value ? (
                  <span className="stat-num shrink-0 text-sm font-semibold">{e.value}</span>
                ) : (
                  <span className={cn("eyebrow shrink-0", e.page === "save" && "text-primary")}>
                    {PAGE_LABEL[e.page]()}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

const latestWeight = (rows: Wellness[] | undefined) =>
  [...(rows ?? [])].sort((a, b) => b.id.localeCompare(a.id)).find((w) => w.weight)?.weight ?? null;

/** Runs what a row said it would, then says so with a way back. */
async function saveAndOfferUndo(action: WriteAction, what: string, qc: QueryClient) {
  if (action.kind === "undo") {
    try {
      await undoLast();
      toast.success(t("Undone", "Annullato"));
    } catch {
      toast.error(t("Couldn't undo", "Impossibile annullare"));
    }
    return;
  }
  try {
    const done = await runWrite(action, qc);
    const undo = rememberUndo(what, done.undo);
    toast.success(
      done.queued
        ? t(`${what}: sent when back online`, `${what}: partirà appena torni online`)
        : what,
      {
        action: {
          label: t("Undo", "Annulla"),
          onClick: () =>
            void undo().catch(() => toast.error(t("Couldn't undo", "Impossibile annullare"))),
        },
      },
    );
  } catch {
    toast.error(t("Couldn't save", "Impossibile salvare"));
  }
}

function Asker({
  open,
  onOpenChange,
  moment,
  garden,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  moment: Moment;
  garden: boolean;
}) {
  const [all, setAll] = useState(false);
  const go = useGo();
  const inset = useKeyboardInset(open);

  useEffect(() => {
    if (!open) setAll(false);
  }, [open]);

  const qc = useQueryClient();
  const choose = (e: Entry) => {
    if (e.dest.kind === "stay") return;
    onOpenChange(false);
    if (e.dest.kind === "write") return void saveAndOfferUndo(e.dest.action, e.q, qc);
    const path = pathOf(e.dest);
    setAsked(
      path && e.dest.kind === "route"
        ? { q: e.q, path, search: JSON.stringify(e.dest.search ?? {}) }
        : null,
    );
    go(e.dest);
  };
  const goPage = (p: ListPage) => {
    onOpenChange(false);
    setAsked(null);
    go(PAGE_DEST[p]);
  };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          onOpenAutoFocus={(e) => e.preventDefault()}
          className={cn(
            "fixed z-50 outline-none",
            all
              ? "inset-x-0 bottom-0 lg:inset-x-auto lg:bottom-auto lg:right-[calc(50%-496px)] lg:top-2 lg:w-[480px]"
              : "inset-x-2 lg:inset-x-auto lg:right-[calc(50%-496px)] lg:top-2 lg:bottom-auto! lg:w-[480px]",
          )}
          style={
            all
              ? undefined
              : {
                  bottom: `calc(${inset}px + 0.5rem + ${inset ? "0px" : "env(safe-area-inset-bottom)"})`,
                }
          }
        >
          <DialogPrimitive.Title className="sr-only">
            {t("Ask the tree", "Chiedi all'albero")}
          </DialogPrimitive.Title>
          {all ? (
            <All garden={garden} onClose={() => setAll(false)} onGo={goPage} />
          ) : (
            <AskBody moment={moment} garden={garden} onAll={() => setAll(true)} onChoose={choose} />
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/** The bar and what it opens; one on the phone at the window's foot, one on a desktop in the header. */
export function AskNav({ desktop = false }: { desktop?: boolean }) {
  const [open, setOpen] = useState(false);
  const moment = useMoment();
  const [garden] = useLocalStore(GARDEN, gardenOn());
  const location = useRouterState({ select: (s) => s.location });
  const shown = useAsked();
  const go = useGo();
  const path = location.pathname.replace(/\/$/, "") || "/";
  const zoomed = "zoom" in (location.search as Record<string, unknown>);
  const treeOn = (path === "/" && !zoomed) || /^\/forest(\/|$)/.test(path);
  const gardenIsOn = path === "/garden" && !zoomed;
  const here =
    shown && shown.path === path && shown.search === JSON.stringify(location.search)
      ? shown.q
      : null;

  // On a desktop, "/" starts typing from anywhere but a field.
  useEffect(() => {
    if (!desktop) return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable) return;
      e.preventDefault();
      setOpen(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [desktop]);

  return (
    <>
      <div className={PILL} style={desktop && open ? { visibility: "hidden" } : undefined}>
        <Door
          label={PAGE_LABEL.tree()}
          icon={TreeDeciduous}
          on={treeOn}
          onClick={() => {
            setAsked(null);
            go(PAGE_DEST.tree);
          }}
        />
        <button
          onClick={() => setOpen(true)}
          aria-label={t("Ask the tree", "Chiedi all'albero")}
          aria-haspopup="dialog"
          className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-full px-2 text-left"
        >
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="truncate text-sm text-foreground">{here ?? barText(moment)}</span>
        </button>
        {garden && (
          <Door
            label={PAGE_LABEL.garden()}
            icon={Sprout}
            on={gardenIsOn}
            onClick={() => {
              setAsked(null);
              go(PAGE_DEST.garden);
            }}
          />
        )}
      </div>
      <Asker open={open} onOpenChange={setOpen} moment={moment} garden={garden} />
    </>
  );
}
