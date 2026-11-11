// "Proponimi un giro": how long or how far, which climbs, from where, on which roads.
import { LocateFixed, MapPin, Search, Sparkles } from "lucide-react";
import { useState } from "react";
import { ResponsiveDialog } from "@/components/ResponsiveDialog";
import { Input } from "@/components/ui/input";
import { toggleClimb, type WishForm } from "@/lib/course/wish-form";
import { CLIMB_LABEL, durationText } from "./labels";
import { t } from "@/lib/i18n";
import { Chip } from "./bits";

const MINUTES = [30, 60, 90, 120, 180];

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div>
    <div className="eyebrow mb-2">{title}</div>
    <div className="flex flex-wrap gap-2">{children}</div>
  </div>
);

export function WishSheet({
  open,
  onOpenChange,
  initial,
  hasHome,
  onGo,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  initial: WishForm;
  hasHome: boolean;
  onGo: (w: WishForm) => void;
}) {
  const [w, setW] = useState(initial);
  const [kmOpen, setKmOpen] = useState(initial.km != null);
  const [gainOpen, setGainOpen] = useState(initial.gain != null);
  const set = (p: Partial<WishForm>) => setW((x) => ({ ...x, ...p }));
  const ready = (w.minutes || w.km) && (w.from !== "place" || w.place.trim());
  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("Suggest a ride", "Proponimi un giro")}
      description={t(
        "On roads you know, with the climbs you ask for.",
        "Su strade che conosci, con le salite che chiedi.",
      )}
    >
      <div className="space-y-4 pb-2">
        <Section title={t("How long", "Quanto")}>
          {MINUTES.map((m) => (
            <Chip
              key={m}
              on={!w.km && w.minutes === m}
              onClick={() => {
                set({ minutes: m, km: null });
                setKmOpen(false);
              }}
            >
              {durationText(m)}
            </Chip>
          ))}
          <Chip on={kmOpen} onClick={() => setKmOpen((v) => !v)}>
            km…
          </Chip>
          {kmOpen && (
            <Input
              type="number"
              inputMode="numeric"
              min={5}
              max={300}
              placeholder="km"
              className="h-9 w-24"
              value={w.km ?? ""}
              onChange={(e) => set({ km: Number(e.target.value) || null })}
            />
          )}
        </Section>
        <Section title={t("Climbs", "Salite")}>
          {(["short", "long", "steep", "gentle", "flat"] as const).map((c) => (
            <Chip
              key={c}
              on={w.climbs.includes(c)}
              onClick={() => set({ climbs: toggleClimb(w.climbs, c) })}
            >
              {CLIMB_LABEL[c]()}
            </Chip>
          ))}
          <Chip on={gainOpen} onClick={() => setGainOpen((v) => !v)}>
            {t("elevation…", "dislivello…")}
          </Chip>
          {gainOpen && (
            <Input
              type="number"
              inputMode="numeric"
              min={50}
              max={5000}
              placeholder="m"
              className="h-9 w-24"
              value={w.gain ?? ""}
              onChange={(e) => set({ gain: Number(e.target.value) || null })}
            />
          )}
        </Section>
        <Section title={t("From", "Da")}>
          <Chip on={w.from === "here"} icon={LocateFixed} onClick={() => set({ from: "here" })}>
            {t("here", "qui")}
          </Chip>
          {hasHome && (
            <Chip on={w.from === "home"} icon={MapPin} onClick={() => set({ from: "home" })}>
              {t("home", "casa")}
            </Chip>
          )}
          <Chip on={w.from === "place"} icon={Search} onClick={() => set({ from: "place" })}>
            {t("a place…", "un posto…")}
          </Chip>
          {w.from === "place" && (
            <Input
              placeholder={t("Town, square, climb…", "Paese, piazza, salita…")}
              className="h-9"
              value={w.place}
              autoFocus
              onChange={(e) => set({ place: e.target.value })}
            />
          )}
        </Section>
        <Section title={t("Roads", "Strade")}>
          <Chip on={w.myRoads} onClick={() => set({ myRoads: true })}>
            {t("mine", "le mie")}
          </Chip>
          <Chip on={!w.myRoads} onClick={() => set({ myRoads: false })}>
            {t("new ones too", "anche nuove")}
          </Chip>
          <Chip on={w.cyclepaths} onClick={() => set({ cyclepaths: !w.cyclepaths })}>
            {t("cycle paths", "ciclabili")}
          </Chip>
        </Section>
        <button
          type="button"
          disabled={!ready}
          onClick={() => onGo(w)}
          className="flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          <Sparkles className="h-4 w-4" />
          {t("Suggest three rides", "Proponi tre giri")}
        </button>
      </div>
    </ResponsiveDialog>
  );
}
