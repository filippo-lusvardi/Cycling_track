// Thresholds in Settings. With intervals.icu they live there: shown as it has them, and written back only after saying
// exactly what will change. Zone limits Cirmolo owns are edited here too.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ResponsiveDialog } from "@/components/ResponsiveDialog";
import { Panel } from "@/components/StatCard";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ZONE_NAMES } from "@/lib/analysis";
import { t } from "@/lib/i18n";
import type { ThresholdPatch } from "@/lib/intervals";
import { HR_ZONE_PCT, OPEN_ZONE, POWER_ZONE_PCT, validZoneTops } from "@/lib/metrics";
import { formatPace } from "@/lib/pace";
import { rideZonesQuery, thresholdsQuery } from "@/lib/queries";
import { PACE_ZONE_PCT, RUN_ZONE_NAMES } from "@/lib/run-metrics";
import {
  readSetting,
  RUN_THRESHOLD,
  writeSetting,
  ZONE_TOPS,
  zoneTops,
  type ZoneTops,
} from "@/lib/settings";
import { hasSource, saveThresholds, sourceKind } from "@/lib/source";
import { knownRunThreshold, type MainSport } from "@/lib/sport";

export type PendingWrite = {
  sport: MainSport;
  patch: ThresholdPatch;
  rows: { label: string; from: string; to: string }[];
};

