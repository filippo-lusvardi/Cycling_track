// Gear: bikes and shoes, how far each has gone, the parts that wear and what was done to them. One gear opens with its
// drawing (each part tinted by how worn it is), how long its parts last, and its log.
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { parseISO } from "date-fns";
import {
  Archive,
  ArchiveRestore,
  Droplets,
  NotebookPen,
  Pencil,
  Plus,
  RefreshCw,
  Star,
  Trash2,
  Wrench,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  BikeDrawing,
  DRAWN,
  GearIcon,
  ShoeDrawing,
  wearTone,
  type Drawn,
  type PartState,
} from "@/components/gear/GearDrawing";
import { AddGearSheet, EditGearSheet, EventSheet, PartSheet } from "@/components/gear/GearSheets";
import { Panel } from "@/components/StatCard";
import {
  componentKm,
  current,
  DUE,
  dueOn,
  eventTitle,
  FRAME_LABEL,
  gearKm,
  GEAR_KIND_LABEL,
  kmAt,
  kmSinceWash,
  kmText,
  lifetimes,
  makeDefault,
  PARTS,
  ridesByGear,
  removeEvent,
  shoeHistory,
  SLOT_LABEL,
  wearRatio,
  type EventKind,
  type Gear,
  type GearKind,
  type PartKind,
} from "@/lib/gear";
import { removeGear, saveGear, useGearState } from "@/lib/gear-store";
import { format, num, t } from "@/lib/i18n";
import { allActivitiesQuery } from "@/lib/queries";
import { isoDate } from "@/lib/training";
import { cn } from "@/lib/utils";

type Search = { id?: string; part?: PartKind };

export const Route = createFileRoute("/gear")({
  validateSearch: (s: Record<string, unknown>): Search => ({
    ...(typeof s["id"] === "string" ? { id: s["id"] } : {}),
    ...(typeof s["part"] === "string" && s["part"] in PARTS ? { part: s["part"] as PartKind } : {}),
  }),
  component: GearPage,
});

type Act = { id: string; type: string | null; start_date_local: string; distance: number | null };

function GearPage() {
  const { id, part } = Route.useSearch();
  const { gears, overrides, ready } = useGearState();
  const { data: acts } = useQuery(allActivitiesQuery());
  const byGear = useMemo(() => ridesByGear(acts ?? [], gears, overrides), [acts, gears, overrides]);
  const gear = id ? gears.find((g) => g.id === id) : undefined;
  if (id && gear)
    return (
      <GearDetail key={gear.id} gear={gear} gears={gears} byGear={byGear} part={part ?? null} />
    );
  if (id && ready)
    return (
      <div className="space-y-3">
        <BackToList />
        <p className="text-sm text-muted-foreground">
          {t("This gear is no longer here.", "Questa attrezzatura non c'è più.")}
        </p>
      </div>
    );
  return <GearList gears={gears} byGear={byGear} ready={ready} />;
}

const BackToList = () => (
  <Link to="/gear" search={{}} className="eyebrow hover:text-foreground">
    {t("Gear", "Attrezzatura")}
  </Link>
);

// --- the list ---

