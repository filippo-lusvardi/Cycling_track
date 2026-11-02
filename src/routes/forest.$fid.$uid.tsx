import { createFileRoute, Link } from "@tanstack/react-router";
import { parseISO } from "date-fns";
import { ArrowLeft } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { ResponsiveDialog } from "@/components/ResponsiveDialog";
import { CrownView } from "@/components/tree/Crown";
import { TreeBody, useWidth } from "@/components/tree/TreeBody";
import type { Sheet } from "@/components/tree/TreeSheets";
import { watchMembers, type Member } from "@/lib/forest/forests";
import { fromSnapshot } from "@/lib/forest/snapshot";
import { readTree } from "@/lib/forest/trees";
import { format, t } from "@/lib/i18n";
import type { Activity } from "@/lib/intervals";
import { addDays, formatDuration, formatKm, isoDate } from "@/lib/training";
import { buildDays, offDays, WEATHER_WORD, type Crown } from "@/lib/tree";

export const Route = createFileRoute("/forest/$fid/$uid")({
  head: () => ({ meta: [{ title: t("Forest — Cirmolo", "Bosco — Cirmolo") }] }),
  component: MemberTree,
});

type Loaded = ReturnType<typeof fromSnapshot> & { day: string };

/** A member's tree as they share it with this forest: the rides they show, their trunk and today's crown. */
function MemberTree() {
  const { fid, uid } = Route.useParams();
  const [members, setMembers] = useState<Member[]>([]);
  const [tree, setTree] = useState<Loaded | null | undefined>(undefined);
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [ref, w] = useWidth();
  useEffect(() => watchMembers(fid, setMembers), [fid]);
  useEffect(() => {
    void readTree(fid, uid).then(
      (r) => setTree(r ? { ...fromSnapshot(r.header, r.years), day: r.header.day } : null),
      () => setTree(null),
    );
  }, [fid, uid]);
  const name = members.find((m) => m.uid === uid)?.name ?? "";
  const today = isoDate(new Date());
  const days = useMemo(() => {
    if (!tree) return null;
    const first = tree.acts.at(-1)?.start_date_local.slice(0, 10) ?? tree.wellness[0]?.id;
    const oldest = first && first < today ? first : addDays(today, -365);
    return buildDays(tree.acts, tree.wellness, oldest, today, offDays(tree.off));
  }, [tree, today]);

  return (
    <div className="-mt-2 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <Link
          to="/forest/$fid"
          params={{ fid }}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> {t("Forest", "Bosco")}
        </Link>
        {tree?.day && tree.day !== today && (
          <span className="text-xs text-muted-foreground">
            {t("crown of", "chioma del")} {format(parseISO(tree.day), "d MMM")}
          </span>
        )}
      </div>
      <h1 className="text-center text-lg font-semibold">
        {name ? t(`${name}'s tree`, `L'albero di ${name}`) : "…"}
      </h1>
      {tree === null && (
        <p className="py-10 text-center text-sm text-muted-foreground">
          {t(
            "Nothing shared yet: the tree appears after they next open Cirmolo.",
            "Ancora niente di condiviso: l'albero comparirà quando apriranno Cirmolo.",
          )}
        </p>
      )}
      <div ref={ref}>
        {w > 0 && tree && days && days.length > 0 && (
          <>
            {tree.crown && (
              <CrownView
                crown={tree.crown}
                today={today}
                trunk={days[0]!.trunk}
                w={w}
                limit={null}
                quiet={false}
                block=""
                onOpen={() => setSheet({ kind: "today" })}
              />
            )}
            <TreeBody days={days} w={w} today={today} quiet={false} blocks={[]} open={setSheet} />
          </>
        )}
      </div>
      <ResponsiveDialog
        open={!!sheet && sheet.kind !== "plan"}
        onOpenChange={(o) => !o && setSheet(null)}
        title={
          sheet?.kind === "days" ? sheet.title : (tree?.crown?.seasonLabel ?? t("Today", "Oggi"))
        }
      >
        {sheet?.kind === "days" && tree && (
          <DayRides
            acts={tree.acts.filter((a) => sheet.dates.includes(a.start_date_local.slice(0, 10)))}
          />
        )}
        {sheet?.kind === "today" && tree?.crown && <CrownFacts crown={tree.crown} />}
      </ResponsiveDialog>
    </div>
  );
}

/** The rides of a day (or a week) on a member's tree: what they chose to share. */
function DayRides({ acts }: { acts: Activity[] }) {
  if (!acts.length)
    return (
      <p className="text-sm text-muted-foreground">{t("A rest day.", "Un giorno di riposo.")}</p>
    );
  return (
    <ul className="divide-y divide-border text-sm">
      {acts.map((a) => (
        <li key={a.id} className="flex items-center justify-between gap-3 py-2.5">
          <span className="min-w-0">
            <span className="block truncate">{a.name ?? a.type}</span>
            <span className="block text-xs text-muted-foreground">
              {format(parseISO(a.start_date_local), "EEE d MMM")}
            </span>
          </span>
          <span className="stat-num shrink-0 text-right text-xs text-muted-foreground">
            <span className="block text-sm text-foreground">{formatDuration(a.moving_time)}</span>
            {[
              formatKm(a.distance),
              a.total_elevation_gain ? `${Math.round(a.total_elevation_gain)} m` : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Today's crown in words: season and sky, fitness, fatigue and form. */
function CrownFacts({ crown }: { crown: Crown }) {
  const fact = (label: string, value: string, tone?: string) => (
    <div className="rounded-lg bg-secondary/60 p-3">
      <div className="eyebrow">{label}</div>
      <div className={`stat-num mt-1 text-xl font-semibold ${tone ?? ""}`}>{value}</div>
    </div>
  );
  return (
    <div className="space-y-3 text-sm">
      <p className="text-muted-foreground">
        {crown.seasonLabel}
        {crown.weather && ` · ${WEATHER_WORD[crown.weather]}`}
      </p>
      <div className="grid grid-cols-3 gap-2">
        {fact(
          t("Fitness", "Forma fisica"),
          crown.ctl != null ? `${Math.round(crown.ctl)}` : "–",
          "text-fitness",
        )}
        {fact(
          t("Fatigue", "Fatica"),
          crown.atl != null ? `${Math.round(crown.atl)}` : "–",
          "text-fatigue",
        )}
        {fact(
          t("Form", "Forma"),
          crown.form != null ? `${crown.form > 0 ? "+" : ""}${Math.round(crown.form)}` : "–",
          "text-form",
        )}
      </div>
    </div>
  );
}
