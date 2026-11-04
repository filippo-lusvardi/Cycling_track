// The time of day for the Home and Garden skies: when the sun rises and sets, where it stands, how light it is, and
// the moon's place and phase at night. Approximate on purpose (a picture, not an almanac): sunrise and sunset come
// from the date at about 45° N (northern Italy), solar noon from the clock's daylight-saving shift. Pure.
import type { Weather } from "./tree";

export type DayPart = "night" | "dawn" | "day" | "dusk";

export type Daylight = {
  part: DayPart;
  /** 0 at night → 1 in full day, easing through dawn and dusk. */
  light: number;
  /** 0 → 1: how much the horizon glows warm (strongest around sunrise and sunset). */
  glow: number;
  /** The sun across the sky while it's up: x 0 (rising, left) → 1 (setting, right), alt 0 (horizon) → 1 (noon). */
  sun: { x: number; alt: number } | null;
  /** The moon across the night sky, its lit fraction (0 new → 1 full) and whether it's waxing (lit on the right). */
  moon: { x: number; alt: number; lit: number; waxing: boolean } | null;
  /** Hours (local, decimal) of sunrise and sunset. */
  sunrise: number;
  sunset: number;
};

const LAT = 45;
/** Twilight before sunrise and after sunset, in hours. */
const TWILIGHT = 0.75;
const rad = Math.PI / 180;

const dayOfYear = (d: Date) =>
  Math.round(
    (Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - Date.UTC(d.getFullYear(), 0, 1)) /
      86_400_000,
  );

/** Sunrise and sunset in local decimal hours for `d`'s date. */
export function sunTimes(d: Date, lat = LAT): { sunrise: number; sunset: number } {
  const decl = 23.44 * rad * Math.sin(((2 * Math.PI) / 365) * (284 + dayOfYear(d)));
  const cosH = -Math.tan(lat * rad) * Math.tan(decl);
  const half = (Math.acos(Math.max(-1, Math.min(1, cosH))) / rad / 15) as number;
  // Solar noon: about 12:20 on standard time across central Europe, an hour later with daylight saving.
  const jan = new Date(d.getFullYear(), 0, 1).getTimezoneOffset();
  const dst = (jan - d.getTimezoneOffset()) / 60;
  const noon = 12.33 + dst;
  return { sunrise: noon - half, sunset: noon + half };
}

const smooth = (v: number) => {
  const x = Math.min(1, Math.max(0, v));
  return x * x * (3 - 2 * x);
};

/** Days since a known new moon, folded into the 29.53-day synodic month: 0 new, 0.5 full. */
export function moonAge(d: Date): number {
  const known = Date.UTC(2000, 0, 6, 18, 14);
  const synodic = 29.530588853;
  const days = (d.getTime() - known) / 86_400_000;
  return (((days % synodic) + synodic) % synodic) / synodic;
}

export function daylight(now: Date, lat = LAT): Daylight {
  const { sunrise, sunset } = sunTimes(now, lat);
  const h = now.getHours() + now.getMinutes() / 60;
  const up = h >= sunrise && h <= sunset;
  // Light eases in over the twilight before sunrise and out over the one after sunset.
  const light = Math.min(
    smooth((h - (sunrise - TWILIGHT)) / (TWILIGHT * 1.6)),
    smooth((sunset + TWILIGHT - h) / (TWILIGHT * 1.6)),
  );
  const fromRise = Math.abs(h - sunrise);
  const fromSet = Math.abs(h - sunset);
  const glow = Math.max(0, 1 - Math.min(fromRise, fromSet) / 1.1);
  const part: DayPart =
    h < sunrise - TWILIGHT || h > sunset + TWILIGHT
      ? "night"
      : h < sunrise + 0.6
        ? "dawn"
        : h > sunset - 0.6
          ? "dusk"
          : "day";
  const sun = up
    ? {
        x: (h - sunrise) / (sunset - sunrise),
        alt: Math.sin((Math.PI * (h - sunrise)) / (sunset - sunrise)),
      }
    : null;
  // The moon crosses the dark hours from dusk to dawn, a simple stand-in for its real path.
  let moon: Daylight["moon"] = null;
  if (!up) {
    const nightLen = 24 - (sunset - sunrise);
    const since = h > sunset ? h - sunset : h + 24 - sunset;
    const f = since / nightLen;
    const age = moonAge(now);
    moon = {
      x: f,
      alt: Math.sin(Math.PI * f),
      lit: (1 - Math.cos(2 * Math.PI * age)) / 2,
      waxing: age < 0.5,
    };
  }
  return { part, light, glow, sun, moon, sunrise, sunset };
}

