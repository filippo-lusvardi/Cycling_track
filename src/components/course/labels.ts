// Words for the Routes pages' wishes.
import type { ClimbWish } from "@/lib/course/generate";
import { t } from "@/lib/i18n";

export const CLIMB_LABEL: Record<ClimbWish, () => string> = {
  short: () => t("short", "corte"),
  long: () => t("long", "lunghe"),
  steep: () => t("steep", "ripide"),
  gentle: () => t("gentle", "pedalabili"),
  flat: () => t("flat", "piatto"),
};

export const durationText = (m: number) =>
  m < 60 ? `${m} min` : m % 60 ? `${Math.floor(m / 60)} h ${m % 60}` : `${m / 60} h`;
