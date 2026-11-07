// An answer opened in the bar's panel, and a line that saves several things waiting to be confirmed. Drawn with the Activities
// rows' words and the app's own chips; nothing here leaves the panel until asked to.
import { Check, ChevronLeft, ChevronRight, Pin, X } from "lucide-react";
import { useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceDot,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";
import { ChartPanels } from "@/components/ChartPanels";
import { MiniDistribution } from "@/components/Distribution";
import type { Entry } from "@/lib/ask";
import type { AskChip, CurveView } from "@/lib/ask-detail";
import { LOGGED_IN_BATCH, type BatchPart } from "@/lib/ask-intents";
import { t } from "@/lib/i18n";
import type { Activity } from "@/lib/intervals";
import { cn } from "@/lib/utils";

const lengthLabel = (secs: number) =>
  secs < 60
    ? `${secs}s`
    : secs < 3600
      ? `${Math.round(secs / 60)}m`
      : `${Math.round(secs / 360) / 10}h`;

function Curve({ view }: { view: CurveView }) {
  const data = view.points.map((p) => ({
    x: lengthLabel(p.secs),
    value: Math.round(p.value),
    secs: p.secs,
  }));
  const at = data.find((p) => p.secs === view.at);
  return (
    <div className="h-28">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ left: -20, right: 8, top: 8 }}>
          <CartesianGrid stroke="var(--border)" vertical={false} />
          <XAxis
            dataKey="x"
            stroke="var(--muted-foreground)"
            fontSize={11}
            tickLine={false}
            minTickGap={16}
          />
          <YAxis
            stroke="var(--muted-foreground)"
            fontSize={11}
            tickCount={3}
            domain={[0, "auto"]}
          />
          <Area
            dataKey="value"
            stroke="var(--primary)"
            fill="var(--primary)"
            fillOpacity={0.12}
            strokeWidth={1.5}
            isAnimationActive={false}
          />
          {at && (
            <ReferenceDot
              x={at.x}
              y={at.value}
              r={4}
              fill="var(--primary)"
              stroke="var(--card)"
              strokeWidth={2}
            />
          )}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function Chip({
  chip,
  onAsk,
  before,
  after,
}: {
  chip: AskChip;
  onAsk: (q: string) => void;
  before?: boolean;
  after?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={() => onAsk(chip.query)}
      aria-pressed={!!chip.on}
      className={cn(
        "stat-num inline-flex min-h-8 shrink-0 items-center gap-1 rounded-full px-3 text-xs",
        chip.on ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground",
      )}
    >
      {before && <ChevronLeft className="h-3.5 w-3.5" />}
      {chip.label}
      {after && <ChevronRight className="h-3.5 w-3.5" />}
    </button>
  );
}

/** What could be asked next, by the thumb. Tapping keeps the keyboard up: the sentence is still being written. */
export function FollowRow({ chips, onAsk }: { chips: AskChip[]; onAsk: (q: string) => void }) {
  return (
    <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 [scrollbar-width:none]" role="group">
      {chips.map((c) => (
        <button
          key={c.label}
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onAsk(c.query)}
          aria-pressed={!!c.on}
          className={cn(
            "stat-num inline-flex min-h-8 shrink-0 items-center rounded-full px-3 text-xs",
            c.on
              ? "bg-primary text-primary-foreground"
              : "border border-border bg-card text-foreground",
          )}
        >
          {c.label}
        </button>
      ))}
    </div>
  );
}

export function PinButton({
  on,
  onToggle,
  label,
}: {
  on: boolean;
  onToggle: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={on}
      aria-label={label}
      className={cn(
        "flex h-11 w-9 shrink-0 items-center justify-center",
        on ? "text-primary" : "text-muted-foreground hover:text-foreground",
      )}
    >
      <Pin className={cn("h-4 w-4", on && "fill-current")} />
    </button>
  );
}

