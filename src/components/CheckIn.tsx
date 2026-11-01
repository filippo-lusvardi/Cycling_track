import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Minus, Plus } from "lucide-react";
import { ResponsiveDialog } from "@/components/ResponsiveDialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useLocalStore } from "@/hooks/use-local-store";
import type { Wellness, WellnessEntry } from "@/lib/intervals";
import { wellnessQuery } from "@/lib/queries";
import { hasApiKey } from "@/lib/settings";
import { isoDate } from "@/lib/training";
import { cn } from "@/lib/utils";
import { flushWellnessQueue, saveWellnessOrQueue } from "@/lib/wellness-queue";
import { t } from "@/lib/i18n";

type ScaleKey = "sleepQuality" | "fatigue" | "stress" | "mood";

// intervals.icu's own 1–4 scales; 1 is always the best answer.
const SCALES: { key: ScaleKey; label: string; options: [string, string, string, string] }[] = [
  {
    key: "sleepQuality",
    label: t("Sleep quality", "Qualità del sonno"),
    options: [t("Great", "Ottima"), t("Good", "Buona"), t("Average", "Media"), t("Poor", "Scarsa")],
  },
  {
    key: "fatigue",
    label: t("Fatigue", "Fatica"),
    options: [t("Low", "Bassa"), t("Average", "Media"), t("High", "Alta"), t("Extreme", "Estrema")],
  },
  {
    key: "stress",
    label: "Stress",
    options: [t("Low", "Basso"), t("Average", "Medio"), t("High", "Alto"), t("Extreme", "Estremo")],
  },
  {
    key: "mood",
    label: t("Mood", "Umore"),
    options: [t("Great", "Ottimo"), t("Good", "Buono"), t("OK", "OK"), t("Grumpy", "Scontroso")],
  },
];

const LEVEL_TONE = ["var(--pine)", "var(--fitness)", "var(--birch)", "var(--lingon)"];

export const isCheckedIn = (row: Wellness | undefined) =>
  !!row && (row.sleepQuality ?? row.fatigue ?? row.stress ?? row.mood) != null;

type CheckInState = "" | "open" | "dismissed" | "done";

/** Per-device memory of today's check-in prompt (the answers themselves live in intervals.icu). */
export function useCheckInState(date: string) {
  const [state, setState] = useLocalStore<CheckInState>(`cadence_checkin_${date}`, "");
  return [state, (s: CheckInState) => setState(() => s)] as const;
}

/** Sleep and how you feel for one day, written to intervals.icu wellness. */
export function CheckInForm({ date, row, onSaved }: { date: string; row: Wellness | undefined; onSaved?: () => void }) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  // Sleep in half-hours; null until set. Only sent back if changed, so the watch's exact value isn't rounded away.
  const [halves, setHalves] = useState<number | null>(() => (row?.sleepSecs ? Math.round(row.sleepSecs / 1800) : null));
  const [sleepTouched, setSleepTouched] = useState(false);
  const [vals, setVals] = useState<Partial<Record<ScaleKey, number>>>(() => {
    const v: Partial<Record<ScaleKey, number>> = {};
    for (const s of SCALES) if (row?.[s.key] != null) v[s.key] = row[s.key]!;
    return v;
  });

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const entry: WellnessEntry = { date };
    if (sleepTouched && halves != null) entry.sleepSecs = halves * 1800;
    for (const s of SCALES) {
      const v = vals[s.key];
      if (v != null) entry[s.key] = v;
    }
    if (Object.keys(entry).length === 1) {
      toast.error(t("Answer at least one question", "Rispondi ad almeno una domanda"));
      return;
    }
    setBusy(true);
    try {
      const r = await saveWellnessOrQueue(entry);
      toast.success(
        r === "saved"
          ? t("Saved to intervals.icu", "Salvato su intervals.icu")
          : t(
              "Saved on this device; it will sync when you're back online",
              "Salvato su questo dispositivo; si sincronizzerà quando tornerai online",
            ),
      );
      await qc.invalidateQueries({ queryKey: ["wellness"] });
      onSaved?.();
    } catch {
      toast.error(t("Couldn't save. Check the values and try again", "Salvataggio non riuscito. Controlla i valori e riprova"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-1">
        <Label>{t("Sleep", "Sonno")}</Label>
        <SleepStepper
          halves={halves}
          onChange={(h) => {
            setHalves(h);
            setSleepTouched(true);
          }}
        />
      </div>
      {SCALES.map((s) => (
        <div key={s.key} className="space-y-1">
          <Label>{s.label}</Label>
          <div className="grid grid-cols-4 gap-1.5">
            {s.options.map((o, i) => {
              const level = i + 1;
              const on = vals[s.key] === level;
              return (
                <button
                  key={o}
                  type="button"
                  onClick={() => setVals((v) => ({ ...v, [s.key]: on ? undefined : level }))}
                  className={cn(
                    "flex items-center justify-center gap-1.5 rounded-md border px-2 py-2 text-xs transition-colors",
                    on ? "border-transparent bg-secondary text-foreground" : "border-border text-muted-foreground hover:text-foreground",
                  )}
                  style={on ? { boxShadow: `inset 0 0 0 1.5px ${LEVEL_TONE[i]}` } : undefined}
                >
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: LEVEL_TONE[i] }} />
                  {o}
                </button>
              );
            })}
          </div>
        </div>
      ))}
      <Button type="submit" className="w-full" disabled={busy}>
        {busy ? t("Saving…", "Salvataggio…") : t("Save check-in", "Salva check-in")}
      </Button>
    </form>
  );
}

