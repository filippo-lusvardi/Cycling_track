// A page arranged by the person reading it: its sections in their order, closed or open, and the list that edits them.
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ChevronDown, GripVertical, SlidersHorizontal } from "lucide-react";
import { Fragment, useState, type ReactNode } from "react";
import { FoldContext } from "@/components/StatCard";
import { Switch } from "@/components/ui/switch";
import type { UseLayout } from "@/hooks/use-layout";
import { t } from "@/lib/i18n";
import {
  KIND_SCOPE,
  moveNumber,
  moveSection,
  setClosed,
  setHidden,
  setNumberHidden,
  type LayoutKind,
  type ResolvedSection,
} from "@/lib/layouts";
import { cn } from "@/lib/utils";

export function TuneButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-border bg-card/85 px-3 text-xs text-muted-foreground backdrop-blur hover:text-foreground"
    >
      <SlidersHorizontal className="h-3.5 w-3.5" /> {t("Customize", "Personalizza")}
    </button>
  );
}

/** A closed section: only its name, to open it again. */
function ClosedRow({
  title,
  hint,
  onOpen,
}: {
  title: string;
  hint?: string | undefined;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-expanded={false}
      className="flex min-h-14 w-full items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 text-left"
    >
      <span className="text-sm font-semibold">{title}</span>
      <span className="flex items-center gap-2 text-muted-foreground">
        {hint && <span className="stat-num text-xs">{hint}</span>}
        <ChevronDown className="h-4 w-4 -rotate-90" />
      </span>
    </button>
  );
}

/**
 * The page's sections in the chosen order. `render` gives a section's content, or null when it has nothing to show,
 * so a section without data doesn't appear wherever it was placed. Content is only mounted while open.
 */
export function Sections({
  layout,
  render,
  hints,
  isOpen,
  onToggle,
}: {
  layout: UseLayout;
  render: (s: ResolvedSection) => ReactNode;
  /** A word beside a closed section's name. */
  hints?: Partial<Record<string, string | undefined>>;
  /** Opened for the moment by something else on the page, whatever the layout says. */
  isOpen?: (id: string) => boolean;
  onToggle?: (id: string) => void;
}) {
  return (
    <>
      {layout.sections.map((s) => {
        if (s.hidden) return null;
        const node = render(s);
        if (node == null || node === false) return null;
        const open = !s.closed || !!isOpen?.(s.id);
        const toggle = () => {
          onToggle?.(s.id);
          layout.change(setClosed(layout.layout, s.id, open));
        };
        if (s.fixed) return <Fragment key={s.id}>{node}</Fragment>;
        if (!open)
          return <ClosedRow key={s.id} title={s.label} hint={hints?.[s.id]} onOpen={toggle} />;
        return (
          <div key={s.id} className={s.plain ? "space-y-3" : undefined}>
            {s.plain && (
              <button
                type="button"
                onClick={toggle}
                aria-expanded
                className="on-sky flex min-h-9 w-full items-center justify-between gap-3 px-1 text-left text-sm font-semibold"
              >
                {s.label}
                <ChevronDown className="h-4 w-4 text-foreground/85" />
              </button>
            )}
            <FoldContext.Provider value={s.plain ? null : { toggle }}>{node}</FoldContext.Provider>
          </div>
        );
      })}
    </>
  );
}

function Grip({
  small,
  listeners,
  attributes,
  label,
}: {
  small?: boolean;
  listeners: unknown;
  attributes: unknown;
  label: string;
}) {
  return (
    <button
      type="button"
      aria-label={t(`Move ${label}`, `Sposta ${label}`)}
      {...(attributes as object)}
      {...(listeners as object)}
      // Only the handle drags, so the list still scrolls under the finger everywhere else.
      style={{ touchAction: "none" }}
      className={cn(
        "flex shrink-0 cursor-grab items-center justify-center text-muted-foreground active:cursor-grabbing",
        small ? "h-10 w-7" : "h-11 w-8",
      )}
    >
      <GripVertical className={small ? "h-3.5 w-3.5" : "h-4 w-4"} />
    </button>
  );
}

function useDrag() {
  return useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
}

function NumberRow({
  id,
  label,
  hidden,
  onHidden,
}: {
  id: string;
  label: string;
  hidden: boolean;
  onHidden: (h: boolean) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
  });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "flex min-h-11 items-center gap-1.5",
        isDragging && "relative z-10 rounded-md bg-secondary",
      )}
    >
      <Grip small attributes={attributes} listeners={listeners} label={label} />
      <span
        className={cn(
          "min-w-0 flex-1 truncate text-sm text-muted-foreground",
          hidden && "opacity-55",
        )}
      >
        {label}
      </span>
      <Switch
        checked={!hidden}
        onCheckedChange={(v) => onHidden(!v)}
        aria-label={t(`Show ${label}`, `Mostra ${label}`)}
      />
    </div>
  );
}

