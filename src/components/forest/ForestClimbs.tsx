import { Link, useNavigate } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ClimbWorld } from "@/components/forest/ClimbWorld";
import { OpenScene, phoneFit } from "@/components/forest/ForestScene";
import { Panel } from "@/components/StatCard";
import { Button } from "@/components/ui/button";
import { useSegmentNames } from "@/hooks/use-segment-names";
import { useSegmentLibrary } from "@/hooks/use-segments";
import { forestSport, type Forest, type Member } from "@/lib/forest/forests";
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
import { cn } from "@/lib/utils";

/** Screen px the phone's scene keeps free for the "Add one of my climbs" button floating over its foot. */
const BUTTON_ROOM = 64;

/** The forest's climbs as a mountain range; each peak opens its page with the leaderboard. */
export function ForestClimbs({ forest, members }: { forest: Forest; members: Member[] }) {
  const navigate = useNavigate();
  const [climbs, setClimbs] = useState<ForestClimb[] | null>(null);
  const [adding, setAdding] = useState(false);
  useEffect(() => watchClimbs(forest.id, setClimbs), [forest.id]);
  const leaders = useLeaders(forest, climbs ?? []);
  const names = new Map(members.map((m) => [m.uid, m.name]));
  const hasScene = climbs != null && climbs.length > 0;

  return (
    // On the phone the scene runs to the window's foot, with nothing below it: the page's padding isn't wanted.
    <div className={cn("relative space-y-4", hasScene && "max-sm:-mb-32")}>
      {hasScene && (
        <OpenScene>
          {(w, fit) => (
            <ClimbWorld
              w={w}
              // On a wide scene, room under it for the "Add one of my climbs" button (about 64 px).
              {...(w > 360 ? { fit: fit - 43 } : phoneFit(w, fit, BUTTON_ROOM))}
              climbs={climbs.map((c) => {
                const l = leaders[c.sid];
                return { climb: c, leader: l ? { ...l, name: names.get(l.uid) ?? "…" } : null };
              })}
              onOpen={(sid) =>
                navigate({ to: "/forest/$fid/climb/$sid", params: { fid: forest.id, sid } })
              }
            />
          )}
        </OpenScene>
      )}
      {climbs && climbs.length === 0 && (
        <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
          {t(
            "No climbs yet. Add one of yours: everyone's best time on it, from the activities they share here, makes the leaderboard.",
            "Ancora nessuna salita. Aggiungine una delle tue: il miglior tempo di ognuno, dalle attività che condivide qui, forma la classifica.",
          )}
        </p>
      )}
      {/* On the phone it floats over the scene's foot, just above the bottom bar. */}
      <div
        className={cn(
          hasScene &&
            "max-sm:absolute max-sm:inset-x-0 max-sm:bottom-[calc(4.875rem+env(safe-area-inset-bottom))]",
        )}
      >
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
    </div>
  );
}

/** Each climb's fastest time, live. */
function useLeaders(forest: Forest, climbs: ForestClimb[]): Record<string, ForestTime> {
  const fid = forest.id;
  const sport = forestSport(forest);
  const [leaders, setLeaders] = useState<Record<string, ForestTime>>({});
  const ids = climbs.map((c) => c.sid).join(",");
  useEffect(() => {
    const stops = climbs.map((c) =>
      watchTimes(fid, c.sid, (times) =>
        setLeaders((l) => {
          const next = { ...l };
          // Until a member's app has republished, an older time of the other sport may still be there.
          const first = times.find((x) => (x.sport ?? "ride") === sport);
          if (first) next[c.sid] = first;
          else delete next[c.sid];
          return next;
        }),
      ),
    );
    return () => stops.forEach((s) => s());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fid, ids, sport]);
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
  const sport = forestSport(forest);
  const { list } = useSegmentLibrary({ sync: false, sport });
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
          {t("Star a climb on the ", "Prima aggiungi ai preferiti una salita nella pagina ")}
          <Link to="/segments" className="underline">
            {t("Segments", "Segmenti")}
          </Link>
          {t(" page first.", ".")}
        </p>
      ) : (
        <ul className="max-h-48 divide-y sm:max-h-72 divide-border overflow-y-auto">
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
                  {segmentSummary(s, sport)}
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
