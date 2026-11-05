import { Link } from "@tanstack/react-router";
import { parseISO } from "date-fns";
import { ArrowLeft, Swords, Trash2 } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { RaceReplay } from "@/components/GhostRace";
import { GradientProfile, gradientLines } from "@/components/GradientProfile";
import { RouteMap, type MapLine, type MapPin } from "@/components/RouteMap";
import { Panel, StatCard } from "@/components/StatCard";
import { Button } from "@/components/ui/button";
import { auth } from "@/lib/firebase";
import { forestSport, type Forest, type Member } from "@/lib/forest/forests";
import { racePair, type ForestClimb, type ForestTime } from "@/lib/forest/leaderboard";
import { RIDE_PAGE_DAYS } from "@/lib/forest/rides";
import { splitsOnTrace } from "@/lib/ghost";
import { format, t } from "@/lib/i18n";
import { gradeChunks, maxGrade } from "@/lib/profile";
import type { Trace } from "@/lib/segments";
import { addDays, formatClock, isoDate } from "@/lib/training";
import { cn } from "@/lib/utils";
import { sportWords } from "@/lib/sport";

/** A forest climb's page: like one's own climb page, with the forest's leaderboard instead of one's efforts. */
export function ForestClimbView({
  fid,
  sid,
  forest,
  climb,
  members,
  times: allTimes,
  onRemove,
}: {
  fid: string;
  sid: string;
  forest: Forest | null;
  climb: ForestClimb | null | undefined;
  members: Member[];
  times: ForestTime[];
  onRemove: () => void;
}) {
  const [hover, setHover] = useState<number | null>(null);
  // The board is the forest's sport; until a member's app has republished, an older time of the other may be there.
  const sport = forest ? forestSport(forest) : "ride";
  const w = sportWords(sport);
  const times = useMemo(
    () => allTimes.filter((x) => (x.sport ?? "ride") === sport),
    [allTimes, sport],
  );
  const trace = climb?.trace ?? null;
  const lines = useMemo(() => (trace ? gradientLines(trace) : []), [trace]);
  const steepest = useMemo(
    () => (trace ? maxGrade(gradeChunks(trace.dist, trace.alt)) : null),
    [trace],
  );
  const names = new Map(members.map((m) => [m.uid, m.name]));
  const me = auth.currentUser?.uid;
  // Race: two of the board's times, for those published with their pacing. `n` restarts it on a new pick.
  const [race, setRace] = useState<{ a: string; b: string; n: number } | null>(null);
  const routeRef = useRef<HTMLDivElement>(null);
  const racers = useMemo(() => (trace ? times.filter((x) => x.splits) : []), [times, trace]);
  const raceable = racers.length > 1;
  // A rider who leaves the board mid-race ends it.
  const liveRace =
    race && racers.some((x) => x.uid === race.a) && racers.some((x) => x.uid === race.b)
      ? race
      : null;
  const startRace = (picked?: string) => {
    const pair = racePair(
      racers.map((x) => x.uid),
      me,
      picked,
    );
    if (!pair) return;
    setRace({ ...pair, n: Date.now() });
    routeRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const back = (
    <Link
      to="/forest/$fid"
      params={{ fid }}
      search={{ tab: "climbs" }}
      className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft className="h-4 w-4" /> {forest?.name ?? t("Forest", "Bosco")}
    </Link>
  );

  if (climb === undefined) return back;
  if (climb === null)
    return (
      <div className="space-y-4">
        {back}
        <p className="text-sm text-muted-foreground">
          {t("This climb is no longer in the forest.", "Questa salita non è più nel bosco.")}
        </p>
      </div>
    );
  const record = times[0];
  const canRemove = climb.addedBy === me || forest?.createdBy === me;

  return (
    <div className="space-y-6">
      {back}
      <div>
        <div className="eyebrow">
          {t("Forest climb", "Salita del bosco")}
          {names.get(climb.addedBy) &&
            t(
              ` · added by ${names.get(climb.addedBy)}`,
              ` · aggiunta da ${names.get(climb.addedBy)}`,
            )}
        </div>
        <h1 className="text-3xl font-bold tracking-tight">{climb.name}</h1>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard
          label={t("Length", "Lunghezza")}
          value={(climb.length / 1000).toFixed(2)}
          unit="km"
        />
        <StatCard
          label={t("Avg grade", "Pendenza media")}
          value={climb.grade != null ? climb.grade.toFixed(1) : "–"}
          unit="%"
          hint={
            steepest != null
              ? t(`max ${steepest.toFixed(1)}% over 100 m`, `max ${steepest.toFixed(1)}% su 100 m`)
              : undefined
          }
        />
        <StatCard
          label={t("Climbing", "Dislivello")}
          value={climb.gain != null ? Math.round(climb.gain) : "–"}
          unit="m"
          hint={
            trace
              ? t(
                  `top at ${Math.round(Math.max(...trace.alt))} m`,
                  `in cima a ${Math.round(Math.max(...trace.alt))} m`,
                )
              : undefined
          }
        />
        <StatCard
          label={t("Forest record", "Record del bosco")}
          tone="form"
          value={record ? formatClock(record.duration) : "–"}
          hint={
            record
              ? `${names.get(record.uid) ?? "…"} · ${format(parseISO(record.date), "d MMM yyyy")}`
              : undefined
          }
        />
      </div>

      {trace && (
        <div ref={routeRef} className="scroll-mt-20">
          <Panel
            title={t("Route", "Percorso")}
            action={
              !liveRace && raceable ? (
                <Button size="sm" variant="secondary" onClick={() => startRace()}>
                  <Swords /> {t("Race", "Sfida")}
                </Button>
              ) : undefined
            }
          >
            {liveRace ? (
              <ForestRace
                key={liveRace.n}
                racers={racers}
                initialA={liveRace.a}
                initialB={liveRace.b}
                names={names}
                me={me}
                trace={trace}
                lines={lines}
                pins={pins(trace)}
                onClose={() => setRace(null)}
              />
            ) : (
              <div className="space-y-3">
                <RouteMap
                  fitKey={sid}
                  lines={lines}
                  pins={pins(trace)}
                  cursor={hover != null ? { lat: trace.lat[hover]!, lng: trace.lng[hover]! } : null}
                />
                <GradientProfile
                  dist={trace.dist}
                  alt={trace.alt}
                  hover={hover}
                  onHover={setHover}
                />
              </div>
            )}
          </Panel>
        </div>
      )}

      <Panel title={t("Leaderboard", "Classifica")}>
        <Leaderboard
          fid={fid}
          sid={sid}
          times={times}
          names={names}
          me={me}
          onRace={raceable ? startRace : undefined}
        />
        {trace && times.length > 1 && racers.length < times.length && (
          <p className="pt-3 text-xs text-muted-foreground">
            {t(
              `A time can be raced once its owner opens the updated app with that ${w.ride} still on their device.`,
              `Un tempo si può sfidare quando chi l'ha registrato apre l'app aggiornata con ${sport === "run" ? "quella corsa" : "quell'uscita"} ancora sul dispositivo.`,
            )}
          </p>
        )}
      </Panel>

      {canRemove && (
        <div className="flex justify-end">
          <Button variant="ghost" onClick={onRemove}>
            <Trash2 /> {t("Remove from the forest", "Togli dal bosco")}
          </Button>
        </div>
      )}
    </div>
  );
}

const pins = (trace: Trace): MapPin[] => [
  {
    lat: trace.lat[0]!,
    lng: trace.lng[0]!,
    color: "var(--pine)",
    label: t("Start", "Partenza"),
  },
  {
    lat: trace.lat.at(-1)!,
    lng: trace.lng.at(-1)!,
    color: "var(--lingon)",
    label: t("Finish", "Arrivo"),
  },
];

/** Two members' best times replayed on the climb's route, from the pacing each one published. */
function ForestRace({
  racers,
  initialA,
  initialB,
  names,
  me,
  trace,
  lines,
  pins,
  onClose,
}: {
  racers: ForestTime[];
  initialA: string;
  initialB: string;
  names: Map<string, string>;
  me: string | undefined;
  trace: Trace;
  lines: MapLine[];
  pins: MapPin[];
  onClose: () => void;
}) {
  const [aKey, setAKey] = useState(initialA);
  const [bKey, setBKey] = useState(initialB);
  const series = useMemo(
    () =>
      new Map(racers.flatMap((x) => (x.splits ? [[x.uid, splitsOnTrace(x.splits, trace)]] : []))),
    [racers, trace],
  );
  return (
    <RaceReplay
      a={series.get(aKey) ?? null}
      b={series.get(bKey) ?? null}
      aKey={aKey}
      bKey={bKey}
      onPickA={setAKey}
      onPickB={setBKey}
      options={racers.map((x) => ({
        key: x.uid,
        label: `${names.get(x.uid) ?? "…"}${x.uid === me ? ` ${t("(you)", "(tu)")}` : ""} · ${formatClock(x.duration)}`,
      }))}
      trace={trace}
      lines={lines}
      pins={pins}
      onClose={onClose}
    />
  );
}

/**
 * Everyone's best time from the rides they share here, fastest first; mine highlighted. Each opens its ride: mine my
 * own ride page, a friend's the page they share with the forest (published for the last year's rides only).
 */
function Leaderboard({
  fid,
  sid,
  times,
  names,
  me,
  onRace,
}: {
  fid: string;
  sid: string;
  times: ForestTime[];
  names: Map<string, string>;
  me: string | undefined;
  /** Race this member's time; missing while fewer than two times can be raced. */
  onRace: ((uid: string) => void) | undefined;
}) {
  if (!times.length)
    return (
      <p className="py-4 text-center text-sm text-muted-foreground">
        {t(
          "No times yet: they appear once members' apps find an effort in an activity they share here.",
          "Ancora nessun tempo: compaiono quando l'app dei membri trova un passaggio in un'attività condivisa qui.",
        )}
      </p>
    );
  const since = addDays(isoDate(new Date()), -RIDE_PAGE_DAYS);
  return (
    <ol className="-mx-4 divide-y divide-border">
      {times.map((x, i) => {
        const row = (
          <>
            <span
              className={cn(
                "stat-num flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs",
                i === 0 ? "bg-birch font-semibold text-background" : "text-muted-foreground",
              )}
            >
              {i + 1}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm">
                {names.get(x.uid) ?? "…"}
                {x.uid === me && (
                  <span className="ml-1.5 text-xs text-muted-foreground">{t("(you)", "(tu)")}</span>
                )}
              </span>
              <span className="block text-xs text-muted-foreground">
                {format(parseISO(x.date), "d MMM yyyy")}
                {x.avgWatts != null && ` · ${x.avgWatts} W`}
              </span>
            </span>
            <span className="stat-num shrink-0 text-right">
              <span className="block text-base font-semibold">{formatClock(x.duration)}</span>
              {i > 0 && (
                <span className="block text-xs text-muted-foreground">
                  +{formatClock(x.duration - times[0]!.duration)}
                </span>
              )}
            </span>
          </>
        );
        const cls = "flex min-w-0 flex-1 items-center gap-3 px-4 py-3";
        const link = cn(cls, "hover:bg-secondary/40");
        return (
          <li key={x.uid} className={cn("flex items-center", x.uid === me && "bg-primary/5")}>
            {x.uid === me ? (
              <Link to="/rides/$id" params={{ id: x.rideId }} className={link}>
                {row}
              </Link>
            ) : x.date.slice(0, 10) >= since ? (
              <Link
                to="/forest/$fid/$uid/ride/$rid"
                params={{ fid, uid: x.uid, rid: x.rideId }}
                search={{ climb: sid }}
                className={link}
              >
                {row}
              </Link>
            ) : (
              <div className={cls}>{row}</div>
            )}
            {onRace &&
              (x.splits ? (
                <button
                  aria-label={t(
                    `Race ${names.get(x.uid) ?? ""}`.trim(),
                    `Sfida ${names.get(x.uid) ?? ""}`.trim(),
                  )}
                  onClick={() => onRace(x.uid)}
                  className="mr-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground active:bg-secondary/60"
                >
                  <Swords className="h-5 w-5" />
                </button>
              ) : (
                <span className="mr-2 w-11 shrink-0" />
              ))}
          </li>
        );
      })}
    </ol>
  );
}