const mix = (a: string, pa: number, b: string) =>
  `color-mix(in oklab, ${a} ${Math.round(Math.min(100, Math.max(0, pa)))}%, ${b})`;
/** The warm horizon of sunrise and sunset. */
export const WARM = "oklch(0.7 0.13 45)";

/**
 * A scene colour as the time of day lights it: lighter by day (never washed out: the app stays dark), a touch warm
 * around sunrise and sunset.
 */
export function lit(color: string, d: Pick<Daylight, "light" | "glow">) {
  // Warm sunlight rather than white, so lit ground stays green and wood brown instead of turning grey.
  // Backlit at sunrise and sunset: the land stays darker than the glowing sky, so what stands on it shows.
  const day = mix(color, 100 - d.light * 24 * (1 - d.glow * 0.6), "oklch(0.9 0.06 95)");
  return d.glow > 0 ? mix(day, 100 - d.glow * 10, WARM) : day;
}

/** How the sky looks for a form-weather: share of it under cloud, how dark the clouds, how much falls and as what. */
export function skyCover(weather: Weather | null, phase: number) {
  const lerp = (a: number, b: number) => a + (b - a) * phase;
  switch (weather) {
    case "sun":
      return { clouds: lerp(0.14, 0.03), dark: 0, fall: 0, snow: 0 };
    case "partly":
      return { clouds: lerp(0.48, 0.26), dark: lerp(0.15, 0.05), fall: 0, snow: 0 };
    case "clouds":
      // Drizzle under the darkest overcast.
      return {
        clouds: lerp(0.95, 0.62),
        dark: lerp(0.55, 0.28),
        fall: Math.max(0, 0.4 - phase) * 0.9,
        snow: 0,
      };
    case "rain":
      // All snow at the deep end, sleet in between, all rain from two-thirds on.
      return {
        clouds: 1,
        dark: lerp(0.85, 0.55),
        fall: lerp(1, 0.4),
        snow: Math.max(0, 1 - phase * 1.5),
      };
    default:
      // No weather (no form yet, or a forest's sky, shared by several people): a clear sky.
      return { clouds: 0, dark: 0, fall: 0, snow: 0 };
  }
}

const NIGHT_TOP = "var(--scene-background)";
const NIGHT_BOTTOM = mix("var(--primary)", 8, "var(--scene-card)");
const DAY_TOP = "oklch(0.5 0.09 245)";
const DAY_BOTTOM = "oklch(0.74 0.06 225)";
/** The violet above the warm horizon of sunrise and sunset. */
const VIOLET = "oklch(0.4 0.08 295)";

/**
 * The sky's colours at a moment: `top` at the zenith, `bottom` at the horizon. The top is also the page's
 * background around a scene (see components/sky/SkyPage), so the sky runs on behind the top bar without an edge.
 */
export function skyColors(d: Pick<Daylight, "light" | "glow">) {
  return {
    top: mix(VIOLET, d.glow * 30, mix(DAY_TOP, d.light * 100, NIGHT_TOP)),
    bottom: mix(WARM, d.glow * 55, mix(DAY_BOTTOM, d.light * 100, NIGHT_BOTTOM)),
  };
}

/**
 * A far ridge as an opaque colour: `color` thinned toward the sky at the horizon by `o` (what an `opacity` of `o`
 * would give over it), so a cloud passing behind the mountain is hidden by it instead of showing through.
 */
export function hazed(color: string, d: Pick<Daylight, "light" | "glow">, o: number) {
  return mix(color, o * 100, skyColors(d).bottom);
}
