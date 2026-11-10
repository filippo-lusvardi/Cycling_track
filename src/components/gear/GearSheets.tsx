// The gear page's sheets: a new bike or pair of shoes, its settings, a log entry, and a part to follow.
import { Check, Droplets, NotebookPen, RefreshCw, Wrench } from "lucide-react";
import { useState, type ReactNode } from "react";
import { ResponsiveDialog } from "@/components/ResponsiveDialog";
import { Input } from "@/components/ui/input";
import {
  addEvent,
  BIKE_USES,
  current,
  defaultFor,
  EVENT_LABEL,
  FRAME_LABEL,
  newGear,
  PART_ORDER,
  PARTS,
  replacePart,
  setUses,
  trackPart,
  updateComponent,
  type Component,
  type EventKind,
  type Frame,
  type Gear,
  type GearKind,
  type PartKind,
  type Use,
  USE_LABEL,
} from "@/lib/gear";
import { saveGear } from "@/lib/gear-store";
import { t } from "@/lib/i18n";
import { isoDate } from "@/lib/training";
import { cn } from "@/lib/utils";

const today = () => isoDate(new Date());
const kmValue = (s: string) => {
  const n = Number(s.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
};

function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string | undefined;
}) {
  return (
    <label className="block">
      <span className="eyebrow">{label}</span>
      <div className="mt-1">{children}</div>
      {hint && <span className="mt-1 block text-xs text-muted-foreground">{hint}</span>}
    </label>
  );
}

