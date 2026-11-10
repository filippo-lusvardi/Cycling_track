// Gear by typing: "lavato la bici", "catena nuova", "pastiglie posteriori cambiate ieri", "tagliando canyon",
// "nota canyon freno che fischia", "uscita di ieri con la topstone", "nuova bici Canyon Ultimate", and reading:
// "km catena", "km canyon", "ultimo lavaggio", "quando ho cambiato la catena". A name alone opens that gear.
// Every row that saves says so and is chosen to happen; undo goes back to how the gear was.
import { parseISO } from "date-fns";
import type { Dest, Entry } from "./ask";
import type { IntentData, WriteAction } from "./ask-intents";
import { namesTime } from "./ask-read";
import {
  addEvent,
  componentKm,
  current,
  dayOf,
  gearKindOf,
  gearKm,
  gearNamed,
  gearOf,
  kmSinceWash,
  kmText,
  lastWash,
  lifetimes,
  newGear,
  PARTS,
  partsIn,
  replacePart,
  ridesByGear,
  gearUseOf,
  usualOf,
  type Gear,
  type PartKind,
} from "./gear";
import { format, num, t } from "./i18n";
import type { Activity } from "./intervals";

const route = (to: string, search?: Record<string, string>): Dest => ({
  kind: "route",
  to,
  ...(search ? { search } : {}),
});

const saveRow = (id: string, q: string, answer: string, action: WriteAction): Entry => ({
  id,
  q,
  answer,
  page: "save",
  kind: "plan",
  exact: true,
  dest: { kind: "write", action },
});

const openRow = (g: Gear, q: string, answer?: string, value?: string, part?: PartKind): Entry => ({
  id: `gear-open-${g.id}-${part ?? ""}-${q}`,
  q,
  ...(answer ? { answer } : {}),
  ...(value ? { value } : {}),
  page: "gear",
  kind: "plan",
  exact: true,
  dest: route("/gear", { id: g.id, ...(part ? { part } : {}) }),
});

const WASH =
  /^(?:lavat[oaie]|lavaggio|lavare|lavo|lavata|pulit[oaie]|pulizia|washed|wash|cleaned)$/;
const NEW =
  /^(?:nuov[oaie]|cambiat[oaie]|cambio|cambiare|cambiate|sostituit[oaie]|sostituzione|sostituire|montat[oaie]|new|replaced|changed|replace|fitted)$/;
