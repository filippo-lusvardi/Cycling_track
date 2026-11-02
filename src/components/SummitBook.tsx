import { Link } from "@tanstack/react-router";
import { parseISO } from "date-fns";
import { PenLine, Swords } from "lucide-react";
import { useEffect, useId, useMemo, useState } from "react";
import { toast } from "sonner";
import { effortKey } from "@/components/GhostRace";
import { Panel } from "@/components/StatCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { saveSummitNote, watchSummitNotes } from "@/lib/cloud";
import { format, t } from "@/lib/i18n";
import type { Attempt, Trace } from "@/lib/segments";
import { isMilestone, summitBook, type BookEntry } from "@/lib/summit";
import { rng, seedOf } from "@/lib/tree";
import { formatClock } from "@/lib/training";
import { cn } from "@/lib/utils";

type Effort = Attempt & { wkg: number | null };

/**
 * The libro di vetta: like the notebook in the box on an Alpine summit, every ascent of this climb signed in
 * order, chapters by year. Cairns mark the record and the records it beat; a short note signs an ascent.
 */
export function SummitBook({
  place,
  efforts,
  trace,
  loading,
  onRace,
}: {
  /** placeKey of the climb: where its notes are kept, the same on every device. */
  place: string;
  efforts: Effort[];
  trace: Trace | null;
  loading: boolean;
  onRace: (effort: string) => void;
}) {
  const book = useMemo(() => summitBook(efforts), [efforts]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<{ key: string; text: string } | null>(null);
  useEffect(() => watchSummitNotes(place, setNotes), [place]);

  async function sign(key: string, text: string) {
    setEditing(null);
    setNotes((n) => ({ ...n, [key]: text.trim() }));
    try {
      await saveSummitNote(place, key, text);
    } catch {
      toast.error(t("Couldn't save the note", "Impossibile salvare la nota"));
    }
  }

  return (
    <Panel title={t("Summit book", "Libro di vetta")}>
      {loading ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          {t("Loading rides…", "Caricamento attività…")}
        </p>
      ) : !book.count ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          {t(
            "No ascents found in the analysed rides.",
            "Nessuna salita trovata nelle attività analizzate.",
          )}
        </p>
      ) : (
        <div className="space-y-5">
          <Cover place={place} trace={trace} book={book} />
          {book.years.map(({ year, entries }) => (
            <section key={year}>
              <h3 className="eyebrow flex items-center gap-3">
                {year}
                <span className="h-px flex-1 bg-border" />
                <span className="stat-num normal-case tracking-normal">{entries.length}</span>
              </h3>
              <ol className="divide-y divide-border">
                {entries.map((b) => {
                  const key = effortKey(b.e);
                  return (
                    <Entry
                      key={key}
                      b={b}
                      note={notes[key]}
                      editing={editing?.key === key ? editing.text : null}
                      onEdit={(text) => setEditing(text == null ? null : { key, text })}
                      onSign={(text) => void sign(key, text)}
                      onRace={() => onRace(key)}
                    />
                  );
                })}
              </ol>
            </section>
          ))}
        </div>
      )}
    </Panel>
  );
}