function Chips<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { id: T; label: string }[];
  value: T | null;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          aria-pressed={value === o.id}
          onClick={() => onChange(o.id)}
          className={cn(
            "min-h-9 rounded-full border border-border px-3 text-sm transition-colors",
            value === o.id ? "border-primary bg-primary/15 text-primary" : "hover:bg-secondary",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** The kinds of activity a gear is used for: several can be on, each moves here from the gear that had it. */
function UsesField({
  kind,
  gears,
  self,
  value,
  onChange,
}: {
  kind: GearKind;
  gears: Gear[];
  self?: string;
  value: Use[];
  onChange: (v: Use[]) => void;
}) {
  const options: Use[] = kind === "shoes" ? ["run"] : BIKE_USES;
  const toggle = (u: Use) =>
    onChange(value.includes(u) ? value.filter((x) => x !== u) : [...value, u]);
  const moving = value
    .map((u) => ({ u, from: defaultFor(gears, u) }))
    .filter((m) => m.from && m.from.id !== self && m.from.kind === kind);
  return (
    <Field
      label={kind === "shoes" ? t("Used for", "Usate per") : t("Used for", "Usata per")}
      hint={
        moving.length
          ? moving
              .map(({ u, from }) =>
                t(
                  `${USE_LABEL(u)}: moves here from ${from!.name}`,
                  `${USE_LABEL(u)}: passa qui da ${from!.name}`,
                ),
              )
              .join(" · ")
          : value.length
            ? undefined
            : kind === "shoes"
              ? t(
                  "Runs count on them only when set on an activity.",
                  "Le corse contano su di loro solo se scelte sull'attività.",
                )
              : t(
                  "Rides count on it only when set on an activity.",
                  "Le uscite contano su di lei solo se scelta sull'attività.",
                )
      }
    >
      <div className="flex flex-wrap gap-1.5">
        {options.map((u) => (
          <button
            key={u}
            type="button"
            aria-pressed={value.includes(u)}
            onClick={() => toggle(u)}
            className={cn(
              "inline-flex min-h-9 items-center gap-1 rounded-full border border-border px-3 text-sm transition-colors",
              value.includes(u)
                ? "border-primary bg-primary/15 text-primary"
                : "hover:bg-secondary",
            )}
          >
            {value.includes(u) && <Check className="h-3.5 w-3.5" />}
            {kind === "shoes" ? t("Runs", "Corse") : USE_LABEL(u)}
          </button>
        ))}
      </div>
    </Field>
  );
}

const FRAME_USE: Record<Frame, Use> = { road: "road", gravel: "gravel", mtb: "mtb", tt: "road" };

function Save({ disabled, onClick }: { disabled?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="mt-4 flex min-h-11 w-full items-center justify-center gap-1.5 rounded-full bg-primary font-medium text-primary-foreground disabled:opacity-50"
    >
      <Check className="h-4 w-4" />
      {t("Save", "Salva")}
    </button>
  );
}

const FRAMES: Frame[] = ["road", "gravel", "mtb", "tt"];

/** A new bike or pair of shoes. */
export function AddGearSheet({
  open,
  onOpenChange,
  gears,
  onAdded,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  gears: Gear[];
  onAdded: (g: Gear) => void;
}) {
  const [kind, setKind] = useState<GearKind>("bike");
  const [name, setName] = useState("");
  const [frame, setFrame] = useState<Frame>("road");
  // Until touched, the kinds follow the frame (an MTB for MTB rides) and the shoes are for runs.
  const [picked, setPicked] = useState<Use[] | null>(null);
  const uses = picked ?? (kind === "shoes" ? ["run"] : [FRAME_USE[frame]]);
  const [km, setKm] = useState("");
  const [since, setSince] = useState(today());
  const [life, setLife] = useState("700");
  const save = () => {
    const g = newGear(
      {
        name,
        kind,
        uses,
        frame,
        startKm: kmValue(km) ?? 0,
        since: since || today(),
        intervalKm: kind === "shoes" ? kmValue(life) : null,
      },
      gears,
      today(),
    );
    void saveGear(...setUses(gears, g, uses));
    onOpenChange(false);
    setName("");
    setKm("");
    onAdded(g);
  };
  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("Add gear", "Aggiungi attrezzatura")}
    >
      <div className="space-y-4">
        <Chips
          options={[
            { id: "bike" as const, label: t("Bike", "Bici") },
            { id: "shoes" as const, label: t("Shoes", "Scarpe") },
          ]}
          value={kind}
          onChange={(k) => {
            setKind(k);
            setPicked(null);
          }}
        />
        <Field label={t("Name", "Nome")}>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={kind === "bike" ? "Canyon Ultimate" : "Pegasus 41"}
            autoComplete="off"
          />
        </Field>
        {kind === "bike" && (
          <>
            <Field label={t("Kind", "Tipo")}>
              <Chips
                options={FRAMES.map((f) => ({ id: f, label: FRAME_LABEL[f]() }))}
                value={frame}
                onChange={setFrame}
              />
            </Field>
          </>
        )}
        <UsesField kind={kind} gears={gears} value={uses} onChange={setPicked} />
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("In use since", "In uso da")}>
            <Input
              type="date"
              value={since}
              max={today()}
              onChange={(e) => setSince(e.target.value)}
            />
          </Field>
          <Field label={t("Km already done", "Km già fatti")}>
            <Input
              inputMode="numeric"
              value={km}
              onChange={(e) => setKm(e.target.value)}
              placeholder="0"
            />
          </Field>
        </div>
        {kind === "shoes" && (
          <Field label={t("A pair lasts (km)", "Un paio dura (km)")}>
            <Input inputMode="numeric" value={life} onChange={(e) => setLife(e.target.value)} />
          </Field>
        )}
        <p className="text-xs text-muted-foreground">
          {kind === "shoes"
            ? t(
                "Runs from that day count on them, added to the km already done.",
                "Le corse da quel giorno contano su di loro, in più ai km già fatti.",
              )
            : t(
                "Rides from that day count on it, added to the km already done.",
                "Le uscite da quel giorno contano su di lei, in più ai km già fatti.",
              )}
        </p>
      </div>
      <Save disabled={!name.trim()} onClick={save} />
    </ResponsiveDialog>
  );
}