const SERVICE = /^(?:tagliando|revisione|service|serviced|revisionata|revisionato)$/;
const FILLER =
  /^(?:la|il|le|lo|i|gli|l'|la|ho|hai|mia|mie|mio|miei|di|del|della|dei|delle|sulla|sulle|sul|alla|alle|al|the|my|a|an|of|on|to|bici|bike|bikes|scarpe|shoes|e|and|oggi|today)$/;
const KIND_WORDS = /^(?:bici|bike|bikes|scarpe|shoes)$/;

const dayLabel = (day: string, today: string) =>
  day === today ? t("today", "oggi") : format(parseISO(day), "EEE d MMM");

/** A single day said somewhere in the words ("ieri", "3 giorni fa", "sabato"), not in the future. */
function takeDay(
  words: string[],
  skip: Set<number>,
  today: string,
): { day: string; used: Set<number> } | null {
  for (let len = Math.min(4, words.length); len >= 1; len--)
    for (let i = 0; i + len <= words.length; i++) {
      const idx = Array.from({ length: len }, (_, k) => i + k);
      if (idx.some((k) => skip.has(k))) continue;
      const phrase = idx.map((k) => words[k]).join(" ");
      if (/^\d+$/.test(phrase)) continue;
      const w = namesTime(phrase, today);
      if (w && w.from === w.to && w.from <= today) return { day: w.from, used: new Set(idx) };
    }
  return null;
}

const leftover = (words: string[], used: Set<number>) =>
  words.filter((w, i) => !used.has(i) && !FILLER.test(w));

/** The bikes (or shoes) a line is about: the one named, else the usual one first. */
function whichGear(gears: Gear[], kind: "bike" | "shoes", named: Gear | null): Gear[] {
  if (named) return named.kind === kind ? [named] : [];
  const live = gears.filter((g) => g.kind === kind && !g.retired);
  const usual = usualOf(gears, kind);
  return [...live].sort((a, b) => Number(b === usual) - Number(a === usual)).slice(0, 3);
}

export function gearRows(d: IntentData, s: string, query: string): Entry[] {
  const words = s.split(" ").filter(Boolean);
  if (!words.length) return [];
  const gears = d.gear?.gears ?? [];
  const overrides = d.gear?.overrides ?? {};
  const acts = d.acts ?? [];

  // "nuova bici Canyon Ultimate", "nuove scarpe Pegasus 41": the name as typed, capitals kept.
  const adding =
    /^(?:nuova bici|nuove scarpe|new bike|new shoes|aggiungi bici|aggiungi scarpe|add bike|add shoes)(?: (.+))?$/.exec(
      s,
    );
  if (adding) {
    const shoes = /scarpe|shoes/.test(s);
    const raw = query.trim().split(/\s+/).slice(2).join(" ").trim();
    if (!raw)
      return [
        {
          id: "gear-add-hint",
          q: shoes
            ? t("new shoes + name", "nuove scarpe + nome")
            : t("new bike + name", "nuova bici + nome"),
          page: "gear",
          kind: "plan",
          exact: true,
          dest: route("/gear"),
        },
      ];
    if (gears.some((g) => g.name.toLowerCase() === raw.toLowerCase())) return [];
    const g = newGear({ name: raw, kind: shoes ? "shoes" : "bike" }, gears, d.today);
    return [
      saveRow(
        "gear-add",
        shoes
          ? t(`Add shoes ${raw}`, `Aggiungi scarpe ${raw}`)
          : t(`Add bike ${raw}`, `Aggiungi bici ${raw}`),
        g.uses.length
          ? shoes
            ? t("From today your runs count on them", "Da oggi le corse contano su di loro")
            : t("From today your rides count on it", "Da oggi le uscite contano su di lei")
          : t("In Gear, from today", "In Attrezzatura, da oggi"),
        { kind: "gear", gear: g, label: raw },
      ),
    ];
  }
  if (!gears.length) return [];

  const name = gearNamed(gears, words);
  const named = name?.gear ?? null;
  const used = new Set(name?.used ?? []);
  const byGear = ridesByGear(acts, gears, overrides);
  const rides = (g: Gear) => byGear.get(g.id) ?? [];

  // Reading: "km catena", "km canyon", "ultimo lavaggio", "quando ho cambiato la catena".
  const reading = /^(?:km|chilometri|kms)$/.test(words[0]!);
  const when = /^(?:quando|when)$/.test(words[0]!) || /^(?:ultimo|ultima|last)$/.test(words[0]!);
  const parts = partsIn(words);
  for (const i of parts.used) used.add(i);

  if (reading) {
    const rest = leftover(words.slice(1), new Set([...used].map((i) => i - 1)));
    if (rest.length) return [];
    if (parts.parts.length) {
      const pool = named ? [named] : gears.filter((g) => g.kind === "bike" && !g.retired);
      return pool.flatMap((g) =>
        parts.parts.flatMap((p) => {
          const c = current(g, p);
          if (!c) return [];
          const km = componentKm(c, rides(g));
          const left = c.intervalKm ? c.intervalKm - km : null;
          return [
            openRow(
              g,
              `${PARTS[p].label()} · ${g.name}`,
              [
                t(
                  `On since ${format(parseISO(c.fitted), "d MMM yyyy")}`,
                  `Montaggio: ${format(parseISO(c.fitted), "d MMM yyyy")}`,
                ),
                c.intervalKm
                  ? left! >= 0
                    ? t(
                        `every ${num(c.intervalKm)} km, ${kmText(left!)} to go`,
                        `ogni ${num(c.intervalKm)} km, ne mancano ${num(Math.round(left!))}`,
                      )
                    : t(
                        `${kmText(-left!)} past its ${num(c.intervalKm)}`,
                        `${kmText(-left!)} oltre i ${num(c.intervalKm)}`,
                      )
                  : null,
              ]
                .filter(Boolean)
                .join(" · "),
              kmText(km),
              p,
            ),
          ];
        }),
      );
    }
    if (named) return [openRow(named, named.name, undefined, kmText(gearKm(named, rides(named))))];
    return [];
  }

  if (
    when &&
    (words.some((w) => WASH.test(w)) || words.some((w) => NEW.test(w)) || parts.parts.length)
  ) {
    const pool = named ? [named] : gears.filter((g) => g.kind === "bike" && !g.retired);
    if (words.some((w) => WASH.test(w)) && !parts.parts.length)
      return pool.map((g) => {
        const w = lastWash(g);
        const since = kmSinceWash(g, rides(g));
        return openRow(
          g,
          t(`Last wash · ${g.name}`, `Ultimo lavaggio · ${g.name}`),
          w
            ? t(`${kmText(since ?? 0)} ago`, `${kmText(since ?? 0)} fa`)
            : t("None written down", "Nessuno annotato"),
          w ? format(parseISO(w), "d MMM") : "–",
        );
      });
    return pool.flatMap((g) =>
      parts.parts.flatMap((p) => {
        const last = g.events
          .filter((e) => e.kind === "replace" && e.part === p)
          .map((e) => e.date)
          .sort()
          .at(-1);
        const c = current(g, p);
        if (!last && !c) return [];
        return [
          openRow(
            g,
            t(
              `${PARTS[p].label()} last changed · ${g.name}`,
              `${PARTS[p].label()}: ultimo cambio · ${g.name}`,
            ),
            c
              ? t(
                  `${kmText(componentKm(c, rides(g)))} since`,
                  `${kmText(componentKm(c, rides(g)))} da allora`,
                )
              : undefined,
            last ? format(parseISO(last), "d MMM yyyy") : "–",
            p,
          ),
        ];
      }),
    );
  }

  // Saving: wash, replace, service, note. What's left over must be nothing but a day.
  const washing = words.findIndex((w) => WASH.test(w));
  const newing = words.findIndex((w) => NEW.test(w));
  const servicing = words.findIndex((w) => SERVICE.test(w));
  const noting = /^(?:nota|note)$/.test(words[0]!) ? 0 : -1;
  const onWith = words.findIndex((w) => /^(?:con|with|sulla|sulle|on)$/.test(w));

  if (noting === 0) {
    if (!named) return [];
    const text = query
      .trim()
      .split(/\s+/)
      .filter((_, i) => i > 0 && !name!.used.has(i))
      .join(" ")
      .trim();
    if (!text) return [];
    const pool = [named];
    return pool.map((g) =>
      saveRow(
        `gear-note-${g.id}`,
        t(`Note on ${g.name}: ${text}`, `Nota su ${g.name}: ${text}`),
        t("In its log, today", "Nel suo diario, oggi"),
        {
          kind: "gear",
          gear: addEvent(g, { date: d.today, kind: "note", note: text }),
          label: t("Note", "Nota"),
        },
      ),
    );
  }

  if (washing >= 0 || servicing >= 0 || (newing >= 0 && parts.parts.length)) {
    const verb = washing >= 0 ? washing : servicing >= 0 ? servicing : newing;
    used.add(verb);
    if (newing >= 0) used.add(newing);
    words.forEach((w, i) => KIND_WORDS.test(w) && used.add(i));
    const day = takeDay(words, used, d.today);
    for (const i of day?.used ?? []) used.add(i);
    if (leftover(words, used).length) return [];
    const date = day?.day ?? d.today;
    const when = dayLabel(date, d.today);
    const pool = whichGear(gears, "bike", named);
    if (washing >= 0)
      return pool.map((g) => {
        const since = kmSinceWash(g, rides(g));
        return saveRow(
          `gear-wash-${g.id}`,
          t(`Wash · ${g.name}, ${when}`, `Lavaggio · ${g.name}, ${when}`),
          since == null
            ? t("In its log", "Nel suo diario")
            : t(
                `In its log · the last was ${kmText(since)} ago`,
                `Nel suo diario · l'ultimo era ${kmText(since)} fa`,
              ),
          { kind: "gear", gear: addEvent(g, { date, kind: "wash" }), label: t("Wash", "Lavaggio") },
        );
      });
    if (servicing >= 0) {
      const p = parts.parts.length === 1 ? parts.parts[0] : undefined;
      return pool.map((g) =>
        saveRow(
          `gear-service-${g.id}`,
          t(`Service · ${g.name}, ${when}`, `Tagliando · ${g.name}, ${when}`),
          t("In its log", "Nel suo diario"),
          {
            kind: "gear",
            gear: addEvent(g, { date, kind: "service", ...(p ? { part: p } : {}) }),
            label: t("Service", "Tagliando"),
          },
        ),
      );
    }
    const what = parts.parts.map((p) => PARTS[p].label().toLowerCase()).join(t(" and ", " e "));
    return pool.map((g) => {
      let next = g;
      for (const p of parts.parts) next = replacePart(next, p, date);
      const one = parts.parts.length === 1 ? parts.parts[0]! : null;
      const old = one ? current(g, one) : null;
      const life = one ? lifetimes(g, rides(g)).find((l) => l.part === one) : null;
      const answer = old
        ? t(
            `The old one goes among the past: ${kmText(componentKm(old, rides(g)))}${life?.usual ? ` (usually ${kmText(life.usual)})` : ""}`,
            `Il vecchio va tra i precedenti: ${kmText(componentKm(old, rides(g)))}${life?.usual ? ` (di solito ti dura ${kmText(life.usual)})` : ""}`,
          )
        : t(`Followed from ${when}`, `Seguito da ${when}`);
      return saveRow(
        `gear-replace-${g.id}`,
        t(`Replaced ${what} · ${g.name}, ${when}`, `Sostituzione ${what} · ${g.name}, ${when}`),
        answer,
        { kind: "gear", gear: next, label: t(`Replaced ${what}`, `Sostituzione ${what}`) },
      );
    });
  }

  // "uscita di ieri con la topstone", "questa corsa con le pegasus", "con la topstone" on an activity's page.
  if (onWith >= 0 && named) {
    used.add(onWith);
    const sportWord = words.findIndex((w) =>
      /^(?:uscita|pedalata|giro|ride|corsa|run|attivita|activity|questa|this|ultima|last)$/.test(w),
    );
    if (sportWord >= 0) used.add(sportWord);
    const day = takeDay(words, used, d.today);
    for (const i of day?.used ?? []) used.add(i);
    if (leftover(words, used).length) return [];
    const kind = named.kind;
    const fits = (a: Activity) => {
      const use = gearUseOf(a);
      return use != null && gearKindOf(use) === kind;
    };
    const latest = [...acts]
      .filter(fits)
      .sort((a, b) => b.start_date_local.localeCompare(a.start_date_local));
    const here =
      d.here?.kind === "ride"
        ? acts.find((a) => a.id === (d.here as { id: string }).id)
        : undefined;
    const target = day
      ? latest.filter((a) => dayOf(a) === day.day)
      : here && fits(here) && !/^(?:ultima|last)$/.test(words[sportWord] ?? "")
        ? [here]
        : latest.slice(0, 1);
    return target.slice(0, 3).flatMap((a) => {
      const was = gearOf(a, gears, overrides);
      if (was?.id === named.id) return [];
      const km = kmText((a.distance ?? 0) / 1000);
      return [
        saveRow(
          `gear-ride-${a.id}-${named.id}`,
          t(
            `${a.name ?? "Activity"} on ${named.name}`,
            `${a.name ?? "Attività"} con ${named.name}`,
          ),
          [
            format(parseISO(a.start_date_local), "EEE d MMM"),
            was
              ? t(
                  `${km} move from ${was.name} to ${named.name}`,
                  `${km} passano da ${was.name} a ${named.name}`,
                )
              : t(`${km} go on ${named.name}`, `${km} passano su ${named.name}`),
          ].join(" · "),
          { kind: "gear-ride", activityId: a.id, gearId: named.id, label: named.name },
        ),
      ];
    });
  }

  // A gear's name alone opens it.
  if (named && !leftover(words, used).length)
    return [
      openRow(
        named,
        named.name,
        t("Its parts and log", "Le sue parti e il diario"),
        kmText(gearKm(named, rides(named))),
      ),
    ];
  return [];
}