function GearList({
  gears,
  byGear,
  ready,
}: {
  gears: Gear[];
  byGear: Map<string, Act[]>;
  ready: boolean;
}) {
  const [adding, setAdding] = useState(false);
  const [showRetired, setShowRetired] = useState(false);
  const navigate = useNavigate();
  const inUse = gears.filter((g) => !g.retired);
  const retired = gears.filter((g) => g.retired);
  const count = (k: GearKind) => inUse.filter((g) => g.kind === k).length;
  const summary = [
    count("bike") &&
      t(`${count("bike")} ${count("bike") === 1 ? "bike" : "bikes"}`, `${count("bike")} bici`),
    count("shoes") &&
      t(
        `${count("shoes")} ${count("shoes") === 1 ? "pair of shoes" : "pairs of shoes"}`,
        `${count("shoes")} ${count("shoes") === 1 ? "paio" : "paia"} di scarpe`,
      ),
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between gap-3">
        <div>
          {summary && <div className="eyebrow">{summary}</div>}
          <h1 className="on-sky text-3xl font-bold tracking-tight">{t("Gear", "Attrezzatura")}</h1>
        </div>
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-secondary px-4 text-sm font-medium"
        >
          <Plus className="h-4 w-4" />
          {t("Add", "Aggiungi")}
        </button>
      </div>
      {ready && !gears.length && (
        <div className="rounded-xl border border-border bg-card p-6 text-center">
          <BikeDrawing mini className="mx-auto h-20 w-32" />
          <p className="mt-3 text-sm text-muted-foreground">
            {t(
              "Add your bike or your shoes: your activities count their km, and the parts that wear keep their own.",
              "Aggiungi la tua bici o le tue scarpe: le attività ne contano i km, e le parti che si consumano hanno i loro.",
            )}
          </p>
        </div>
      )}
      {(["bike", "shoes"] as const).map((k) => {
        const list = inUse.filter((g) => g.kind === k);
        return list.length ? (
          <section key={k} className="space-y-2">
            <div className="eyebrow">{GEAR_KIND_LABEL[k]()}</div>
            {list.map((g) => (
              <GearCard key={g.id} g={g} rides={byGear.get(g.id) ?? []} />
            ))}
          </section>
        ) : null;
      })}
      {retired.length > 0 && (
        <section className="space-y-2">
          <button
            type="button"
            onClick={() => setShowRetired((v) => !v)}
            className="eyebrow flex min-h-8 items-center gap-1 hover:text-foreground"
          >
            <Archive className="h-3.5 w-3.5" />
            {t(`Retired (${retired.length})`, `In pensione (${retired.length})`)}
          </button>
          {showRetired &&
            retired.map((g) => <GearCard key={g.id} g={g} rides={byGear.get(g.id) ?? []} />)}
        </section>
      )}
      {adding && (
        <AddGearSheet
          open
          onOpenChange={setAdding}
          gears={gears}
          onAdded={(g) => void navigate({ to: "/gear", search: { id: g.id } })}
        />
      )}
    </div>
  );
}