/** Name, kind, km, interval. */
export function EditGearSheet({
  open,
  onOpenChange,
  gear,
  gears,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  gear: Gear;
  gears: Gear[];
}) {
  const [name, setName] = useState(gear.name);
  const [uses, setUsesState] = useState<Use[]>(gear.uses);
  const [frame, setFrame] = useState<Frame>(gear.frame ?? "road");
  const [km, setKm] = useState(gear.startKm ? String(gear.startKm) : "");
  const [since, setSince] = useState(gear.since);
  const [life, setLife] = useState(gear.intervalKm ? String(gear.intervalKm) : "");
  const save = () => {
    const next: Gear = {
      ...gear,
      name: name.trim(),
      startKm: kmValue(km) ?? 0,
      since: since || gear.since,
      updatedAt: Date.now(),
    };
    if (gear.kind === "bike") next.frame = frame;
    else next.intervalKm = kmValue(life);
    void saveGear(...setUses(gears, next, uses));
    onOpenChange(false);
  };
  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange} title={t("Edit", "Modifica")}>
      <div className="space-y-4">
        <Field label={t("Name", "Nome")}>
          <Input value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" />
        </Field>
        {gear.kind === "bike" && (
          <Field label={t("Kind", "Tipo")}>
            <Chips
              options={FRAMES.map((f) => ({ id: f, label: FRAME_LABEL[f]() }))}
              value={frame}
              onChange={setFrame}
            />
          </Field>
        )}
        {!gear.retired && (
          <UsesField
            kind={gear.kind}
            gears={gears}
            self={gear.id}
            value={uses}
            onChange={setUsesState}
          />
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("In use since", "In uso da")}>
            <Input
              type="date"
              value={since}
              max={today()}
              onChange={(e) => setSince(e.target.value)}
            />
          </Field>
          <Field label={t("Km already done", "Km già fatti")}>
            <Input
              inputMode="numeric"
              value={km}
              onChange={(e) => setKm(e.target.value)}
              placeholder="0"
            />
          </Field>
        </div>
        {gear.kind === "shoes" && (
          <Field label={t("A pair lasts (km)", "Un paio dura (km)")}>
            <Input inputMode="numeric" value={life} onChange={(e) => setLife(e.target.value)} />
          </Field>
        )}
      </div>
      <Save disabled={!name.trim()} onClick={save} />
    </ResponsiveDialog>
  );
}

const EVENT_ICON: Record<EventKind, typeof Droplets> = {
  wash: Droplets,
  replace: RefreshCw,
  service: Wrench,
  note: NotebookPen,
};

/** Something done to the gear. A replacement swaps the part; the rest are just written down. */
export function EventSheet({
  open,
  onOpenChange,
  gear,
  initial,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  gear: Gear;
  initial?: { kind?: EventKind; part?: PartKind } | undefined;
}) {
  const shoes = gear.kind === "shoes";
  const [kind, setKind] = useState<EventKind>(initial?.kind ?? (shoes ? "note" : "wash"));
  const [part, setPart] = useState<PartKind | null>(initial?.part ?? null);
  const [date, setDate] = useState(today());
  const [note, setNote] = useState("");
  const old = part ? current(gear, part) : null;
  const [interval, setInterval] = useState("");
  const kinds: EventKind[] = shoes ? ["note"] : ["wash", "replace", "service", "note"];
  const needsPart = kind === "replace";
  const save = () => {
    const next =
      kind === "replace" && part
        ? replacePart(gear, part, date || today(), {
            ...(note.trim() ? { name: note.trim() } : {}),
            ...(interval.trim() ? { intervalKm: kmValue(interval) } : {}),
          })
        : addEvent(gear, {
            date: date || today(),
            kind,
            ...(part && kind !== "wash" ? { part } : {}),
            ...(note.trim() ? { note: note.trim() } : {}),
          });
    void saveGear(next);
    onOpenChange(false);
  };
  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("Add to the log", "Aggiungi al diario")}
    >
      <div className="space-y-4">
        {kinds.length > 1 && (
          <div className="grid grid-cols-4 gap-2">
            {kinds.map((k) => {
              const Icon = EVENT_ICON[k];
              return (
                <button
                  key={k}
                  type="button"
                  aria-pressed={kind === k}
                  onClick={() => setKind(k)}
                  className={cn(
                    "flex flex-col items-center gap-1.5 rounded-xl bg-secondary py-3 text-xs",
                    kind === k && "text-primary ring-2 ring-primary",
                  )}
                >
                  <Icon className="h-5 w-5" />
                  {EVENT_LABEL[k]()}
                </button>
              );
            })}
          </div>
        )}
        {!shoes && kind !== "wash" && (
          <Field label={needsPart ? t("What", "Cosa") : t("What (optional)", "Cosa (facoltativo)")}>
            <Chips
              options={PART_ORDER.map((p) => ({ id: p, label: PARTS[p].short() }))}
              value={part}
              onChange={(p) => {
                setPart(part === p && !needsPart ? null : p);
                setInterval("");
              }}
            />
          </Field>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("When", "Quando")}>
            <Input
              type="date"
              value={date}
              max={today()}
              onChange={(e) => setDate(e.target.value)}
            />
          </Field>
          {kind === "replace" && (
            <Field label={t("Every (optional)", "Ogni (facoltativo)")}>
              <Input
                inputMode="numeric"
                value={interval}
                onChange={(e) => setInterval(e.target.value)}
                placeholder={old?.intervalKm ? `${old.intervalKm} km` : "km"}
              />
            </Field>
          )}
        </div>
        <Field
          label={kind === "replace" ? t("Model or note", "Modello o nota") : t("Note", "Nota")}
        >
          <Input value={note} onChange={(e) => setNote(e.target.value)} autoComplete="off" />
        </Field>
        {kind === "replace" && part && (
          <p className="text-xs text-muted-foreground">
            {old
              ? t(
                  `The ${PARTS[part].label().toLowerCase()} on it now goes among the past ones; the new one starts from zero.`,
                  `${PARTS[part].label()}: il pezzo montato ora va tra i precedenti, il nuovo parte da zero.`,
                )
              : t(
                  "It starts being followed from that day.",
                  "Da quel giorno il pezzo inizia a essere seguito.",
                )}
          </p>
        )}
      </div>
      <Save disabled={(needsPart && !part) || (kind === "note" && !note.trim())} onClick={save} />
    </ResponsiveDialog>
  );
}

