import { Link } from "@tanstack/react-router";
import { parseISO } from "date-fns";
import { ArrowLeft, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { GradientProfile, gradientLines } from "@/components/GradientProfile";
import { RouteMap } from "@/components/RouteMap";
import { Panel, StatCard } from "@/components/StatCard";
import { Button } from "@/components/ui/button";
import { auth } from "@/lib/firebase";
import type { Forest, Member } from "@/lib/forest/forests";
import type { ForestClimb, ForestTime } from "@/lib/forest/leaderboard";
import { format, t } from "@/lib/i18n";
import { gradeChunks, maxGrade } from "@/lib/profile";
import { formatClock } from "@/lib/training";
import { cn } from "@/lib/utils";

/** A forest climb's page: like one's own climb page, with the forest's leaderboard instead of one's efforts. */
export function ForestClimbView({
  fid,
  sid,
  forest,
  climb,
  members,
  times,
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
  const trace = climb?.trace ?? null;
  const lines = useMemo(() => (trace ? gradientLines(trace) : []), [trace]);
  const steepest = useMemo(
    () => (trace ? maxGrade(gradeChunks(trace.dist, trace.alt)) : null),
    [trace],
  );
  const names = new Map(members.map((m) => [m.uid, m.name]));
  const me = auth.currentUser?.uid;
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
        <Panel title={t("Route", "Percorso")}>
          <div className="space-y-3">
            <RouteMap
              fitKey={sid}
              lines={lines}
              pins={[
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
              ]}
              cursor={hover != null ? { lat: trace.lat[hover]!, lng: trace.lng[hover]! } : null}
            />
            <GradientProfile dist={trace.dist} alt={trace.alt} hover={hover} onHover={setHover} />
          </div>
        </Panel>
      )}

      <Panel title={t("Leaderboard", "Classifica")}>
        <Leaderboard times={times} names={names} me={me} />
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

/** Everyone's best time from the rides they share here, fastest first; mine highlighted. */
function Leaderboard({
  times,
  names,
  me,
}: {
  times: ForestTime[];
  names: Map<string, string>;
  me: string | undefined;
}) {
  if (!times.length)
    return (
      <p className="py-4 text-center text-sm text-muted-foreground">
        {t(
          "No times yet: they appear once members' apps find an effort in a ride they share here.",
          "Ancora nessun tempo: compaiono quando l'app dei membri trova un passaggio in un'uscita condivisa qui.",
        )}
      </p>
    );
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
        const cls = cn("flex items-center gap-3 px-4 py-3", x.uid === me && "bg-primary/5");
        return (
          <li key={x.uid}>
            {/* My own time opens my ride; friends' rides stay theirs. */}
            {x.uid === me ? (
              <Link
                to="/rides/$id"
                params={{ id: x.rideId }}
                className={cn(cls, "hover:bg-secondary/40")}
              >
                {row}
              </Link>
            ) : (
              <div className={cls}>{row}</div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