function Entry({
  b,
  note,
  editing,
  onEdit,
  onSign,
  onRace,
}: {
  b: BookEntry<Effort>;
  note: string | undefined;
  /** The note being written, or null when not signing. */
  editing: string | null;
  onEdit: (text: string | null) => void;
  onSign: (text: string) => void;
  onRace: () => void;
}) {
  const { e, n, record, gap } = b;
  const label =
    record === "current"
      ? t("Record", "Record")
      : n === 1
        ? t("first ascent", "prima salita")
        : record === "then"
          ? t("record then", "record allora")
          : isMilestone(n)
            ? t(`ascent no. ${n}`, `salita n. ${n}`)
            : null;
  const facts = [
    e.wkg != null && `${e.wkg.toFixed(2)} W/kg`,
    e.vam != null && `VAM ${Math.round(e.vam)}`,
    e.avgWatts != null && `${Math.round(e.avgWatts)} W`,
    e.avgHr != null && `${Math.round(e.avgHr)} bpm`,
  ].filter(Boolean);

  return (
    <li className="flex items-start gap-3 py-3">
      <span className="flex w-6 shrink-0 justify-center pt-0.5">
        {record ? (
          <Cairn filled={record === "current"} />
        ) : isMilestone(n) ? (
          <span className="stat-num text-[11px] text-muted-foreground">{n}</span>
        ) : null}
      </span>
      <div className="min-w-0 flex-1">
        <Link to="/rides/$id" params={{ id: e.trackId }} className="hover:text-primary">
          <span className="text-sm">{format(parseISO(e.date), "d MMM")}</span>
          {label && (
            <span
              className={cn(
                "ml-2 text-xs",
                record === "current" ? "font-semibold text-birch" : "text-muted-foreground",
              )}
            >
              {label}
            </span>
          )}
        </Link>
        {facts.length > 0 && (
          <div className="stat-num text-xs text-muted-foreground">{facts.join(" · ")}</div>
        )}
        {editing != null ? (
          <form
            className="mt-2 flex gap-2"
            onSubmit={(ev) => {
              ev.preventDefault();
              onSign(editing);
            }}
          >
            <Input
              autoFocus
              maxLength={120}
              value={editing}
              onChange={(ev) => onEdit(ev.target.value)}
              onKeyDown={(ev) => ev.key === "Escape" && onEdit(null)}
              placeholder={t("windy, with Marco…", "vento, con Marco…")}
            />
            <Button type="submit" size="sm">
              {t("Sign", "Firma")}
            </Button>
          </form>
        ) : (
          note && <p className="mt-1 text-sm italic text-foreground/80">“{note}”</p>
        )}
      </div>
      <div className="stat-num shrink-0 text-right">
        <div className="text-base font-semibold">{formatClock(e.duration)}</div>
        {gap > 0 && <div className="text-xs text-muted-foreground">+{formatClock(gap)}</div>}
      </div>
      <div className="flex shrink-0 flex-col items-center">
        <button
          type="button"
          aria-label={
            note ? t("Edit note", "Modifica nota") : t("Sign this ascent", "Firma questa salita")
          }
          title={
            note ? t("Edit note", "Modifica nota") : t("Sign this ascent", "Firma questa salita")
          }
          onClick={() => onEdit(editing != null ? null : (note ?? ""))}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:text-primary active:bg-secondary/60"
        >
          <PenLine className="h-4 w-4" />
        </button>
        {gap > 0 && (
          <button
            type="button"
            aria-label={t("Race against the record", "Sfida il record")}
            title={t("Race against the record", "Sfida il record")}
            onClick={onRace}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:text-primary active:bg-secondary/60"
          >
            <Swords className="h-4 w-4" />
          </button>
        )}
      </div>
    </li>
  );
}

/** A stone cairn: filled in birch for the record, outlined for the records it beat. */
function Cairn({ filled }: { filled: boolean }) {
  const stone = filled
    ? { fill: "var(--birch)", stroke: "none" }
    : { fill: "none", stroke: "var(--muted-foreground)", strokeWidth: 1.2 };
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
      <ellipse cx="8" cy="13.2" rx="6.2" ry="2.3" {...stone} />
      <ellipse cx="8" cy="8.6" rx="4.4" ry="2" {...stone} />
      <ellipse cx="8" cy="4.6" rx="2.6" ry="1.6" {...stone} />
    </svg>
  );
}

/** Snow lies on the summit above this altitude (m): the Dolomites' passes above it keep their caps. */
const SNOWLINE = 1800;

