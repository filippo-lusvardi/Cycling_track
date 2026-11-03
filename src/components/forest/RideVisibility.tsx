import { doc, onSnapshot } from "firebase/firestore";
import { useEffect, useState } from "react";
import { Panel } from "@/components/StatCard";
import { Switch } from "@/components/ui/switch";
import { uid } from "@/lib/firebase";
import { db } from "@/lib/db";
import { watchMyForests, type Forest } from "@/lib/forest/forests";
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

/** On a ride's page: in which of my forests this ride shows. Nothing when I'm in no forest. */
export function RideVisibility({ rideId, day }: { rideId: string; day: string }) {
  const [forests, setForests] = useState<Forest[]>([]);
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
  if (!forests.length) return null;

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
          "Hidden rides leave your tree and the leaderboards in that forest.",
          "Le uscite nascoste spariscono dal tuo albero e dalle classifiche di quel bosco.",
        )}
      </p>
    </Panel>
  );
}