/** The last word before anything is written to intervals.icu: exactly what changes. */
export function ThresholdConfirm({
  pending,
  onClose,
}: {
  pending: PendingWrite | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  async function confirm() {
    if (!pending) return;
    setBusy(true);
    try {
      await saveThresholds(pending.sport, pending.patch);
      if (pending.patch.pace != null) {
        // Now intervals.icu holds it, a value typed here earlier has no say.
        writeSetting(RUN_THRESHOLD, null);
        const { saveProfile } = await import("@/lib/cloud");
        await saveProfile({ runThreshold: null });
      }
      await qc.invalidateQueries();
      toast.success(t("Saved to intervals.icu", "Salvato su intervals.icu"));
      onClose();
    } catch (err) {
      console.warn("Thresholds not saved", err);
      toast.error(t("Couldn't save to intervals.icu", "Impossibile salvare su intervals.icu"));
    } finally {
      setBusy(false);
    }
  }
  return (
    <ResponsiveDialog
      open={pending != null}
      onOpenChange={(o) => !o && onClose()}
      title={t("Change on intervals.icu?", "Cambiare su intervals.icu?")}
      description={t(
        "This changes your settings on intervals.icu, not only here. It may change how intervals.icu works out your zones and training load.",
        "Questo cambia le tue impostazioni su intervals.icu, non solo qui. Può cambiare il modo in cui intervals.icu calcola zone e carico.",
      )}
    >
      <ul className="stat-num mb-4 space-y-1 text-sm">
        {pending?.rows.map((r) => (
          <li key={r.label} className="flex justify-between gap-3">
            <span className="font-sans text-muted-foreground">{r.label}</span>
            <span>
              {r.from} → <span className="font-semibold">{r.to}</span>
            </span>
          </li>
        ))}
      </ul>
      <div className="flex gap-2 pb-2">
        <Button className="flex-1" disabled={busy} onClick={() => void confirm()}>
          {t("Change it", "Cambia")}
        </Button>
        <Button variant="secondary" className="flex-1" disabled={busy} onClick={onClose}>
          {t("Cancel", "Annulla")}
        </Button>
      </div>
    </ResponsiveDialog>
  );
}

const shown = (v: number | null | undefined, unit: string) => (v ? `${v} ${unit}` : "–");
const positive = (v: string) => (v.trim() && Number(v) > 0 ? Number(v) : null);

/** A number that's changed, as what to write and how to show it. Empty leaves intervals.icu's value alone. */
export function changedRow(
  label: string,
  now: number | null | undefined,
  typed: string,
  unit: string,
) {
  const v = positive(typed);
  return v != null && v !== now
    ? { label, from: shown(now, unit), to: shown(v, unit), value: v }
    : null;
}

/** FTP and heart rate on the bike, as intervals.icu has them. */
export function IntervalsThresholds() {
  const { data: th } = useQuery({ ...thresholdsQuery("ride"), enabled: hasSource() });
  const [form, setForm] = useState({ ftp: "", lthr: "", maxHr: "" });
  const [pending, setPending] = useState<PendingWrite | null>(null);
  useEffect(() => {
    if (th)
      setForm({
        ftp: th.ftp ? String(th.ftp) : "",
        lthr: th.lthr ? String(th.lthr) : "",
        maxHr: th.maxHr ? String(th.maxHr) : "",
      });
  }, [th]);
  function review(e: React.FormEvent) {
    e.preventDefault();
    if (!th) return;
    const ftp = changedRow("FTP", th.ftp, form.ftp, "W");
    const lthr = changedRow(t("Threshold HR", "FC di soglia"), th.lthr, form.lthr, "bpm");
    const maxHr = changedRow(t("Max HR", "FC massima"), th.maxHr, form.maxHr, "bpm");
    const rows = [ftp, lthr, maxHr].filter((r) => r != null);
    if (!rows.length) return void toast(t("Nothing to change", "Niente da cambiare"));
    setPending({
      sport: "ride",
      rows,
      patch: {
        ...(ftp ? { ftp: ftp.value } : {}),
        ...(lthr ? { lthr: lthr.value } : {}),
        ...(maxHr ? { maxHr: maxHr.value } : {}),
      },
    });
  }
  const field = (k: keyof typeof form, label: string, unit: string) => (
    <div className="space-y-1">
      <Label htmlFor={`icu-${k}`}>
        {label} <span className="text-muted-foreground">({unit})</span>
      </Label>
      <Input
        id={`icu-${k}`}
        inputMode="numeric"
        disabled={!th?.exists}
        value={form[k]}
        onChange={(e) => setForm({ ...form, [k]: e.target.value })}
      />
    </div>
  );
  return (
    <Panel title={t("Thresholds", "Soglie")}>
      <form onSubmit={review} className="space-y-3 text-sm">
        <div className="grid grid-cols-3 items-end gap-3">
          {field("ftp", "FTP", "W")}
          {field("lthr", t("Threshold HR", "FC di soglia"), "bpm")}
          {field("maxHr", t("Max HR", "FC massima"), "bpm")}
        </div>
        <p className="text-xs text-muted-foreground">
          {th && !th.exists
            ? t(
                "intervals.icu has no cycling settings for you yet: add them there first.",
                "intervals.icu non ha ancora impostazioni di ciclismo per te: aggiungile prima lì.",
              )
            : t(
                "As intervals.icu has them. Saving changes them there too, after asking. Power and heart-rate zones are edited on intervals.icu.",
                "Come le ha intervals.icu. Salvando cambiano anche lì, dopo avertelo chiesto. Le zone di potenza e frequenza cardiaca si modificano su intervals.icu.",
              )}
        </p>
        <Button type="submit" disabled={!th?.exists}>
          {t("Save", "Salva")}
        </Button>
      </form>
      <ThresholdConfirm pending={pending} onClose={() => setPending(null)} />
    </Panel>
  );
}

type Kind = keyof ZoneTops;

const toText = (pct: number[]) => pct.map(String);

/** One set of zone limits: the top of each zone as % of its threshold, with what that comes to. */
function ZoneEditor({
  kind,
  title,
  defaults,
  names,
  amount,
}: {
  kind: Kind;
  title: string;
  defaults: number[];
  names: readonly string[];
  /** What a percentage comes to with today's threshold; null without one. */
  amount: (pct: number) => string | null;
}) {
  const qc = useQueryClient();
  const saved = zoneTops()[kind];
  const [vals, setVals] = useState(() => toText(saved ?? defaults));
  const pct = vals.map(Number);
  const valid = validZoneTops(pct);
  const custom = saved != null;
  async function store(next: number[] | null) {
    writeSetting(ZONE_TOPS, { ...(readSetting<ZoneTops>(ZONE_TOPS) ?? {}), [kind]: next });
    try {
      const { saveProfile } = await import("@/lib/cloud");
      await saveProfile({ zoneTops: { [kind]: next } });
      if (sourceKind() === "native") (await import("@/lib/native")).forget();
      await qc.invalidateQueries();
      toast.success(
        sourceKind() === "native"
          ? t(
              'Saved. "Recalculate all rides" applies it to the rides you already have.',
              'Salvato. "Ricalcola tutte le uscite" lo applica alle uscite che hai già.',
            )
          : t("Saved", "Salvato"),
      );
    } catch (err) {
      console.warn("Zones not saved", err);
      toast.error(t("Couldn't save the zones", "Impossibile salvare le zone"));
    }
  }
  return (
    <Collapsible>
      <CollapsibleTrigger className="group flex w-full items-center justify-between gap-3 py-2.5 text-left text-sm">
        <span>
          {title}
          {custom && (
            <span className="ml-2 text-xs text-muted-foreground">
              {t("your own", "personalizzate")}
            </span>
          )}
        </span>
        <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-1.5 pb-3">
        {vals.map((v, i) => {
          const open = i === vals.length - 1;
          const inputId = `zone-${kind}-${i}`;
          return (
            <div key={i} className="flex items-center gap-2 text-sm">
              <Label htmlFor={inputId} className="min-w-0 flex-1 truncate font-normal">
                Z{i + 1} {names[i]}
              </Label>
              {open ? (
                <span className="w-20 text-right text-xs text-muted-foreground">
                  {t("no limit", "senza limite")}
                </span>
              ) : (
                <>
                  <span className="stat-num w-20 text-right text-xs text-muted-foreground">
                    {amount(Number(v)) ?? ""}
                  </span>
                  <Input
                    id={inputId}
                    inputMode="numeric"
                    className="h-8 w-16 text-right"
                    value={v}
                    aria-invalid={!valid}
                    onChange={(e) => setVals(vals.map((x, k) => (k === i ? e.target.value : x)))}
                  />
                  <span className="w-3 text-xs text-muted-foreground">%</span>
                </>
              )}
            </div>
          );
        })}
        {!valid && (
          <p className="text-xs text-birch" role="status">
            {t(
              "Each zone must end above the one before it.",
              "Ogni zona deve finire sopra quella precedente.",
            )}
          </p>
        )}
        <div className="flex gap-2 pt-1">
          <Button size="sm" disabled={!valid} onClick={() => void store(pct)}>
            {t("Save", "Salva")}
          </Button>
          {custom && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setVals(toText(defaults));
                void store(null);
              }}
            >
              {t("Back to default", "Ripristina predefiniti")}
            </Button>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

/** Zone limits where Cirmolo owns them: power and heart rate without intervals.icu, pace for anyone who runs. */
export function ZoneLimits({ runs }: { runs: boolean }) {
  const native = sourceKind() === "native";
  const { data: zones } = useQuery({ ...rideZonesQuery(), enabled: native });
  const { data: ride } = useQuery({ ...thresholdsQuery("ride"), enabled: native });
  const { data: run } = useQuery({ ...thresholdsQuery("run"), enabled: native && runs });
  const pace = knownRunThreshold();
  const lthrOf = (v: { lthr: number | null; maxHr: number | null } | undefined) =>
    v?.lthr ?? (v?.maxHr ? Math.round(v.maxHr * 0.9) : null);
  const bpm = (lthr: number | null) => (p: number) =>
    lthr && p < OPEN_ZONE ? `${Math.round((lthr * p) / 100)} bpm` : null;
  const rideLthr = lthrOf(ride);
  if (!native && !runs) return null;
  return (
    <Panel title={t("Zones", "Zone")}>
      <p className="mb-1 text-sm text-muted-foreground">
        {native
          ? t(
              "Where each zone ends, as a percentage of your threshold.",
              "Dove finisce ogni zona, in percentuale della tua soglia.",
            )
          : t(
              "Where each pace zone ends, as a percentage of threshold speed. Only in Cirmolo: intervals.icu keeps its own. Power and heart-rate zones are edited on intervals.icu.",
              "Dove finisce ogni zona di passo, in percentuale della velocità di soglia. Solo in Cirmolo: intervals.icu tiene le sue. Le zone di potenza e frequenza cardiaca si modificano su intervals.icu.",
            )}
      </p>
      <div className="divide-y divide-border">
        {native && (
          <ZoneEditor
            kind="power"
            title={t("Power", "Potenza")}
            defaults={POWER_ZONE_PCT}
            names={ZONE_NAMES}
            amount={(p) =>
              zones?.ftp && p < OPEN_ZONE ? `${Math.round((zones.ftp * p) / 100)} W` : null
            }
          />
        )}
        {native && (
          <ZoneEditor
            kind="hr"
            title={t("Heart rate", "Frequenza cardiaca")}
            defaults={HR_ZONE_PCT}
            names={ZONE_NAMES}
            amount={bpm(rideLthr)}
          />
        )}
        {native && runs && (
          <ZoneEditor
            kind="runHr"
            title={t("Heart rate on foot", "Frequenza cardiaca di corsa")}
            defaults={HR_ZONE_PCT}
            names={RUN_ZONE_NAMES}
            amount={bpm(lthrOf(run) ?? rideLthr)}
          />
        )}
        {runs && (
          <ZoneEditor
            kind="pace"
            title={t("Pace", "Passo")}
            defaults={PACE_ZONE_PCT}
            names={RUN_ZONE_NAMES}
            amount={(p) => (pace && p > 0 ? `${formatPace((pace * p) / 100)}/km` : null)}
          />
        )}
      </div>
    </Panel>
  );
}