/** Start following a part already on the bike, or change one being followed. */
export function PartSheet({
  open,
  onOpenChange,
  gear,
  part,
  component,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  gear: Gear;
  part: PartKind;
  component: Component | null;
}) {
  const [fitted, setFitted] = useState(component?.fitted ?? today());
  const [km, setKm] = useState(component?.fittedKm ? String(component.fittedKm) : "");
  const [interval, setInterval] = useState(
    component?.intervalKm ? String(component.intervalKm) : "",
  );
  const [name, setName] = useState(component?.name ?? "");
  const save = () => {
    const iv = kmValue(interval);
    let next: Gear;
    if (component) {
      const patch: Partial<Component> = {
        fitted: fitted || component.fitted,
        fittedKm: kmValue(km) ?? 0,
        intervalKm: iv,
      };
      if (name.trim()) patch.name = name.trim();
      next = updateComponent(gear, component.id, patch);
    } else {
      next = trackPart(gear, part, fitted || today(), kmValue(km) ?? 0, iv);
      if (name.trim())
        next = updateComponent(next, next.components.at(-1)!.id, { name: name.trim() });
    }
    void saveGear(next);
    onOpenChange(false);
  };
  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange} title={PARTS[part].label()}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("Fitted on", "Data di montaggio")}>
            <Input
              type="date"
              value={fitted}
              max={today()}
              onChange={(e) => setFitted(e.target.value)}
            />
          </Field>
          <Field label={t("Km it already had", "Km che aveva già")}>
            <Input
              inputMode="numeric"
              value={km}
              onChange={(e) => setKm(e.target.value)}
              placeholder="0"
            />
          </Field>
        </div>
        <Field
          label={t("Change every (km, optional)", "Da cambiare ogni (km, facoltativo)")}
          hint={t(
            "Near it, the part turns orange here. Nothing else reminds you.",
            "Quando ci si avvicina, qui la parte diventa arancione. Nient'altro te lo ricorda.",
          )}
        >
          <Input
            inputMode="numeric"
            value={interval}
            onChange={(e) => setInterval(e.target.value)}
          />
        </Field>
        <Field label={t("Model (optional)", "Modello (facoltativo)")}>
          <Input value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" />
        </Field>
      </div>
      <Save onClick={save} />
    </ResponsiveDialog>
  );
}
