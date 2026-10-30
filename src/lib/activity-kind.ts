// Kinds of activity, each with its own colour and icon across the app.
import { Bike, Dumbbell, Footprints, Mountain, MonitorPlay, PersonStanding, Waves, Zap, Activity as Other, Route } from "lucide-react";

export type Kind = "road" | "gravel" | "mtb" | "indoor" | "ebike" | "run" | "walk" | "gym" | "swim" | "other";

export const KINDS: Record<Kind, { label: string; color: string; icon: typeof Bike }> = {
  road: { label: "Road", color: "var(--fitness)", icon: Bike },
  gravel: { label: "Gravel", color: "var(--birch)", icon: Route },
  mtb: { label: "MTB", color: "var(--pine)", icon: Mountain },
  indoor: { label: "Indoor", color: "var(--z5)", icon: MonitorPlay },
  ebike: { label: "E-bike", color: "var(--z3)", icon: Zap },
  run: { label: "Run", color: "var(--lingon)", icon: Footprints },
  walk: { label: "Walk / hike", color: "var(--z2)", icon: PersonStanding },
  gym: { label: "Gym", color: "var(--z7)", icon: Dumbbell },
  swim: { label: "Swim", color: "var(--primary)", icon: Waves },
  other: { label: "Other", color: "var(--z1)", icon: Other },
};

/** intervals.icu type (+ trainer flag) → kind. Indoor wins over the bike type. */
export function activityKind(a: { type: string | null; trainer?: boolean }): Kind {
  const t = a.type ?? "";
  if (/Virtual/.test(t) || (a.trainer && /Ride/.test(t))) return "indoor";
  if (/Gravel/.test(t)) return "gravel";
  if (/MountainBike/.test(t)) return "mtb";
  if (/EBike|EMountainBike/.test(t)) return "ebike";
  if (/Ride|Velomobile|Handcycle/.test(t)) return "road";
  if (/Run/.test(t)) return "run";
  if (/Walk|Hike/.test(t)) return "walk";
  if (/WeightTraining|Workout|Crossfit|Yoga|Pilates/.test(t)) return "gym";
  if (/Swim/.test(t)) return "swim";
  return "other";
}
