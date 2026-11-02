import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { parseISO } from "date-fns";
import { ChevronDown } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { toast } from "sonner";
import { wellnessQuery } from "@/lib/queries";
import type { Wellness } from "@/lib/intervals";
import { saveWellnessEntry } from "@/lib/source";
import { isoDate } from "@/lib/training";
import { Panel, StatCard } from "@/components/StatCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { format, t } from "@/lib/i18n";

export const Route = createFileRoute("/body")({
  head: () => ({
    meta: [
      { title: t("Body & Weight — Cirmolo", "Corpo e peso — Cirmolo") },
      {
        name: "description",
        content: t(
          "Weight, body fat and lean mass trends, plus manual logging.",
          "Andamento di peso, grasso corporeo e massa magra, con inserimento manuale.",
        ),
      },
      { property: "og:title", content: t("Body & Weight — Cirmolo", "Corpo e peso — Cirmolo") },
      {
        property: "og:description",
        content: t(
          "Track weight and body composition alongside training.",
          "Monitora peso e composizione corporea insieme all'allenamento.",
        ),
      },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(wellnessQuery(180)),
  component: Body,
});

function Body() {
  const { data } = useSuspenseQuery(wellnessQuery(180));
  const weights = useMemo(
    () =>
      data
        .filter((w) => w.weight != null)
        .map((w) => ({ date: w.id, weight: w.weight!, bodyFat: w.bodyFat })),
    [data],
  );
  const fat = useMemo(
    () => data.filter((w) => w.bodyFat != null).map((w) => ({ date: w.id, bodyFat: w.bodyFat! })),
    [data],
  );
  const latest = weights.at(-1);
  const monthAgo = weights.find((w) => w.date >= isoDate(new Date(Date.now() - 30 * 86400000)));
  const delta = latest && monthAgo ? latest.weight - monthAgo.weight : null;
  const latestFat = fat.at(-1)?.bodyFat;
  const lean = latest && latest.bodyFat != null ? latest.weight * (1 - latest.bodyFat / 100) : null;
  const [date, setDate] = useState(() => isoDate(new Date()));
  const formRef = useRef<HTMLDivElement>(null);
  const edit = (d: string) => {
    setDate(d);
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="space-y-6">
      <div>
        <div className="eyebrow">{t("Last 180 days", "Ultimi 180 giorni")}</div>
        <h1 className="text-3xl font-bold tracking-tight">{t("Body & Weight", "Corpo e peso")}</h1>
      </div>
      <div
        className={`grid grid-cols-2 gap-3 ${lean != null ? "md:grid-cols-4" : "md:grid-cols-3"}`}
      >
        <StatCard
          label={t("Weight", "Peso")}
          tone="weight"
          value={latest ? latest.weight.toFixed(1) : "–"}
          unit="kg"
          hint={latest ? format(parseISO(latest.date), "d MMM") : undefined}
        />
        <StatCard
          label={t("30d change", "Variazione 30g")}
          value={delta != null ? `${delta > 0 ? "+" : ""}${delta.toFixed(1)}` : "–"}
          unit="kg"
        />
        <StatCard
          label={t("Body fat", "Grasso corporeo")}
          value={latestFat != null ? latestFat.toFixed(1) : "–"}
          unit="%"
        />
        {/* Not logged directly: weight × (1 − body fat), so only once a weigh-in has a body fat value. */}
        {lean != null && (
          <StatCard
            label={t("Lean mass", "Massa magra")}
            tone="fitness"
            value={lean.toFixed(1)}
            unit="kg"
            hint={t("weight × (1 − body fat)", "peso × (1 − grasso)")}
          />
        )}
      </div>
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="min-w-0 space-y-6">
          <Panel title={t("Weight", "Peso")}>
            <TrendChart
              data={weights}
              dataKey="weight"
              name={t("Weight", "Peso")}
              color="var(--weight)"
            />
          </Panel>
          <Panel title={t("Body fat", "Grasso corporeo")}>
            <TrendChart
              data={fat}
              dataKey="bodyFat"
              name={t("Body fat", "Grasso corporeo")}
              color="var(--form)"
            />
          </Panel>
        </div>
        <div ref={formRef} className="scroll-mt-4 space-y-6">
          <LogForm data={data} date={date} setDate={setDate} />
          <RecentEntries data={data} current={date} onEdit={edit} />
        </div>
      </div>
    </div>
  );
}

function TrendChart({
  data,
  dataKey,
  name,
  color,
}: {
  data: { date: string }[];
  dataKey: string;
  name: string;
  color: string;
}) {
  if (data.length === 0)
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        {t("No data yet.", "Ancora nessun dato.")}
      </p>
    );
  return (
    <div className="h-56">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ left: -20, right: 4, top: 8 }}>
          <CartesianGrid stroke="var(--border)" vertical={false} />
          <XAxis
            dataKey="date"
            tickFormatter={(d) => format(parseISO(d), "d MMM")}
            stroke="var(--muted-foreground)"
            fontSize={11}
            minTickGap={40}
          />
          <YAxis
            domain={["dataMin - 1", "dataMax + 1"]}
            stroke="var(--muted-foreground)"
            fontSize={11}
            allowDecimals={false}
            // The domain ends sit 1 off the data (e.g. 71.38), so cap every tick at one decimal.
            tickFormatter={(v: number) => String(Math.round(v * 10) / 10)}
          />
          <Tooltip
            contentStyle={{
              background: "var(--popover)",
              border: "1px solid var(--border)",
              borderRadius: 8,
            }}
            labelFormatter={(d) => format(parseISO(String(d)), "EEE d MMM yyyy")}
          />
          <Line
            type="monotone"
            dataKey={dataKey}
            name={name}
            stroke={color}
            strokeWidth={2}
            dot={{ r: 2 }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

type Fields = { weight: string; bodyFat: string; comments: string };

const fieldsOf = (w: Wellness | undefined): Fields => ({
  weight: w?.weight != null ? String(w.weight) : "",
  bodyFat: w?.bodyFat != null ? String(w.bodyFat) : "",
  comments: w?.comments ?? "",
});

/** Logs a new day or edits a past one: the fields show what's already saved for the chosen date. */
function LogForm({
  data,
  date,
  setDate,
}: {
  data: Wellness[];
  date: string;
  setDate: (d: string) => void;
}) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  // Notes stay folded until asked for, and fold again when another day is picked.
  const [notesOpen, setNotesOpen] = useState(false);
  useEffect(() => setNotesOpen(false), [date]);
  const saved = data.find((w) => w.id === date);
  const before = fieldsOf(saved);
  const existing = !!(before.weight || before.bodyFat || before.comments);
  const [fields, setFields] = useState<Fields>(before);
  // Refill when another day is picked or fresh data arrives (after a save).
  const key = `${date}|${before.weight}|${before.bodyFat}|${before.comments}`;
  useEffect(() => setFields(fieldsOf(saved)), [key]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (k: keyof Fields) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setFields((f) => ({ ...f, [k]: e.target.value }));

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const num = (v: string) => {
      const s = v.replace(",", ".").trim();
      return s ? Number(s) : undefined;
    };
    // A field emptied on a day that had a value clears it; untouched blanks leave intervals.icu as it is.
    const clearable = <T,>(v: T | undefined, had: string) => (v === undefined && had ? null : v);
    const entry = {
      date,
      weight: clearable(num(fields.weight), before.weight),
      bodyFat: clearable(num(fields.bodyFat), before.bodyFat),
      comments: clearable(fields.comments.trim() || undefined, before.comments),
    };
    if (entry.weight === undefined && entry.bodyFat === undefined && entry.comments === undefined) {
      toast.error(t("Enter at least one value", "Inserisci almeno un valore"));
      return;
    }
    setBusy(true);
    try {
      await saveWellnessEntry(entry);
      toast.success(t("Saved to intervals.icu", "Salvato su intervals.icu"));
      await qc.invalidateQueries({ queryKey: ["wellness"] });
    } catch {
      toast.error(
        t(
          "Couldn't save — check the values and try again",
          "Salvataggio non riuscito — controlla i valori e riprova",
        ),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel
      title={
        existing
          ? t(
              `Edit ${format(parseISO(date), "d MMM")}`,
              `Modifica ${format(parseISO(date), "d MMM")}`,
            )
          : t("Log an entry", "Nuova registrazione")
      }
    >
      <form onSubmit={onSubmit} className="space-y-3">
        <div className="space-y-1">
          <Label htmlFor="date">{t("Date", "Data")}</Label>
          <Input
            id="date"
            type="date"
            value={date}
            max={isoDate(new Date())}
            onChange={(e) => setDate(e.target.value)}
            required
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor="weight">{t("Weight (kg)", "Peso (kg)")}</Label>
            <Input
              id="weight"
              inputMode="decimal"
              placeholder="72.4"
              value={fields.weight}
              onChange={set("weight")}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="bodyFat">{t("Body fat (%)", "Grasso corporeo (%)")}</Label>
            <Input
              id="bodyFat"
              inputMode="decimal"
              placeholder="14.2"
              value={fields.bodyFat}
              onChange={set("bodyFat")}
            />
          </div>
        </div>
        <div className="space-y-1">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="-ml-3"
            onClick={() => setNotesOpen((v) => !v)}
            aria-expanded={notesOpen}
            aria-controls="comments"
          >
            {t("Notes", "Note")}
            {!notesOpen && fields.comments.trim() && (
              <span className="font-normal text-muted-foreground">
                · {t("1 saved", "1 salvata")}
              </span>
            )}
            <ChevronDown className={`transition-transform ${notesOpen ? "rotate-180" : ""}`} />
          </Button>
          {notesOpen && (
            <Textarea
              id="comments"
              rows={3}
              placeholder={t("Legs heavy, slept badly…", "Gambe pesanti, dormito male…")}
              value={fields.comments}
              onChange={set("comments")}
            />
          )}
        </div>
        <Button type="submit" className="w-full" disabled={busy}>
          {busy
            ? t("Saving…", "Salvataggio…")
            : existing
              ? t("Save changes", "Salva modifiche")
              : t("Save", "Salva")}
        </Button>
        <p className="text-xs text-muted-foreground">
          {existing
            ? t(
                "Change or empty a field to fix this day in your intervals.icu wellness log.",
                "Modifica o svuota un campo per correggere questo giorno nel diario benessere di intervals.icu.",
              )
            : t(
                "Entries are saved to your intervals.icu wellness log.",
                "Le registrazioni vengono salvate nel diario benessere di intervals.icu.",
              )}
        </p>
      </form>
    </Panel>
  );
}

/** The latest days with a weigh-in, body fat or note, folded away until asked for; tapping one opens it in the form. */
function RecentEntries({
  data,
  current,
  onEdit,
}: {
  data: Wellness[];
  current: string;
  onEdit: (date: string) => void;
}) {
  const rows = data
    .filter((w) => w.weight != null || w.bodyFat != null || w.comments)
    .slice(-10)
    .reverse();
  const [open, setOpen] = useState(false);
  if (rows.length === 0) return null;
  return (
    <Panel
      title={t("Recent entries", "Registrazioni recenti")}
      action={
        <Button size="sm" variant="ghost" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
          {open ? t("Hide", "Nascondi") : t("Show", "Mostra")}
          <ChevronDown className={`transition-transform ${open ? "rotate-180" : ""}`} />
        </Button>
      }
    >
      {open && (
        <ul className="-mx-2 text-sm">
          {rows.map((w) => (
            <li key={w.id}>
              <button
                type="button"
                onClick={() => onEdit(w.id)}
                className={`flex w-full items-baseline gap-3 rounded-md px-2 py-1.5 text-left hover:bg-secondary/60 ${w.id === current ? "bg-secondary/60" : ""}`}
              >
                <span className="w-16 shrink-0 text-muted-foreground">
                  {format(parseISO(w.id), "d MMM")}
                </span>
                <span className="stat-num w-16 shrink-0">
                  {w.weight != null ? `${w.weight.toFixed(1)} kg` : "–"}
                </span>
                <span className="stat-num w-12 shrink-0">
                  {w.bodyFat != null ? `${w.bodyFat.toFixed(1)}%` : ""}
                </span>
                <span className="min-w-0 flex-1 truncate text-muted-foreground">
                  {w.comments ?? ""}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