function subtitle(g: Gear) {
  const text = [
    g.kind === "bike" ? FRAME_LABEL[g.frame ?? "road"]() : null,
    g.isDefault && !g.retired ? SLOT_LABEL[g.slot]() : null,
    g.retired
      ? t(`retired ${dayShort(g.retired)}`, `in pensione dal ${dayShort(g.retired)}`)
      : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

const dayShort = (d: string) => format(parseISO(d), "d MMM yyyy");

function GearCard({ g, rides }: { g: Gear; rides: Act[] }) {
  const km = gearKm(g, rides);
  const due = g.retired ? [] : dueOn(g, rides);
  return (
    <Link
      to="/gear"
      search={{ id: g.id }}
      className={cn(
        "flex w-full items-center gap-3 rounded-xl border border-border bg-card p-3 text-left transition-colors hover:bg-secondary",
        g.retired && "opacity-60",
      )}
    >
      <span className="flex h-14 w-20 shrink-0 items-center justify-center rounded-lg bg-secondary/60">
        <GearIcon kind={g.kind} frame={g.frame} className="h-12 w-[4.5rem]" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-2">
          <span className="truncate font-medium">{g.name}</span>
          <span className="stat-num shrink-0 font-semibold">
            {num(Math.round(km))}
            <span className="ml-1 text-xs text-muted-foreground">km</span>
          </span>
        </span>
        <span className="block text-xs text-muted-foreground">
          {subtitle(g)}
          {g.kind === "shoes" && g.intervalKm
            ? `${subtitle(g) ? " · " : ""}${t(`${num(Math.round(km))} of ${num(g.intervalKm)} km`, `${num(Math.round(km))} su ${num(g.intervalKm)} km`)}`
            : ""}
        </span>
        {due.length > 0 && (
          <span className="mt-0.5 block text-xs" style={{ color: "var(--z5)" }}>
            {g.kind === "shoes"
              ? t("Nearly at the end of their life", "Quasi a fine vita")
              : t(
                  `Nearly due: ${listText(due.map((d) => d.label.toLowerCase()))}`,
                  `Quasi da cambiare: ${listText(due.map((d) => d.label.toLowerCase()))}`,
                )}
          </span>
        )}
      </span>
    </Link>
  );
}

const listText = (xs: string[]) =>
  xs.length < 2 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} ${t("and", "e")} ${xs.at(-1)}`;

// --- one gear ---

type Sheet =
  | { kind: "event"; initial?: { kind?: EventKind; part?: PartKind } }
  | { kind: "part"; part: PartKind }
  | { kind: "edit" }
  | null;

function GearDetail({
  gear,
  gears,
  byGear,
  part,
}: {
  gear: Gear;
  gears: Gear[];
  byGear: Map<string, Act[]>;
  part: PartKind | null;
}) {
  const navigate = useNavigate();
  const rides = byGear.get(gear.id) ?? [];
  const [selected, setSelected] = useState<Drawn | null>(
    part ?? (gear.kind === "shoes" ? "sole" : null),
  );
  const [sheet, setSheet] = useState<Sheet>(null);
  const km = gearKm(gear, rides);
  const first = rides.map((a) => a.start_date_local.slice(0, 4)).sort()[0];
  const count = rides.length;
  const sub = [
    subtitle(gear),
    count
      ? gear.kind === "shoes"
        ? t(
            `${count} ${count === 1 ? "run" : "runs"} since ${first}`,
            `${count} ${count === 1 ? "corsa" : "corse"} dal ${first}`,
          )
        : t(
            `${count} ${count === 1 ? "ride" : "rides"} since ${first}`,
            `${count} ${count === 1 ? "uscita" : "uscite"} dal ${first}`,
          )
      : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const today = isoDate(new Date());
  const setDefault = () => void saveGear(...makeDefault(gears, gear.id));
  const retire = () => {
    void saveGear({ ...gear, retired: gear.retired ? null : today, updatedAt: Date.now() });
  };
  const remove = () => {
    if (
      !window.confirm(
        t(`Delete ${gear.name} and its log?`, `Eliminare ${gear.name} e il suo diario?`),
      )
    )
      return;
    void removeGear(gear.id);
    void navigate({ to: "/gear", search: {} });
    toast(t("Deleted", "Eliminata"), {
      action: { label: t("Undo", "Annulla"), onClick: () => void saveGear(gear) },
    });
  };
  const pick = (p: Drawn | null) => {
    setSelected((s) => (s === p ? null : p));
  };
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <BackToList />
          <h1 className="on-sky text-3xl font-bold tracking-tight">{gear.name}</h1>
          {sub && <p className="mt-1 text-sm text-foreground/85">{sub}</p>}
        </div>
        <div className="stat-num text-3xl font-semibold">
          {num(Math.round(km))}
          <span className="ml-1 text-sm text-muted-foreground">km</span>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {!gear.isDefault && !gear.retired && (
          <Pill icon={Star} onClick={setDefault}>
            {gear.kind === "shoes"
              ? t("Use for runs", "Usale per le corse")
              : gear.slot === "indoor"
                ? t("Use for indoor rides", "Usala per le uscite al chiuso")
                : t("Use for rides", "Usala per le uscite")}
          </Pill>
        )}
        <Pill icon={Pencil} onClick={() => setSheet({ kind: "edit" })}>
          {t("Edit", "Modifica")}
        </Pill>
        <Pill icon={gear.retired ? ArchiveRestore : Archive} onClick={retire}>
          {gear.retired ? t("Back in use", "Di nuovo in uso") : t("Retire", "In pensione")}
        </Pill>
        <Pill icon={Trash2} onClick={remove}>
          {t("Delete", "Elimina")}
        </Pill>
      </div>
      <div className="grid items-start gap-4 lg:grid-cols-[1.35fr_1fr]">
        <div className="space-y-4">
          {gear.kind === "bike" ? (
            <BikePanel
              gear={gear}
              rides={rides}
              selected={selected}
              onSelect={pick}
              onSheet={setSheet}
            />
          ) : (
            <ShoePanel gear={gear} km={km} onSheet={setSheet} onRetire={retire} />
          )}
          <LogPanel
            className="hidden lg:block"
            gear={gear}
            rides={rides}
            onAdd={() => setSheet({ kind: "event" })}
          />
        </div>
        <Panel title={t("How long they last", "Quanto durano")}>
          {gear.kind === "bike" ? (
            <BikeLives gear={gear} rides={rides} selected={selected} onSelect={pick} />
          ) : (
            <ShoeLives gear={gear} km={km} gears={gears} byGear={byGear} />
          )}
        </Panel>
        <LogPanel
          className="lg:hidden"
          gear={gear}
          rides={rides}
          onAdd={() => setSheet({ kind: "event" })}
        />
      </div>
      {sheet?.kind === "event" && (
        <EventSheet open onOpenChange={() => setSheet(null)} gear={gear} initial={sheet.initial} />
      )}
      {sheet?.kind === "part" && (
        <PartSheet
          open
          onOpenChange={() => setSheet(null)}
          gear={gear}
          part={sheet.part}
          component={current(gear, sheet.part)}
        />
      )}
      {sheet?.kind === "edit" && (
        <EditGearSheet open onOpenChange={() => setSheet(null)} gear={gear} />
      )}
    </div>
  );
}

function Pill({
  icon: Icon,
  onClick,
  children,
  primary,
}: {
  icon: typeof Star;
  onClick: () => void;
  children: React.ReactNode;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 text-sm",
        primary
          ? "bg-primary font-medium text-primary-foreground"
          : "bg-secondary hover:text-foreground",
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {children}
    </button>
  );
}

function BikePanel({
  gear,
  rides,
  selected,
  onSelect,
  onSheet,
}: {
  gear: Gear;
  rides: Act[];
  selected: Drawn | null;
  onSelect: (p: Drawn | null) => void;
  onSheet: (s: Sheet) => void;
}) {
  const parts = Object.fromEntries(
    DRAWN.map((p): [PartKind, PartState] => {
      const c = current(gear, p);
      return [
        p,
        c
          ? { tracked: true, ratio: wearRatio(componentKm(c, rides), c.intervalKm) }
          : { tracked: false },
      ];
    }),
  );
  const washed = kmSinceWash(gear, rides);
  const sel = selected && selected !== "sole" ? selected : null;
  return (
    <Panel
      title={t("The bike", "La bici")}
      action={
        <button
          type="button"
          onClick={() => onSheet({ kind: "event", initial: { kind: "wash" } })}
          className="inline-flex min-h-8 items-center gap-1.5 rounded-full px-2 text-xs text-muted-foreground hover:text-foreground"
        >
          <Droplets className="h-3.5 w-3.5" style={{ color: "var(--fitness)" }} />
          {washed == null
            ? t("Never washed here", "Nessun lavaggio annotato")
            : washed < 1
              ? t("Just washed", "Appena lavata")
              : t(`Washed ${kmText(washed)} ago`, `Lavata ${kmText(washed)} fa`)}
        </button>
      }
    >
      <BikeDrawing
        frame={gear.frame ?? "road"}
        parts={parts}
        selected={sel}
        onSelect={onSelect}
        className="w-full"
      />
      {sel ? (
        <PartCard
          gear={gear}
          part={sel}
          rides={rides}
          onClose={() => onSelect(null)}
          onSheet={onSheet}
        />
      ) : (
        <p className="mt-2 text-center text-xs text-muted-foreground">
          {t(
            "Tap a part to see it or follow it.",
            "Tocca una parte per vederla o iniziare a seguirla.",
          )}
        </p>
      )}
      <Legend />
    </Panel>
  );
}

function Legend() {
  const items: [string, string][] = [
    ["var(--primary)", t("in use", "in uso")],
    ["var(--z5)", t("nearly due", "quasi da cambiare")],
    ["var(--lingon)", t("past it", "oltre")],
    [
      "color-mix(in oklab, var(--muted-foreground) 40%, transparent)",
      t("not followed: tap to start", "non seguito: tocca per iniziare"),
    ],
  ];
  return (
    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {items.map(([c, l]) => (
        <span key={l} className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm" style={{ background: c }} />
          {l}
        </span>
      ))}
    </div>
  );
}

function PartCard({
  gear,
  part,
  rides,
  onClose,
  onSheet,
}: {
  gear: Gear;
  part: PartKind;
  rides: Act[];
  onClose: () => void;
  onSheet: (s: Sheet) => void;
}) {
  const c = current(gear, part);
  const km = c ? componentKm(c, rides) : 0;
  const ratio = c ? wearRatio(km, c.intervalKm) : null;
  const left = c?.intervalKm ? c.intervalKm - km : null;
  return (
    <div className="mt-2 rounded-xl border border-border bg-secondary/50 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="eyebrow">
            {[PARTS[part].label(), c?.name].filter(Boolean).join(" · ")}
          </div>
          {c ? (
            <>
              <div
                className="stat-num mt-1 text-2xl font-semibold"
                style={{ color: wearTone({ tracked: true, ratio }) }}
              >
                {num(Math.round(km))}
                <span className="ml-1 text-sm text-muted-foreground">
                  {c.intervalKm
                    ? t(`of ${num(c.intervalKm)} km`, `su ${num(c.intervalKm)} km`)
                    : "km"}
                </span>
              </div>
              <div className="mt-0.5 text-xs text-muted-foreground">
                {[
                  t(`On since ${dayShort(c.fitted)}`, `Montaggio: ${dayShort(c.fitted)}`),
                  left == null
                    ? null
                    : left >= 0
                      ? t(`${kmText(left)} to go`, `mancano ${kmText(left)}`)
                      : t(`${kmText(-left)} past it`, `${kmText(-left)} oltre`),
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </div>
            </>
          ) : (
            <div className="mt-1 text-sm text-muted-foreground">
              {t("Not followed yet.", "Non ancora seguito.")}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={t("Close", "Chiudi")}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {c ? (
          <>
            <Pill
              primary
              icon={RefreshCw}
              onClick={() => onSheet({ kind: "event", initial: { kind: "replace", part } })}
            >
              {t("Replaced", "Sostituito")}
            </Pill>
            <Pill
              icon={NotebookPen}
              onClick={() => onSheet({ kind: "event", initial: { kind: "note", part } })}
            >
              {t("Note", "Nota")}
            </Pill>
            <Pill icon={Pencil} onClick={() => onSheet({ kind: "part", part })}>
              {c.intervalKm
                ? t(`Every ${num(c.intervalKm)} km`, `Ogni ${num(c.intervalKm)} km`)
                : t("Interval", "Intervallo")}
            </Pill>
          </>
        ) : (
          <>
            <Pill primary icon={Plus} onClick={() => onSheet({ kind: "part", part })}>
              {t("Already on the bike", "Già montato")}
            </Pill>
            <Pill
              icon={RefreshCw}
              onClick={() => onSheet({ kind: "event", initial: { kind: "replace", part } })}
            >
              {t("Just fitted a new one", "Appena montato nuovo")}
            </Pill>
          </>
        )}
      </div>
    </div>
  );
}

function ShoePanel({
  gear,
  km,
  onSheet,
  onRetire,
}: {
  gear: Gear;
  km: number;
  onSheet: (s: Sheet) => void;
  onRetire: () => void;
}) {
  const ratio = wearRatio(km, gear.intervalKm);
  const left = gear.intervalKm ? gear.intervalKm - km : null;
  return (
    <Panel title={t("The shoes", "Le scarpe")}>
      <ShoeDrawing parts={{ sole: { tracked: true, ratio } }} selected="sole" className="w-full" />
      <div className="mt-2 rounded-xl border border-border bg-secondary/50 p-3">
        <div className="eyebrow">{t("Sole and midsole", "Suola e intersuola")}</div>
        <div
          className="stat-num mt-1 text-2xl font-semibold"
          style={{ color: wearTone({ tracked: true, ratio }) }}
        >
          {num(Math.round(km))}
          <span className="ml-1 text-sm text-muted-foreground">
            {gear.intervalKm
              ? t(`of ${num(gear.intervalKm)} km`, `su ${num(gear.intervalKm)} km`)
              : "km"}
          </span>
        </div>
        <div className="mt-0.5 text-xs text-muted-foreground">
          {[
            t(`Since ${dayShort(gear.since)}`, `Dal ${dayShort(gear.since)}`),
            left == null
              ? null
              : left >= 0
                ? t(`${kmText(left)} to go`, `mancano ${kmText(left)}`)
                : t(`${kmText(-left)} past it`, `${kmText(-left)} oltre`),
          ]
            .filter(Boolean)
            .join(" · ")}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {!gear.retired && (
            <Pill primary={ratio != null && ratio >= DUE} icon={Archive} onClick={onRetire}>
              {t("Retire", "In pensione")}
            </Pill>
          )}
          <Pill
            icon={NotebookPen}
            onClick={() => onSheet({ kind: "event", initial: { kind: "note" } })}
          >
            {t("Note", "Nota")}
          </Pill>
          <Pill icon={Pencil} onClick={() => onSheet({ kind: "edit" })}>
            {gear.intervalKm
              ? t(`Every ${num(gear.intervalKm)} km`, `Ogni ${num(gear.intervalKm)} km`)
              : t("Interval", "Intervallo")}
          </Pill>
        </div>
      </div>
    </Panel>
  );
}

/** One row: the thick bar is the one on now, faint lines the ones before, the tick when to change it. */
function LifeRow({
  label,
  km,
  interval,
  past,
  usual,
  on,
  dim,
  onClick,
  note,
}: {
  label: string;
  km: number | null;
  interval: number | null;
  past: number[];
  usual: number | null;
  on?: boolean;
  dim?: boolean;
  onClick?: () => void;
  note?: string | null;
}) {
  const max = Math.max(km ?? 0, interval ?? 0, ...past, 1) * 1.04;
  const w = (k: number) => `${Math.min(100, (k / max) * 100)}%`;
  const c = wearTone({ tracked: true, ratio: km == null ? null : wearRatio(km, interval) });
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={cn(
        "block w-full rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-secondary",
        on && "bg-secondary",
        dim && "opacity-55",
      )}
    >
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="truncate">{label}</span>
        <span className="stat-num shrink-0">
          {km == null ? (
            <span className="text-xs text-muted-foreground">{t("none on", "non montato")}</span>
          ) : (
            <span style={{ color: c }}>{num(Math.round(km))}</span>
          )}
          {interval && <span className="text-xs text-muted-foreground"> / {num(interval)}</span>}
        </span>
      </div>
      <div className="relative mt-1.5 h-2.5 rounded-full bg-background/60">
        {km != null && (
          <div className="h-full rounded-full" style={{ width: w(km), background: c }} />
        )}
        {interval && (
          <div
            className="absolute -top-1 h-[1.125rem] w-0.5 rounded bg-foreground/70"
            style={{ left: w(interval) }}
          />
        )}
      </div>
      {past.map((k, i) => (
        <div
          key={i}
          className="mt-1 h-1 rounded-full bg-foreground/20"
          style={{ width: w(k) }}
          title={kmText(k)}
        />
      ))}
      {usual != null ? (
        <div className="mt-1 text-xs text-muted-foreground">
          {t(
            `Usually lasts you about ${kmText(round10(usual))}`,
            `Di solito ti dura circa ${kmText(round10(usual))}`,
          )}
        </div>
      ) : past.length === 1 ? (
        <div className="mt-1 text-xs text-muted-foreground">
          {t(`The one before: ${kmText(past[0]!)}`, `Il precedente: ${kmText(past[0]!)}`)}
        </div>
      ) : null}
      {note && <div className="mt-1 text-xs text-muted-foreground">{note}</div>}
    </button>
  );
}

const round10 = (k: number) => Math.round(k / 10) * 10;

function BikeLives({
  gear,
  rides,
  selected,
  onSelect,
}: {
  gear: Gear;
  rides: Act[];
  selected: Drawn | null;
  onSelect: (p: Drawn | null) => void;
}) {
  const lives = lifetimes(gear, rides);
  if (!lives.length)
    return (
      <p className="px-2 text-sm text-muted-foreground">
        {t(
          "No part followed yet. Tap one on the bike, or log a replacement.",
          "Nessuna parte seguita. Toccane una sulla bici, o annota una sostituzione.",
        )}
      </p>
    );
  return (
    <div className="space-y-3.5">
      {lives.map((l) => (
        <LifeRow
          key={l.part}
          label={l.label}
          km={l.current?.km ?? null}
          interval={l.current?.interval ?? null}
          past={l.past.map((p) => p.km)}
          usual={l.usual}
          on={selected === l.part}
          dim={!!selected && selected !== l.part}
          onClick={() => onSelect(l.part)}
        />
      ))}
      <p className="px-2 text-xs text-muted-foreground">
        {t(
          "Full bar: the one on now. Faint lines: the ones before. Tick: when to change it.",
          "Barra piena: quello montato ora. Righe chiare: i precedenti. Tacca: quando cambiarlo.",
        )}
      </p>
    </div>
  );
}

function ShoeLives({
  gear,
  km,
  gears,
  byGear,
}: {
  gear: Gear;
  km: number;
  gears: Gear[];
  byGear: Map<string, Act[]>;
}) {
  const past = shoeHistory(gears, byGear, gear.id);
  const usual = past.length >= 2 ? past.reduce((s, p) => s + p.km, 0) / past.length : null;
  return (
    <LifeRow
      label={gear.name}
      km={km}
      interval={gear.intervalKm ?? null}
      past={past.map((p) => p.km)}
      usual={usual}
      on
      note={
        past.length
          ? t(
              `Faint lines: ${listText(past.slice(0, 4).map((p) => `${p.name} (${kmText(p.km)})`))}.`,
              `Righe chiare: ${listText(past.slice(0, 4).map((p) => `${p.name} (${kmText(p.km)})`))}.`,
            )
          : t(
              "Retired pairs show here, to see how long yours last.",
              "Le paia in pensione compaiono qui, per vedere quanto ti durano.",
            )
      }
    />
  );
}

const EVENT_STYLE: Record<EventKind, { icon: typeof Droplets; color: string }> = {
  wash: { icon: Droplets, color: "var(--fitness)" },
  replace: { icon: RefreshCw, color: "var(--primary)" },
  service: { icon: Wrench, color: "var(--birch)" },
  note: { icon: NotebookPen, color: "var(--muted-foreground)" },
};

function LogPanel({
  gear,
  rides,
  onAdd,
  className,
}: {
  gear: Gear;
  rides: Act[];
  onAdd: () => void;
  className?: string | undefined;
}) {
  const events = [...gear.events].sort(
    (a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id),
  );
  const drop = (id: string) => {
    void saveGear(removeEvent(gear, id));
    toast(t("Removed from the log", "Tolto dal diario"), {
      action: { label: t("Undo", "Annulla"), onClick: () => void saveGear(gear) },
    });
  };
  return (
    <Panel
      title={t("Log", "Diario")}
      {...(className ? { className } : {})}
      action={
        <button
          type="button"
          onClick={onAdd}
          className="inline-flex min-h-8 items-center gap-1 rounded-full bg-secondary px-3 text-sm"
        >
          <Plus className="h-3.5 w-3.5" />
          {t("Add", "Aggiungi")}
        </button>
      }
    >
      {events.length ? (
        <div>
          {events.map((e) => {
            const s = EVENT_STYLE[e.kind];
            return (
              <div
                key={e.id}
                className="group flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-secondary"
              >
                <span
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                  style={{
                    background: `color-mix(in oklab, ${s.color} 22%, transparent)`,
                    color: s.color,
                  }}
                >
                  <s.icon className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{eventTitle(e)}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {[
                      format(parseISO(e.date), "d MMM yyyy"),
                      e.note,
                      t(
                        `at ${kmText(kmAt(gear, rides, e.date))}`,
                        `a ${kmText(kmAt(gear, rides, e.date))}`,
                      ),
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => drop(e.id)}
                  aria-label={t("Remove from the log", "Togli dal diario")}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground opacity-60 hover:text-foreground group-hover:opacity-100"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          {gear.kind === "shoes"
            ? t("Nothing written yet.", "Ancora niente di annotato.")
            : t(
                "Washes, replacements and services go here, with the km the bike had.",
                "Lavaggi, sostituzioni e tagliandi finiscono qui, con i km che aveva la bici.",
              )}
        </p>
      )}
    </Panel>
  );
}
