import { doc, onSnapshot } from "firebase/firestore";
import { useEffect, useState } from "react";
import { Panel } from "@/components/StatCard";
import { Switch } from "@/components/ui/switch";
import { uid } from "@/lib/firebase";
import { db } from "@/lib/db";
import { forestSport, watchMyForests, type Forest } from "@/lib/forest/forests";
import { republish } from "@/lib/forest/publish";
import {
  isShared,
  prefsOf,
  setRideShared,
  watchOverrides,
  type Overrides,
  type SharePrefs,
} from "@/lib/forest/visibility";
import { t } from "@/lib/i18n";
import { sportWords, type MainSport } from "@/lib/sport";

/**
 * On a ride's page: in which of my forests of its sport this ride shows. Nothing when I'm in none, or for an activity
 * no forest is about.
 */
export function RideVisibility({
  rideId,
  day,
  sport,
}: {
  rideId: string;
  day: string;
  sport: MainSport | null;
}) {
  const [all, setForests] = useState<Forest[]>([]);
  const forests = all.filter((f) => forestSport(f) === sport);
  const [overrides, setOverrides] = useState<Overrides>({});
  const [prefs, setPrefs] = useState<Record<string, SharePrefs>>({});
  useEffect(() => watchMyForests(setForests), []);
  useEffect(() => watchOverrides(setOverrides), []);
  const ids = forests.map((f) => f.id).join(",");
  useEffect(() => {
    const stops = forests.map((f) =>
      onSnapshot(
        doc(db, "forests", f.id, "members", uid()),
        (m) => setPrefs((p) => ({ ...p, [f.id]: prefsOf(m.data()) })),
        () => {},
      ),
    );
    return () => stops.forEach((s) => s());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids]);
  if (!forests.length || !sport) return null;
  const w = sportWords(sport);

  return (
    <Panel title={t("Visible in", "Visibile in")}>
      <ul className="divide-y divide-border">
        {forests.map((f) => {
          const shown = isShared(
            { id: rideId, day },
            f.id,
            prefs[f.id] ?? prefsOf(undefined),
            overrides,
          );
          return (
            <li key={f.id} className="flex items-center justify-between gap-3 py-2 text-sm">
              <span className="truncate">{f.name}</span>
              <Switch
                checked={shown}
                aria-label={t(`Show in ${f.name}`, `Mostra in ${f.name}`)}
                onCheckedChange={async (v) => {
                  await setRideShared(rideId, f.id, v);
                  republish();
                }}
              />
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-xs text-muted-foreground">
        {t(
          `Hidden ${w.rides} leave your tree and the leaderboards in that forest.`,
          `Le ${w.uscite} nascoste spariscono dal tuo albero e dalle classifiche di quel bosco.`,
        )}
      </p>
    </Panel>
  );
}