/** A ridge for the far range: midpoint displacement from a seed, so each climb keeps its own mountains. */
function farRidge(seed: string, n: number, rough: number): number[] {
  const r = rng(seedOf(seed));
  const ys = new Array<number>(n + 1).fill(0);
  ys[0] = r();
  ys[n] = r();
  for (let step = n; step > 1; step = Math.floor(step / 2)) {
    const half = Math.floor(step / 2);
    for (let i = half; i < n; i += step)
      ys[i] = (ys[i - half]! + ys[Math.min(n, i + half)]!) / 2 + (r() - 0.5) * rough * (step / n);
  }
  const lo = Math.min(...ys);
  const hi = Math.max(...ys);
  return ys.map((y) => (y - lo) / (hi - lo || 1));
}

/**
 * The book's cover: a night scene in the Nordic palette. Two far ranges drawn from the climb's seed, then the
 * climb itself as the near ridge (its real profile), snow on it above the snowline, a summit cross where it tops
 * out, the altitudes at the foot and the top, and the book's count and record over the sky.
 */
function Cover({
  place,
  trace,
  book,
}: {
  place: string;
  trace: Trace | null;
  book: ReturnType<typeof summitBook<Effort>>;
}) {
  // Gradient and clip ids for this cover (useId's characters aren't safe inside url(#…)).
  const uid = `cover${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const record = book.years.flatMap((y) => y.entries).find((b) => b.record === "current");
  const W = 360;
  const H = 170;
  const ground = H - 6;
  const alt = trace?.alt.length ? trace.alt : null;
  const lo = alt ? Math.min(...alt) : 0;
  const hi = alt ? Math.max(...alt) : 1;
  const span = hi - lo || 1;
  // The near ridge rises through the lower half, leaving the sky on the left for the title; it stops short of
  // the edges so the summit cross and its altitude are never cut off.
  const yOf = (a: number) => ground - 8 - ((a - lo) / span) * (H * 0.5);
  const xOf = (d: number) => 4 + (d / (trace!.dist.at(-1) || 1)) * (W - 30);
  const near = alt ? trace!.dist.map((d, i) => [xOf(d), yOf(alt[i]!)] as const) : [];
  const nearLine = near.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const summit = near.reduce((m, p, i) => (alt![i]! > alt![m]! ? i : m), 0);
  const [sx, sy] = near[summit] ?? [W * 0.8, H * 0.4];
  const range = (seed: string, top: number, depth: number) => {
    const ys = farRidge(`${place}${seed}`, 32, 1.4);
    const pts = ys.map(
      (y, i) => `${((i / 32) * W).toFixed(1)},${(top + (1 - y) * depth).toFixed(1)}`,
    );
    return `0,${H} ${pts.join(" ")} ${W},${H}`;
  };
  const stars = useMemo(() => {
    const r = rng(seedOf(`${place}stars`));
    return Array.from({ length: 22 }, () => [r() * W, r() * H * 0.5, 0.3 + r() * 0.6] as const);
  }, [place]);
  const snowY = hi > SNOWLINE ? yOf(SNOWLINE) : null;
  // Snow lies on the mountain, not in a block under a level line: a cap draped over the crest, deepest at the
  // summit and thinning to nothing at the snowline, its lower edge wandering a little. It runs on down the far
  // side of the summit too. Seeded, so each climb keeps its own snow.
  const farFoot = near.length ? Math.min(H, near.at(-1)![1] + 52) : H;
  const snowCap = useMemo(() => {
    if (snowY == null || near.length < 2) return "";
    const altAt = (y: number) => lo + ((ground - 8 - y) / (H * 0.5)) * span;
    const [ex, ey] = near.at(-1)!;
    // The ridge as drawn, near side then the far slope down to the edge.
    const crest: (readonly [number, number])[] = [
      ...near,
      ...Array.from({ length: 12 }, (_, k) => {
        const f = (k + 1) / 12;
        return [ex + (W - ex) * f, ey + (farFoot - ey) * f] as const;
      }),
    ];
    const wander = farRidge(`${place}snow`, 32, 1.6);
    const deepest = 22;
    const upper: string[] = [];
    const lower: string[] = [];
    crest.forEach(([x, y], i) => {
      const above = (altAt(y) - SNOWLINE) / (hi - SNOWLINE || 1);
      if (above <= 0) return;
      const wob = 0.75 + wander[Math.round((i / (crest.length - 1)) * 32)]! * 0.5;
      upper.push(`${x.toFixed(1)},${(y - 0.6).toFixed(1)}`);
      lower.push(`${x.toFixed(1)},${(y + deepest * above ** 0.85 * wob).toFixed(1)}`);
    });
    return upper.length > 1 ? `${upper.join(" ")} ${lower.reverse().join(" ")}` : "";
    // near/lo/span/hi derive from trace, which place and snowY already follow.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [place, snowY, trace]);

  return (
    <div className="relative -mx-4 -mt-2 overflow-hidden sm:mx-0 sm:rounded-lg">
      <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" aria-hidden>
        <defs>
          <linearGradient id={`${uid}sky`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--background)" />
            <stop
              offset="1"
              style={{ stopColor: "color-mix(in oklab, var(--primary) 14%, var(--card))" }}
            />
          </linearGradient>
          <linearGradient id={`${uid}near`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--secondary)" />
            <stop offset="1" stopColor="var(--background)" />
          </linearGradient>
          <linearGradient id={`${uid}snowfill`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--snow)" stopOpacity={0.95} />
            <stop offset="1" stopColor="var(--snow)" stopOpacity={0.7} />
          </linearGradient>
        </defs>
        <rect width={W} height={H} fill={`url(#${uid}sky)`} />
        {stars.map(([x, y, o], i) => (
          <circle key={i} cx={x} cy={y} r={0.7} fill="var(--snow)" opacity={o} />
        ))}
        <polygon points={range("far", H * 0.38, H * 0.3)} fill="var(--border)" opacity={0.45} />
        <polygon points={range("mid", H * 0.5, H * 0.28)} fill="var(--muted)" opacity={0.8} />
        {near.length > 1 && (
          <>
            <polygon
              points={`0,${H} 0,${near[0]![1]} ${nearLine} ${W},${farFoot} ${W},${H}`}
              fill={`url(#${uid}near)`}
            />
            {snowCap && <polygon points={snowCap} fill={`url(#${uid}snowfill)`} />}
            <polyline
              points={nearLine}
              fill="none"
              stroke="var(--primary)"
              strokeWidth={1.6}
              strokeLinejoin="round"
            />
            {/* The summit cross, as on every peak of the Alps. */}
            <g stroke="var(--foreground)" strokeWidth={1.4} strokeLinecap="round">
              <line x1={sx} y1={sy} x2={sx} y2={sy - 16} />
              <line x1={sx - 4.5} y1={sy - 11.5} x2={sx + 4.5} y2={sy - 11.5} />
            </g>
            <text
              x={Math.min(sx, W - 18)}
              y={sy - 21}
              textAnchor="middle"
              className="stat-num"
              fontSize={9}
              fill="var(--foreground)"
            >
              {Math.round(hi)} m
            </text>
            <text
              x={6}
              y={near[0]![1] - 6}
              className="stat-num"
              fontSize={9}
              fill="var(--muted-foreground)"
            >
              {Math.round(alt![0]!)} m
            </text>
          </>
        )}
      </svg>
      <div className="absolute left-0 top-0 p-4 sm:p-3">
        <div className="flex items-baseline gap-2">
          <span className="text-3xl font-bold leading-none tracking-tight">{book.count}</span>
          <span className="text-xs text-muted-foreground">
            {t(
              `${book.count === 1 ? "ascent" : "ascents"} since ${format(parseISO(book.since!), "MMM yyyy")}`,
              `${book.count === 1 ? "salita" : "salite"} da ${format(parseISO(book.since!), "MMM yyyy")}`,
            )}
          </span>
        </div>
        {record && (
          <div className="mt-2 flex items-center gap-1.5">
            <Cairn filled />
            <span className="stat-num text-base font-semibold text-birch">
              {formatClock(record.e.duration)}
            </span>
            <span className="text-xs text-muted-foreground">
              {format(parseISO(record.e.date), "d MMM yyyy")}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