const MIN_HALVES = 6; // 3 h
const MAX_HALVES = 24; // 12 h

/** Hours slept with − / + buttons, 30 minutes per tap. Starts at 7 h when nothing is synced yet. */
function SleepStepper({ halves, onChange }: { halves: number | null; onChange: (h: number) => void }) {
  const step = (d: number) => onChange(Math.min(MAX_HALVES, Math.max(MIN_HALVES, (halves ?? 14) + (halves == null ? 0 : d))));
  const h = halves != null ? Math.floor(halves / 2) : null;
  return (
    <div className="flex items-center gap-3">
      <Button type="button" variant="secondary" size="icon" className="h-11 w-11" aria-label={t("30 minutes less", "30 minuti in meno")} disabled={halves != null && halves <= MIN_HALVES} onClick={() => step(-1)}>
        <Minus />
      </Button>
      <button
        type="button"
        onClick={() => halves == null && step(0)}
        className={cn("stat-num w-28 text-center text-2xl font-semibold", halves == null && "text-base font-normal text-muted-foreground")}
      >
        {halves == null ? t("tap to set", "tocca per impostare") : `${h} h ${halves % 2 ? "30" : "00"}`}
      </button>
      <Button type="button" variant="secondary" size="icon" className="h-11 w-11" aria-label={t("30 minutes more", "30 minuti in più")} disabled={halves != null && halves >= MAX_HALVES} onClick={() => step(1)}>
        <Plus />
      </Button>
    </div>
  );
}

/** Opens the check-in on the first visit of the day unless it's already done (on any device). */
export function DailyCheckIn() {
  const qc = useQueryClient();
  const today = isoDate(new Date());
  const { data } = useQuery({ ...wellnessQuery(14), enabled: hasApiKey() });
  const [state, setState] = useCheckInState(today);
  const row = data?.find((w) => w.id === today);
  const needed = !!data && !isCheckedIn(row) && state !== "done";
  const open = (needed && state === "") || state === "open";

  useEffect(() => {
    const flush = () =>
      flushWellnessQueue().then((n) => {
        if (n) {
          toast.success(t("Offline check-in synced to intervals.icu", "Check-in offline sincronizzato su intervals.icu"));
          void qc.invalidateQueries({ queryKey: ["wellness"] });
        }
      });
    void flush();
    window.addEventListener("online", flush);
    return () => window.removeEventListener("online", flush);
  }, [qc]);

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={(o) => !o && setState("dismissed")}
      title={t("Morning check-in", "Check-in mattutino")}
      description={t(
        "How did you sleep and how do you feel? Feeds today's readiness.",
        "Come hai dormito e come ti senti? Alimenta la prontezza di oggi.",
      )}
    >
      <CheckInForm key={row?.id ?? "none"} date={today} row={row} onSaved={() => setState("done")} />
    </ResponsiveDialog>
  );
}
