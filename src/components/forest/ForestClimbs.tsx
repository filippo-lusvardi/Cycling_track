import { Link, useNavigate } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ClimbWorld } from "@/components/forest/ClimbWorld";
import { Panel } from "@/components/StatCard";
import { Button } from "@/components/ui/button";
import { useSegmentNames } from "@/hooks/use-segment-names";
import { useSegmentLibrary } from "@/hooks/use-segments";
import type { Forest, Member } from "@/lib/forest/forests";
import {
  addClimb,
  watchClimbs,
  watchTimes,
  type ForestClimb,
  type ForestTime,
} from "@/lib/forest/leaderboard";
import { t } from "@/lib/i18n";
import { placeKey } from "@/lib/places";
import { segmentSummary } from "@/lib/segments";

/** The forest's climbs as a mountain range; each peak opens its page with the leaderboard. */
export function ForestClimbs({ forest, members }: { forest: Forest; members: Member[] }) {
  const navigate = useNavigate();
  const [climbs, setClimbs] = useState<ForestClimb[] | null>(null);
  const [adding, setAdding] = useState(false);
  useEffect(() => watchClimbs(forest.id, setClimbs), [forest.id]);
  const leaders = useLeaders(forest.id, climbs ?? []);
  const names = new Map(members.map((m) => [m.uid, m.name]));

  return (
    <div className="space-y-4">
      {climbs && climbs.length > 0 && (
        <div className="-mx-4 overflow-hidden sm:mx-auto sm:max-w-xl sm:rounded-xl sm:border sm:border-border">
          <ClimbWorld
            climbs={climbs.map((c) => {
              const l = leaders[c.sid];
              return { climb: c, leader: l ? { ...l, name: names.get(l.uid) ?? "…" } : null };
            })}
            onOpen={(sid) =>
              navigate({ to: "/forest/$fid/climb/$sid", params: { fid: forest.id, sid } })
            }
          />
        </div>
      )}
      {climbs && climbs.length === 0 && (
        <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
          {t(
            "No climbs yet. Add one of yours: everyone's best time on it, from the rides they share here, makes the leaderboard.",
            "Ancora nessuna salita. Aggiungine una delle tue: il miglior tempo di ognuno, dalle uscite che condivide qui, forma la classifica.",
          )}
        </p>
      )}
      {adding ? (
        <AddClimb
          forest={forest}
          have={new Set(climbs?.map((c) => c.sid))}
          onDone={() => setAdding(false)}
        />
      ) : (
        <Button variant="outline" onClick={() => setAdding(true)}>
          <Plus /> {t("Add one of my climbs", "Aggiungi una mia salita")}
        </Button>
      )}
    </div>
  );
}

/** Each climb's fastest time, live. */
function useLeaders(fid: string, climbs: ForestClimb[]): Record<string, ForestTime> {
  const [leaders, setLeaders] = useState<Record<string, ForestTime>>({});
  const ids = climbs.map((c) => c.sid).join(",");
  useEffect(() => {
    const stops = climbs.map((c) =>
      watchTimes(fid, c.sid, (times) =>
        setLeaders((l) => {
          const next = { ...l };
          if (times[0]) next[c.sid] = times[0];
          else delete next[c.sid];
          return next;
        }),
      ),
    );
    return () => stops.forEach((s) => s());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fid, ids]);
  return leaders;
}

/** Pick one of my saved climbs to add to the forest, with the route of my best effort for its page. */
function AddClimb({
  forest,
  have,
  onDone,
}: {
  forest: Forest;
  have: Set<string>;
  onDone: () => void;
}) {
  const { list } = useSegmentLibrary({ sync: false });
  const saved = useMemo(() => list.filter((s) => s.saved), [list]);
  const nameOf = useSegmentNames(saved);
  const choices = useMemo(
    () =>
      saved
        .filter((s) => !have.has(placeKey(s)))
        .sort((a, b) => nameOf(a).localeCompare(nameOf(b))),
    [saved, have, nameOf],
  );
  return (
    <Panel title={t("Add one of my climbs", "Aggiungi una mia salita")}>
      {choices.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {t("Star a climb on the ", "Aggiungi ai preferiti una salita nella pagina ")}
          <Link to="/segments" className="underline">
            {t("Segments", "Segmenti")}
          </Link>
          {t(" page first.", " prima.")}
        </p>
      ) : (
        <ul className="max-h-72 divide-y divide-border overflow-y-auto">
          {choices.map((s) => (
            <li key={s.id}>
              <button
                className="flex w-full items-center justify-between gap-3 py-2.5 text-left text-sm hover:text-primary"
                onClick={async () => {
                  try {
                    await addClimb(forest.id, s, nameOf(s), s.trace);
                    onDone();
                  } catch {
                    toast.error(t("Couldn't add the climb", "Impossibile aggiungere la salita"));
                  }
                }}
              >
                <span className="truncate">{nameOf(s)}</span>
                <span className="stat-num shrink-0 text-xs text-muted-foreground">
                  {segmentSummary(s)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <Button variant="ghost" className="mt-2" onClick={onDone}>
        {t("Cancel", "Annulla")}
      </Button>
    </Panel>
  );
}
