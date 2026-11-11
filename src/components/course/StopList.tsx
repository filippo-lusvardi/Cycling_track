// A route's checkpoints in order, dragged by their handle to change the order (as the sections are in Customizable);
// the first is where you start. Keyboard: the handle, then space and the arrows.
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
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, X } from "lucide-react";
import { t } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export type Stop = { lat: number; lng: number; label: string; km: string | null };

/** Ids that stay with each point while the list moves (the same place twice gets #1, #2…). */
function stopIds(stops: { lat: number; lng: number }[]): string[] {
  const seen = new Map<string, number>();
  return stops.map((s) => {
    const k = `${s.lat.toFixed(6)},${s.lng.toFixed(6)}`;
    const n = seen.get(k) ?? 0;
    seen.set(k, n + 1);
    return `${k}#${n}`;
  });
}

function Row({
  id,
  i,
  stop,
  onRemove,
}: {
  id: string;
  i: number;
  stop: Stop;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
  });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "flex items-center gap-2 border-t border-border py-1.5 first:border-t-0",
        isDragging && "relative z-10 rounded-md border-transparent bg-secondary",
      )}
    >
      <button
        type="button"
        aria-label={t(`Move ${stop.label}`, `Sposta ${stop.label}`)}
        {...attributes}
        {...listeners}
        // Only the handle drags, so the page still scrolls under the finger everywhere else.
        style={{ touchAction: "none" }}
        className="flex h-10 w-7 shrink-0 cursor-grab items-center justify-center text-muted-foreground active:cursor-grabbing"
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
        {i === 0 ? "▶" : i}
      </span>
      <span className="min-w-0 flex-1 truncate">{stop.label}</span>
      {stop.km && <span className="stat-num text-xs text-muted-foreground">km {stop.km}</span>}
      <button
        type="button"
        aria-label={t("Remove", "Togli")}
        onClick={onRemove}
        className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

export function StopList({
  stops,
  onOrder,
  onRemove,
}: {
  stops: Stop[];
  /** The new order, as the old indexes. */
  onOrder: (order: number[]) => void;
  onRemove: (i: number) => void;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const ids = stopIds(stops);
  const onDrag = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    const from = ids.indexOf(String(e.active.id));
    const to = ids.indexOf(String(e.over.id));
    if (from < 0 || to < 0) return;
    onOrder(
      arrayMove(
        stops.map((_, k) => k),
        from,
        to,
      ),
    );
  };
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDrag}>
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        {stops.map((s, i) => (
          <Row key={ids[i]} id={ids[i]!} i={i} stop={s} onRemove={() => onRemove(i)} />
        ))}
      </SortableContext>
    </DndContext>
  );
}