function SectionRow({ s, layout }: { s: ResolvedSection; layout: UseLayout }) {
  const [open, setOpen] = useState(false);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: s.id,
  });
  const sensors = useDrag();
  const hasNumbers = s.numbers.length > 0;
  const onDrag = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    layout.change(
      moveNumber(
        layout.layout,
        s.id,
        s.numbers.map((n) => n.id),
        String(e.active.id),
        String(e.over.id),
      ),
    );
  };
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "rounded-lg bg-card",
        open && "bg-secondary/40",
        isDragging && "relative z-10 shadow-lg",
      )}
    >
      <div className="flex min-h-12 items-center gap-1.5 px-1">
        <Grip attributes={attributes} listeners={listeners} label={s.label} />
        <button
          type="button"
          disabled={!hasNumbers}
          onClick={() => setOpen((v) => !v)}
          aria-expanded={hasNumbers ? open : undefined}
          className={cn(
            "flex min-h-11 min-w-0 flex-1 items-center gap-1 text-left text-sm font-medium",
            s.hidden && "opacity-55",
          )}
        >
          <span className="truncate">{s.label}</span>
          {hasNumbers && (
            <ChevronDown
              className={cn(
                "h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform",
                !open && "-rotate-90",
              )}
            />
          )}
        </button>
        {!s.fixed && (
          <button
            type="button"
            aria-pressed={!s.closed}
            onClick={() => layout.change(setClosed(layout.layout, s.id, !s.closed))}
            className={cn(
              "min-h-8 shrink-0 rounded-full px-2.5 text-[11px]",
              s.hidden && "opacity-55",
              s.closed ? "bg-background/50 text-muted-foreground" : "bg-secondary text-foreground",
            )}
          >
            {s.closed ? t("Closed", "Chiusa") : t("Open", "Aperta")}
          </button>
        )}
        <Switch
          className="ml-1 shrink-0"
          checked={!s.hidden}
          onCheckedChange={(v) => layout.change(setHidden(layout.layout, s.id, !v))}
          aria-label={t(`Show ${s.label}`, `Mostra ${s.label}`)}
        />
      </div>
      {open && hasNumbers && (
        <div className="space-y-0.5 pb-2 pl-7 pr-1">
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDrag}>
            <SortableContext
              items={s.numbers.map((n) => n.id)}
              strategy={verticalListSortingStrategy}
            >
              {s.numbers.map((n) => (
                <NumberRow
                  key={n.id}
                  id={n.id}
                  label={n.label}
                  hidden={n.hidden}
                  onHidden={(h) => layout.change(setNumberHidden(layout.layout, s.id, n.id, h))}
                />
              ))}
            </SortableContext>
          </DndContext>
        </div>
      )}
    </div>
  );
}

/** The list that arranges a page. Hidden things stay listed, so nothing gets lost. */
export function LayoutEditor({
  eyebrow,
  kind,
  layout,
  onDone,
}: {
  eyebrow: string;
  kind: LayoutKind;
  layout: UseLayout;
  onDone: () => void;
}) {
  const sensors = useDrag();
  const ids = layout.sections.map((s) => s.id);
  const onDrag = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    layout.change(moveSection(layout.layout, ids, String(e.active.id), String(e.over.id)));
  };
  return (
    <div className="space-y-3">
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <div className="eyebrow">{eyebrow}</div>
          <h1 className="on-sky text-3xl font-bold tracking-tight">
            {t("Customize", "Personalizza")}
          </h1>
        </div>
        <button
          type="button"
          onClick={onDone}
          className="flex min-h-10 shrink-0 items-center rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground"
        >
          {t("Done", "Fine")}
        </button>
      </div>
      <p className="on-sky px-1 text-sm text-foreground/85">{KIND_SCOPE[kind]()}</p>
      <div className="rounded-xl border border-border bg-card p-1.5">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDrag}>
          <SortableContext items={ids} strategy={verticalListSortingStrategy}>
            <div className="divide-y divide-border/60">
              {layout.sections.map((s) => (
                <SectionRow key={s.id} s={s} layout={layout} />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      </div>
      <div className="text-center">
        <button
          type="button"
          onClick={() => layout.change(undefined)}
          className="on-sky min-h-10 text-sm text-foreground/85 underline-offset-2 hover:underline"
        >
          {t("Reset this view", "Ripristina questa vista")}
        </button>
      </div>
    </div>
  );
}
