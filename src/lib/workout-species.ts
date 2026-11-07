// Which plant or animal a workout is named after, read from its name: planned events and copies in a library carry only
// that. The logic of the names is at the top of workout-library-data.ts. `words` are what people call the work, so a workout
// can be found by typing either. Pure.
export type Species = { en: string; it: string; words: string };

export const SPECIES = {
  Moss: { en: "Moss", it: "Muschio", words: "recovery recupero scarico" },
  Fern: { en: "Fern", it: "Felce", words: "recovery recupero scarico" },
  Beech: { en: "Beech", it: "Faggio", words: "endurance fondo z2 easy lento" },
  Oak: { en: "Oak", it: "Quercia", words: "endurance fondo long lungo z2" },
  Fir: { en: "Fir", it: "Abete", words: "endurance fondo medio upper z2" },
  Birch: { en: "Birch", it: "Betulla", words: "endurance fondo surges scatti" },
  Maple: { en: "Maple", it: "Acero", words: "endurance fondo tempo" },
  Chestnut: { en: "Chestnut", it: "Castagno", words: "ironman triathlon fondo" },
  Spruce: { en: "Spruce", it: "Peccio", words: "aero triathlon" },
  Aspen: {
    en: "Aspen",
    it: "Pioppo tremolo",
    words: "cadence cadenza agilita spin strides allunghi",
  },
  Hazel: { en: "Hazel", it: "Nocciolo", words: "endurance fondo" },
  Cirmolo: { en: "Cirmolo", it: "Cirmolo", words: "sweet spot sweetspot" },
  Mugo: { en: "Mugo pine", it: "Pino mugo", words: "sweet spot sweetspot stanche tired" },
  Alpenrose: { en: "Alpenrose", it: "Rododendro", words: "sweet spot sweetspot kicks scatti" },
  Juniper: { en: "Juniper", it: "Ginepro", words: "tempo medio steady regolare" },
  Rowan: { en: "Rowan", it: "Sorbo", words: "strength forza big gear rapporto duro" },
  Larch: { en: "Larch", it: "Larice", words: "climb salita" },
  Bilberry: { en: "Bilberry", it: "Mirtillo", words: "70.3 triathlon simulazione gara race" },
  Chamois: { en: "Chamois", it: "Camoscio", words: "threshold soglia ftp cruise ripetute" },
  Ibex: { en: "Ibex", it: "Stambecco", words: "threshold soglia stepped gradini" },
  Hare: { en: "Hare", it: "Lepre", words: "threshold soglia rolling ondulata" },
  Dipper: { en: "Dipper", it: "Merlo acquaiolo", words: "over under overunder soglia threshold" },
  Eagle: { en: "Eagle", it: "Aquila", words: "vo2 vo2max" },
  Swift: { en: "Swift", it: "Rondone", words: "vo2 vo2max micro microintervalli" },
  Skylark: {
    en: "Skylark",
    it: "Allodola",
    words: "vo2 vo2max ramp rampa rising crescendo hills salita",
  },
  Goshawk: { en: "Goshawk", it: "Astore", words: "vo2 vo2max hard starts partenza forte" },
  Chough: { en: "Chough", it: "Gracchio", words: "vo2 vo2max above threshold sopra soglia" },
  Raven: { en: "Raven", it: "Corvo", words: "vo2 vo2max race simulazione gara" },
  Stoat: { en: "Stoat", it: "Ermellino", words: "anaerobic anaerobico speed velocita" },
  Peregrine: { en: "Peregrine", it: "Falco pellegrino", words: "sprint potenza power" },
  Grasshopper: {
    en: "Grasshopper",
    it: "Cavalletta",
    words: "sprint standing starts partenze da fermo",
  },
  Marten: { en: "Marten", it: "Martora", words: "anaerobic anaerobico decisive minuti decisivi" },
  Lynx: { en: "Lynx", it: "Lince", words: "anaerobic anaerobico maximal massimali minuti" },
  Weasel: {
    en: "Weasel",
    it: "Donnola",
    words: "anaerobic anaerobico race repeats ripetute gara seduti",
  },
  Wolf: { en: "Wolf", it: "Lupo", words: "beasts bestie psycho vo2 vo2max" },
  Bear: { en: "Bear", it: "Orso", words: "beasts bestie psycho vo2 vo2max" },
  Hornet: { en: "Hornet", it: "Calabrone", words: "beasts bestie psycho vo2 vo2max" },
  Viper: { en: "Viper", it: "Vipera", words: "beasts bestie psycho vo2 vo2max" },
  Boar: { en: "Boar", it: "Cinghiale", words: "beasts bestie psycho vo2 vo2max limite limit" },
  Badger: { en: "Badger", it: "Tasso", words: "beasts bestie psycho vo2 vo2max" },
  Crocus: { en: "Crocus", it: "Croco", words: "opener attivazione warmup riscaldamento pre gara" },
  Primrose: { en: "Primrose", it: "Primula", words: "warmup riscaldamento gara race" },
  Edelweiss: {
    en: "Edelweiss",
    it: "Stella alpina",
    words: "warmup riscaldamento salita climb gara race",
  },
  Poppy: { en: "Poppy", it: "Papavero", words: "warmup riscaldamento pianura flat gara race" },
  Gentian: { en: "Gentian", it: "Genziana", words: "warmup riscaldamento ftp test" },
} satisfies Record<string, Species>;

export type SpeciesKey = keyof typeof SPECIES;

const ALL = Object.entries(SPECIES) as [SpeciesKey, Species][];
const known = new Map<string, SpeciesKey | null>();

/** The species a workout's name starts with, then only its dose; a name of your own has none. */
export function speciesOf(name: string | null | undefined): SpeciesKey | null {
  if (!name) return null;
  const hit = known.get(name);
  if (hit !== undefined) return hit;
  const plain = name
    .trim()
    .replace(/\s*\((?:copy|copia)\)$/i, "")
    .toLowerCase();
  const found = ALL.find(([, s]) =>
    [s.en, s.it].some((n) => {
      const word = n.toLowerCase();
      return (
        plain === word || (plain.startsWith(`${word} `) && /^\d/.test(plain.slice(word.length + 1)))
      );
    }),
  );
  const key = found?.[0] ?? null;
  known.set(name, key);
  return key;
}
