import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { parseISO } from "date-fns";
import { useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { toast } from "sonner";
import { wellnessQuery } from "@/lib/queries";
import { saveWellnessEntry } from "@/lib/intervals";
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
      { name: "description", content: t("Weight, body fat and lean mass trends, plus manual logging.", "Andamento di peso, grasso corporeo e massa magra, con inserimento manuale.") },
      { property: "og:title", content: t("Body & Weight — Cirmolo", "Corpo e peso — Cirmolo") },
      { property: "og:description", content: t("Track weight and body composition alongside training.", "Monitora peso e composizione corporea insieme all'allenamento.") },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(wellnessQuery(180)),
  component: Body,
});

function Body() {
  const { data } = useSuspenseQuery(wellnessQuery(180));
  const weights = useMemo(
    () => data.filter((w) => w.weight != null).map((w) => ({ date: w.id, weight: w.weight!, bodyFat: w.bodyFat })),
    [data],
  );
  const fat = useMemo(() => data.filter((w) => w.bodyFat != null).map((w) => ({ date: w.id, bodyFat: w.bodyFat! })), [data]);
  const latest = weights.at(-1);
  const monthAgo = weights.find((w) => w.date >= isoDate(new Date(Date.now() - 30 * 86400000)));
  const delta = latest && monthAgo ? latest.weight - monthAgo.weight : null;
  const latestFat = fat.at(-1)?.bodyFat;
  const lean = latest && latest.bodyFat != null ? latest.weight * (1 - latest.bodyFat / 100) : null;

  return (
    <div className="space-y-6">
      <div>
        <div className="eyebrow">{t("Last 180 days", "Ultimi 180 giorni")}</div>
        <h1 className="text-3xl font-bold tracking-tight">{t("Body & Weight", "Corpo e peso")}</h1>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label={t("Weight", "Peso")} tone="weight" value={latest ? latest.weight.toFixed(1) : "–"} unit="kg" hint={latest ? format(parseISO(latest.date), "d MMM") : undefined} />
        <StatCard label={t("30d change", "Variazione 30g")} value={delta != null ? `${delta > 0 ? "+" : ""}${delta.toFixed(1)}` : "–"} unit="kg" />
        <StatCard label={t("Body fat", "Grasso corporeo")} value={latestFat != null ? latestFat.toFixed(1) : "–"} unit="%" />
        <StatCard label={t("Lean mass", "Massa magra")} tone="fitness" value={lean != null ? lean.toFixed(1) : "–"} unit="kg" />
      </div>
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="min-w-0 space-y-6">
          <Panel title={t("Weight", "Peso")}>
            <TrendChart data={weights} dataKey="weight" name={t("Weight", "Peso")} color="var(--weight)" />
          </Panel>
          <Panel title={t("Body fat", "Grasso corporeo")}>
            <TrendChart data={fat} dataKey="bodyFat" name={t("Body fat", "Grasso corporeo")} color="var(--form)" />
          </Panel>
        </div>
        <LogForm />
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
  if (data.length === 0) return <p className="py-10 text-center text-sm text-muted-foreground">{t("No data yet.", "Ancora nessun dato.")}</p>;
  return (
    <div className="h-56">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ left: -20, right: 4, top: 8 }}>
          <CartesianGrid stroke="var(--border)" vertical={false} />
          <XAxis dataKey="date" tickFormatter={(d) => format(parseISO(d), "d MMM")} stroke="var(--muted-foreground)" fontSize={11} minTickGap={40} />
          <YAxis domain={["dataMin - 1", "dataMax + 1"]} stroke="var(--muted-foreground)" fontSize={11} allowDecimals={false} />
          <Tooltip
            contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8 }}
            labelFormatter={(d) => format(parseISO(String(d)), "EEE d MMM yyyy")}
          />
          <Line type="monotone" dataKey={dataKey} name={name} stroke={color} strokeWidth={2} dot={{ r: 2 }} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function LogForm() {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [date, setDate] = useState(() => isoDate(new Date()));

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    const num = (k: string) => {
      const v = String(fd.get(k) ?? "").replace(",", ".").trim();
      return v ? Number(v) : undefined;
    };
    const comments = String(fd.get("comments") ?? "").trim() || undefined;
    const entry = { date, weight: num("weight"), bodyFat: num("bodyFat"), comments };
    if (!entry.weight && !entry.bodyFat && !comments) {
      toast.error(t("Enter at least one value", "Inserisci almeno un valore"));
      return;
    }
    setBusy(true);
    try {
      await saveWellnessEntry(entry);
      toast.success(t("Saved to intervals.icu", "Salvato su intervals.icu"));
      form.reset();
      await qc.invalidateQueries({ queryKey: ["wellness"] });
    } catch {
      toast.error(t("Couldn't save — check the values and try again", "Salvataggio non riuscito — controlla i valori e riprova"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel title={t("Log an entry", "Nuova registrazione")}>
      <form onSubmit={onSubmit} className="space-y-3">
        <div className="space-y-1">
          <Label htmlFor="date">{t("Date", "Data")}</Label>
          <Input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor="weight">{t("Weight (kg)", "Peso (kg)")}</Label>
            <Input id="weight" name="weight" inputMode="decimal" placeholder="72.4" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="bodyFat">{t("Body fat (%)", "Grasso corporeo (%)")}</Label>
            <Input id="bodyFat" name="bodyFat" inputMode="decimal" placeholder="14.2" />
          </div>
        </div>
        <div className="space-y-1">
          <Label htmlFor="comments">{t("Notes", "Note")}</Label>
          <Textarea id="comments" name="comments" rows={3} placeholder={t("Legs heavy, slept badly…", "Gambe pesanti, dormito male…")} />
        </div>
        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? t("Saving…", "Salvataggio…") : t("Save", "Salva")}
        </Button>
        <p className="text-xs text-muted-foreground">
          {t("Entries are saved to your intervals.icu wellness log.", "Le registrazioni vengono salvate nel diario benessere di intervals.icu.")}
        </p>
      </form>
    </Panel>
  );
}
