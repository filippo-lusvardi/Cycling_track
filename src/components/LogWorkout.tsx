import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ManualActivity } from "@/lib/intervals";
import { createManualActivity } from "@/lib/source";
import { loadFromRpe } from "@/lib/training";
import { cn } from "@/lib/utils";
import { t } from "@/lib/i18n";

const TYPES: { value: ManualActivity["type"]; label: string }[] = [
  { value: "Ride", label: t("Ride", "Bici") },
  { value: "VirtualRide", label: t("Indoor ride", "Rulli") },
  { value: "Run", label: t("Run", "Corsa") },
  { value: "WeightTraining", label: t("Gym", "Palestra") },
  { value: "Walk", label: t("Walk", "Camminata") },
  { value: "Swim", label: t("Swim", "Nuoto") },
  { value: "Other", label: t("Other", "Altro") },
];

/** A workout the watch didn't record, written to intervals.icu as a manual activity. */
export function LogWorkoutForm({ date, onSaved }: { date: string; onSaved?: () => void }) {
  const qc = useQueryClient();
  const [type, setType] = useState<ManualActivity["type"]>("WeightTraining");
  const [day, setDay] = useState(date);
  const [name, setName] = useState("");
  const [minutes, setMinutes] = useState("60");
  const [km, setKm] = useState("");
  const [rpe, setRpe] = useState(5);
  const [busy, setBusy] = useState(false);
  const mins = Number(minutes) || 0;
  const load = mins > 0 ? loadFromRpe(mins, rpe) : 0;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (mins < 1) {
      toast.error(t("Enter the duration", "Inserisci la durata"));
      return;
    }
    const entry: ManualActivity = {
      date: day,
      type,
      name: name.trim() || TYPES.find((o) => o.value === type)!.label,
      minutes: Math.round(mins),
      load,
      rpe,
    };
    const dist = Number(km.replace(",", "."));
    if (dist > 0) entry.distanceKm = dist;
    setBusy(true);
    try {
      await createManualActivity(entry);
      toast.success(t("Workout added to intervals.icu", "Allenamento aggiunto su intervals.icu"));
      await qc.invalidateQueries({ queryKey: ["activities"] });
      onSaved?.();
    } catch {
      toast.error(t("Couldn't save the workout", "Impossibile salvare l'allenamento"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label htmlFor="lw-type">{t("Type", "Tipo")}</Label>
          <select
            id="lw-type"
            value={type}
            onChange={(e) => setType(e.target.value as ManualActivity["type"])}
            className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
          >
            {TYPES.map((o) => (
              <option key={o.value} value={o.value} className="bg-popover">
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="lw-date">{t("Date", "Data")}</Label>
          <Input id="lw-date" type="date" value={day} onChange={(e) => setDay(e.target.value)} required />
        </div>
      </div>
      <div className="space-y-1">
        <Label htmlFor="lw-name">{t("Name", "Nome")}</Label>
        <Input id="lw-name" value={name} onChange={(e) => setName(e.target.value)} placeholder={t("Leg day, easy run…", "Gambe, corsetta…")} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label htmlFor="lw-min">{t("Duration (min)", "Durata (min)")}</Label>
          <Input id="lw-min" inputMode="numeric" value={minutes} onChange={(e) => setMinutes(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="lw-km">{t("Distance (km)", "Distanza (km)")}</Label>
          <Input id="lw-km" inputMode="decimal" value={km} onChange={(e) => setKm(e.target.value)} placeholder={t("optional", "facoltativa")} />
        </div>
      </div>
      <div className="space-y-1">
        <Label>{t("Effort (RPE)", "Sforzo (RPE)")}</Label>
        <div className="grid grid-cols-10 gap-1">
          {Array.from({ length: 10 }, (_, i) => i + 1).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setRpe(v)}
              className={cn(
                "stat-num rounded-md border py-2 text-xs",
                rpe === v ? "border-transparent text-background" : "border-border text-muted-foreground",
              )}
              style={rpe === v ? { background: `var(--z${Math.min(7, Math.ceil((v * 7) / 10))})` } : undefined}
            >
              {v}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          {t("Estimated load", "Carico stimato")} <span className="stat-num text-foreground">{load}</span>{" "}
          {t("(duration × RPE intensity, like TSS)", "(durata × intensità RPE, come il TSS)")}
        </p>
      </div>
      <Button type="submit" className="w-full" disabled={busy}>
        {busy ? t("Saving…", "Salvataggio…") : t("Add workout", "Aggiungi allenamento")}
      </Button>
    </form>
  );
}