export function AnswerCard({
  entry,
  answer,
  acts,
  pinned,
  onPin,
  onAsk,
  onOpen,
}: {
  entry: Entry;
  answer?: string | undefined;
  acts: Activity[];
  pinned: boolean;
  onPin: () => void;
  onAsk: (q: string) => void;
  onOpen: () => void;
}) {
  const detail = entry.detail!;
  const view = detail.view;
  return (
    <div
      // A chart opens with the keyboard still up: what doesn't fit above it scrolls, instead of leaving the screen.
      className="max-h-[calc(100dvh-var(--keyboard,0px)-7.5rem)] overflow-y-auto [scrollbar-width:none] rounded-xl border border-border bg-card p-3 shadow-lg"
      role="region"
      aria-label={entry.q}
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="font-medium leading-snug">{entry.q}</div>
          {answer && (
            <div className="mt-0.5 text-xs leading-snug text-muted-foreground">{answer}</div>
          )}
        </div>
        {entry.value && (
          <span className="stat-num shrink-0 text-2xl font-semibold">{entry.value}</span>
        )}
        <PinButton
          on={pinned}
          onToggle={onPin}
          label={pinned ? t("Unpin", "Togli dalle fissate") : t("Pin", "Fissa")}
        />
      </div>
      <div className="mt-2">
        {view.kind === "curve" ? (
          <Curve view={view} />
        ) : view.kind === "chart" ? (
          <ChartPanels view={view} />
        ) : (
          <>
            {view.other && (
              <div className="mb-2 flex justify-end">
                <div className="flex gap-1 rounded-lg bg-secondary p-1">
                  {(["power", "hr"] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      aria-pressed={m === view.metric}
                      onClick={() => m !== view.metric && onAsk(view.other!)}
                      className={cn(
                        "rounded-md px-3 py-1 text-xs",
                        m === view.metric
                          ? "bg-background text-foreground"
                          : "text-muted-foreground",
                      )}
                    >
                      {m === "power" ? t("Power", "Potenza") : t("HR", "FC")}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <MiniDistribution
              acts={acts.filter((a) => view.ids.includes(a.id))}
              metric={view.metric}
              days={view.days}
            />
          </>
        )}
      </div>
      {detail.lengths && (
        <div className="mt-3 flex gap-1.5 overflow-x-auto">
          {detail.lengths.map((c) => (
            <Chip key={c.label} chip={c} onAsk={onAsk} />
          ))}
        </div>
      )}
      <div className="mt-2 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5 overflow-x-auto">
          {detail.prev && <Chip chip={detail.prev} onAsk={onAsk} before />}
          {detail.next && <Chip chip={detail.next} onAsk={onAsk} after />}
        </div>
        <button
          type="button"
          onClick={onOpen}
          className="inline-flex min-h-9 shrink-0 items-center gap-1 text-sm text-primary"
        >
          {detail.open}
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

/** Each part with a way to drop it; nothing is saved until the one button says so. */
export function BatchCard({
  parts,
  dayLabel,
  onSave,
}: {
  parts: BatchPart[];
  dayLabel?: string;
  onSave: (parts: BatchPart[]) => void;
}) {
  const [kept, setKept] = useState(parts);
  const drop = (p: BatchPart) =>
    setKept((all) =>
      all.filter(
        (x) =>
          x !== p &&
          // A brioche on the activity being dropped goes with it.
          !(
            p.action.kind === "log" &&
            x.action.kind === "brioche" &&
            x.action.activityId === LOGGED_IN_BATCH
          ),
      ),
    );
  return (
    <div className="rounded-xl border border-border bg-card p-3 shadow-lg">
      {dayLabel && <div className="eyebrow mb-1">{dayLabel}</div>}
      {kept.map((p) => (
        <div
          key={p.title}
          className="flex min-h-12 items-center gap-3 border-b border-border py-1 last:border-0"
        >
          <span
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
            style={{
              background: "color-mix(in oklab, var(--primary) 22%, transparent)",
              color: "var(--primary)",
            }}
          >
            <Check className="h-4 w-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-medium leading-snug">{p.title}</span>
            <span className="text-xs leading-snug text-muted-foreground">{p.detail}</span>
          </span>
          <button
            type="button"
            onClick={() => drop(p)}
            aria-label={t(`Remove ${p.title}`, `Togli ${p.title}`)}
            className="flex h-9 w-9 shrink-0 items-center justify-center text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
      <div className="mt-2 flex items-center justify-between gap-3">
        <span className="text-xs text-muted-foreground">
          {t("Nothing is saved until you confirm", "Niente è salvato finché non confermi")}
        </span>
        <button
          type="button"
          disabled={!kept.length}
          onClick={() => onSave(kept)}
          className="shrink-0 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
        >
          {t("Save all", "Salva tutto")}
        </button>
      </div>
    </div>
  );
}
