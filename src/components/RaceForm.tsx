import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { createRace, deleteEvent, updateRace } from "@/lib/source";
import {
  DISCIPLINE_LABEL,
  DISCIPLINES,
  disciplineSport,
  formatMinutes,
  KINDS,
  parseMinutes,
  raceDescription,
  type Discipline,
  type Priority,
  type Race,
  type RaceKind,
} from "@/lib/races";
import { cn } from "@/lib/utils";
import { t } from "@/lib/i18n";
import { mainSport } from "@/lib/sport";

const PRIORITY_HINT: Record<Priority, string> = {
  A: t("main goal", "obiettivo principale"),
  B: t("important", "importante"),
  C: t("training race", "gara di allenamento"),
};

/** Segmented choice, like the check-in scales. */
function Choice<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { key: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex gap-1 rounded-lg bg-secondary p-1">
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          onClick={() => onChange(o.key)}
          aria-pressed={value === o.key}
          className={cn(
            "min-h-10 flex-1 rounded-md px-2 text-sm",
            value === o.key ? "bg-background text-foreground" : "text-muted-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Add or edit a race on the intervals.icu calendar: its kind sets what the training focus prepares for. */
const FIRST_KIND: Record<Discipline, RaceKind> = {
  road: "road",
  mtb: "xco",
  run: "run10k",
  trail: "trailShort",
};
const EVENT_TYPE = {
  road: "Ride",
  mtb: "MountainBikeRide",
  run: "Run",
  trail: "TrailRun",
} as const;

export function RaceForm({
  date,
  race,
  onSaved,
}: {
  date: string;
  race?: Race | undefined;
  onSaved?: () => void;
}) {
  const qc = useQueryClient();
  // A race keeps its own sport when it's edited; a new one is in the main sport.
  const sport = race?.info ? disciplineSport(race.info.discipline) : mainSport();
  const [name, setName] = useState(race?.name ?? "");
  const [day, setDay] = useState(race?.date ?? date);
  const [discipline, setDiscipline] = useState<Discipline>(
    race?.info?.discipline ?? DISCIPLINES[sport][0]!,
  );
  const [kind, setKind] = useState<RaceKind>(
    race?.info?.kind ?? (sport === "run" ? "run10k" : "road"),
  );
  const [time, setTime] = useState(race?.info?.minutes ? formatMinutes(race.info.minutes) : "");
  const [sprint, setSprint] = useState(race?.info?.sprint ?? false);
  const [priority, setPriority] = useState<Priority>(race?.priority ?? "B");
  const [busy, setBusy] = useState(false);
  const kinds = (Object.keys(KINDS) as RaceKind[]).filter(
    (k) => KINDS[k].discipline === discipline,
  );
  const timed = KINDS[kind].timed;

  const pickDiscipline = (d: Discipline) => {
    setDiscipline(d);
    if (KINDS[kind].discipline !== d) setKind(FIRST_KIND[d]);
  };

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const minutes = timed && time.trim() ? parseMinutes(time) : null;
    if (timed && time.trim() && !minutes) {
      toast.error(t("Write the time like 12 min or 1h30", "Scrivi il tempo come 12 min o 1h30"));
      return;
    }
    const entry = {
      date: day,
      name: name.trim() || KINDS[kind].label,
      priority,
      type: EVENT_TYPE[discipline],
      description: raceDescription(
        { discipline, kind, minutes, sprint: !timed && sprint },
        race?.notes ?? "",
      ),
    };
    setBusy(true);
    try {
      if (race) await updateRace(race.id, entry);
      else await createRace(entry);
      await qc.invalidateQueries({ queryKey: ["events"] });
      toast.success(t("Race saved to intervals.icu", "Gara salvata su intervals.icu"));
      onSaved?.();
    } catch {
      toast.error(t("Couldn't save the race", "Impossibile salvare la gara"));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!race) return;
    setBusy(true);
    try {
      await deleteEvent(race.id);
      await qc.invalidateQueries({ queryKey: ["events"] });
      toast.success(t("Race removed", "Gara rimossa"));
      onSaved?.();
    } catch {
      toast.error(t("Couldn't remove the race", "Impossibile rimuovere la gara"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2 space-y-1 sm:col-span-1">
          <Label htmlFor="race-name">{t("Name", "Nome")}</Label>
          <Input
            id="race-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={120}
          />
        </div>
        <div className="col-span-2 space-y-1 sm:col-span-1">
          <Label htmlFor="race-date">{t("Date", "Data")}</Label>
          <Input
            id="race-date"
            type="date"
            value={day}
            onChange={(e) => setDay(e.target.value)}
            required
          />
        </div>
      </div>
      <div className="space-y-1">
        <Label>{t("Discipline", "Disciplina")}</Label>
        <Choice
          value={discipline}
          options={DISCIPLINES[sport].map((d) => ({ key: d, label: DISCIPLINE_LABEL[d] }))}
          onChange={pickDiscipline}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="race-kind">{t("Kind", "Tipo")}</Label>
        <select
          id="race-kind"
          value={kind}
          onChange={(e) => setKind(e.target.value as RaceKind)}
          className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
        >
          {kinds.map((k) => (
            <option key={k} value={k} className="bg-popover">
              {KINDS[k].label}
            </option>
          ))}
        </select>
      </div>
      {timed ? (
        <div className="space-y-1">
          <Label htmlFor="race-time">{t("Estimated time", "Tempo stimato")}</Label>
          <Input
            id="race-time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            placeholder={formatMinutes(KINDS[kind].minutes!)}
          />
          <p className="text-xs text-muted-foreground">
            {t(
              "A 3-minute and a 1-hour effort need different training.",
              "Uno sforzo di 3 minuti e uno di un'ora richiedono allenamenti diversi.",
            )}
          </p>
        </div>
      ) : (
        <div className="flex items-start justify-between gap-4">
          <Label htmlFor="race-sprint" className="block space-y-1">
            <span className="block">{t("Sprint finish", "Arrivo in volata")}</span>
            <span className="block text-xs font-normal text-muted-foreground">
              {t(
                "Decided in a sprint, e.g. a flat granfondo.",
                "Si decide in volata, es. una granfondo pianeggiante.",
              )}
            </span>
          </Label>
          <Switch id="race-sprint" checked={sprint} onCheckedChange={setSprint} />
        </div>
      )}
      <div className="space-y-1">
        <Label>{t("Priority", "Priorità")}</Label>
        <Choice
          value={priority}
          options={(["A", "B", "C"] as const).map((k) => ({ key: k, label: k }))}
          onChange={setPriority}
        />
        <p className="text-xs text-muted-foreground">{PRIORITY_HINT[priority]}</p>
      </div>
      <Button type="submit" className="w-full" disabled={busy}>
        {busy
          ? t("Saving…", "Salvataggio…")
          : race
            ? t("Save race", "Salva gara")
            : t("Add race", "Aggiungi gara")}
      </Button>
      {race && (
        <Button
          type="button"
          variant="ghost"
          className="w-full text-lingon"
          disabled={busy}
          onClick={remove}
        >
          {t("Remove race", "Rimuovi gara")}
        </Button>
      )}
    </form>
  );
}
