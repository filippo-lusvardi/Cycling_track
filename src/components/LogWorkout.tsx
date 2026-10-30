import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createManualActivity, type ManualActivity } from "@/lib/intervals";
import { loadFromRpe } from "@/lib/training";
import { cn } from "@/lib/utils";

const TYPES: { value: ManualActivity["type"]; label: string }[] = [
  { value: "Ride", label: "Ride" },
  { value: "VirtualRide", label: "Indoor ride" },
  { value: "Run", label: "Run" },
  { value: "WeightTraining", label: "Gym" },
  { value: "Walk", label: "Walk" },
  { value: "Swim", label: "Swim" },
  { value: "Other", label: "Other" },
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
      toast.error("Enter the duration");
      return;
    }
    const entry: ManualActivity = {
      date: day,
      type,
      name: name.trim() || TYPES.find((t) => t.value === type)!.label,
      minutes: Math.round(mins),
      load,
      rpe,
    };
    const dist = Number(km.replace(",", "."));
    if (dist > 0) entry.distanceKm = dist;
    setBusy(true);
    try {
      await createManualActivity(entry);
      toast.success("Workout added to intervals.icu");
      await qc.invalidateQueries({ queryKey: ["activities"] });
      onSaved?.();
    } catch {
      toast.error("Couldn't save the workout");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label htmlFor="lw-type">Type</Label>
          <select
            id="lw-type"
            value={type}
            onChange={(e) => setType(e.target.value as ManualActivity["type"])}
            className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
          >
            {TYPES.map((t) => (
              <option key={t.value} value={t.value} className="bg-popover">
                {t.label}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="lw-date">Date</Label>
          <Input id="lw-date" type="date" value={day} onChange={(e) => setDay(e.target.value)} required />
        </div>
      </div>
      <div className="space-y-1">
        <Label htmlFor="lw-name">Name</Label>
        <Input id="lw-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Leg day, easy run…" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label htmlFor="lw-min">Duration (min)</Label>
          <Input id="lw-min" inputMode="numeric" value={minutes} onChange={(e) => setMinutes(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="lw-km">Distance (km)</Label>
          <Input id="lw-km" inputMode="decimal" value={km} onChange={(e) => setKm(e.target.value)} placeholder="optional" />
        </div>
      </div>
      <div className="space-y-1">
        <Label>Effort (RPE)</Label>
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
          Estimated load <span className="stat-num text-foreground">{load}</span> (duration × RPE intensity, like TSS)
        </p>
      </div>
      <Button type="submit" className="w-full" disabled={busy}>
        {busy ? "Saving…" : "Add workout"}
      </Button>
    </form>
  );
}
