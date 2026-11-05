// What each part of the Tree and the Garden means: Settings' guides, the legend and the typed questions all read these.
import { t } from "./i18n";
import { byMain } from "./sport";

export type GuideItem = { id?: string; term: string; text: string; points?: string[] };

/** Each part of the Tree page: what it shows, plus a bullet per detail where there are several. */
export const SPROUTS: GuideItem = {
  id: "sprouts",
  term: t("Sprouts", "Germogli"),
  text: t(
    byMain(
      "A day trained off the bike (run, gym, swim, hike…), in the sport's colour: that training grows in the garden. It still counts for the trunk and the crown.",
      "A day of another sport (bike, gym, swim, hike…), in the sport's colour: that training grows in the garden. It still counts for the trunk and the crown.",
    ),
    byMain(
      "Un giorno di allenamento senza bici (corsa, palestra, nuoto, escursione…), nel colore dello sport: quell'allenamento cresce nell'orto. Conta comunque per il tronco e la chioma.",
      "Un giorno di un altro sport (bici, palestra, nuoto, escursione…), nel colore dello sport: quell'allenamento cresce nell'orto. Conta comunque per il tronco e la chioma.",
    ),
  ),
};

export const TREE_GUIDE: GuideItem[] = [
  {
    id: "crown",
    term: t("Crown", "Chioma"),
    text: t(
      "Today's readiness as a season: HRV, sleep, form, check-in (if you use it) and how your recent activities felt, each compared with your own normal. Tap for today's advice and the check-in.",
      "La readiness di oggi come stagione: HRV, sonno, forma, check-in (se lo usi) e come sono andate le ultime attività, ognuno rispetto al tuo normale. Tocca per il consiglio del giorno e il check-in.",
    ),
    points: [
      t("Summer (≥ 75): ready for intensity", "Estate (≥ 75): giornata da intensità"),
      t("Spring (≥ 55): endurance day", "Primavera (≥ 55): giornata di fondo"),
      t("Autumn (≥ 40): go easy", "Autunno (≥ 40): vai piano"),
      t("Winter: rest", "Inverno: riposo"),
      t(
        "Capped at spring when fatigue reaches 1.3× fitness or fitness rises 6 in a week; at autumn from 1.5× or +8. Stricter for six weeks after injury, illness or two weeks off.",
        "Si ferma alla primavera quando la fatica arriva a 1,3× il fitness o il fitness sale di 6 in una settimana; all'autunno da 1,5× o +8. Più severo per sei settimane dopo infortunio, malattia o due settimane di stop.",
      ),
    ],
  },
  {
    id: "sky",
    term: t("Sky", "Cielo"),
    text: t(
      "Form (TSB) as a share of fitness, like intervals.icu: −20 means more at fitness 40 than at 100. How your last activities felt can move it a little.",
      "Forma (TSB) in percentuale del fitness, come su intervals.icu: −20 pesa di più con fitness 40 che con fitness 100. Come sono andate le ultime attività può spostarla un po'.",
    ),
    points: [
      t("Sun (over +5%): fresh", "Sole (oltre +5%): fresco"),
      t("Sun and clouds (−10% to +5%): neutral", "Sole e nuvole (da −10% a +5%): neutro"),
      t("Clouds (−30% to −10%): training hard", "Nuvole (da −30% a −10%): sotto carico"),
      t("Rain (under −30%): overreached", "Pioggia (sotto −30%): overreaching"),
    ],
  },
  {
    id: "wind",
    term: t("Wind in the crown", "Vento nella chioma"),
    text: t(
      "A trend over several days, worth watching before it shows in readiness: HRV below your usual for a week; high fatigue, high stress or low mood on most recent check-ins; or short nights. Tap the crown to see which.",
      "Una tendenza di più giorni da tenere d'occhio prima che si veda nella readiness: HRV sotto il tuo solito da una settimana; fatica o stress alti o umore basso nella maggior parte degli ultimi check-in; oppure notti corte. Tocca la chioma per vedere quale.",
    ),
  },
  {
    id: "limit",
    term: t("Limit", "Limite"),
    text: t(
      "On easy and endurance days, the power and heart rate to stay under: the top of Z1 or Z2 in your intervals.icu zones.",
      "Nei giorni facili e di fondo, potenza e frequenza cardiaca da non superare: il limite di Z1 o Z2 nelle tue zone di intervals.icu.",
    ),
  },
  {
    id: "focus",
    term: t("Training focus", "Focus di allenamento"),
    text: t(
      "What to train in this block (base, high aerobic, VO2max, anaerobic, sprint), shown above the crown. Readiness decides when to go hard; the focus decides what. It comes from:",
      "Cosa allenare in questo blocco (base, aerobico alto, VO2max, anaerobico, sprint), mostrato sopra la chioma. La readiness decide quando spingere; il focus decide cosa. Nasce da:",
    ),
    points: [
      t(
        "Your races in the next 20 weeks (add them in Calendar with kind, estimated time and sprint finish); A counts more than B and C, nearer more than later",
        "Le tue gare nelle prossime 20 settimane (aggiungile dal Calendario con tipo, tempo stimato e arrivo in volata); A conta più di B e C, le più vicine più delle lontane",
      ),
      t(
        "With no races, the complete cyclist: everything counts the same",
        "Senza gare, il ciclista completo: tutto conta allo stesso modo",
      ),
      byMain(
        t(
          "Your last 42 days of power against your best of the year: the biggest gap that the races need",
          "La tua potenza degli ultimi 42 giorni rispetto al tuo meglio dell'anno: il divario più grande tra quelli che servono alle gare",
        ),
        t(
          "Your last 42 days of grade-adjusted pace against your best of the year: the biggest gap that the races need",
          "Il tuo passo corretto per pendenza degli ultimi 42 giorni rispetto al tuo meglio dell'anno: il divario più grande tra quelli che servono alle gare",
        ),
      ),
      byMain(
        t(
          "Base first when steady rides decouple, Z2 time drops, fitness is well below your usual, or your 20 min power fades over 15% after 30 kJ/kg (Analysis → Durability)",
          "Prima la base se il decoupling delle uscite regolari sale, il tempo in Z2 cala, il fitness è molto sotto il solito o la potenza sui 20 min cala oltre il 15% dopo 30 kJ/kg (Analisi → Durability)",
        ),
        t(
          "Base first when easy runs drift, Z2 time drops, fitness is well below your usual, or your 5 min pace fades over 15% after 25 km (Analysis → Late-run fade)",
          "Prima la base se il decoupling delle corse lente sale, il tempo in Z2 cala, il fitness è molto sotto il solito o il passo sui 5 min cala oltre il 15% dopo 25 km (Analisi → Calo nel finale)",
        ),
      ),
      t(
        "A block lasts at least two weeks; around races: taper 10 days before an A, easy 3 days before a B, recovery the day after",
        "Un blocco dura almeno due settimane; attorno alle gare: scarico 10 giorni prima di una A, facile 3 giorni prima di una B, recupero il giorno dopo",
      ),
    ],
  },
  {
    id: "buds",
    term: t("Buds above the crown", "Gemme sopra la chioma"),
    text: t(
      "Workouts planned for today in intervals.icu.",
      "Allenamenti pianificati per oggi su intervals.icu.",
    ),
  },
  {
    id: "trunk",
    term: t("Trunk", "Tronco"),
    text: t(
      "Fitness (CTL): the wider, the fitter compared with the rest of your history.",
      "Fitness (CTL): più è largo, più sei in forma rispetto al resto del tuo storico.",
    ),
  },
  {
    id: "branches",
    term: t("Branches", "Rami"),
    text: t(
      byMain(
        "One per ride in the last 5 days (only cycling grows branches):",
        "One per run in the last 5 days (only running grows branches):",
      ),
      byMain(
        "Uno per uscita in bici negli ultimi 5 giorni (solo la bici fa crescere i rami):",
        "Uno per corsa negli ultimi 5 giorni (solo la corsa fa crescere i rami):",
      ),
    ),
    points: [t("Length: duration", "Lunghezza: durata"), t("Thickness: load", "Spessore: carico")],
  },
  {
    id: "leaves",
    term: t("Leaves", "Foglie"),
    text: byMain(
      t(
        "One per 100 m climbed, coloured by intensity against FTP:",
        "Una ogni 100 m di dislivello, colorata per intensità rispetto all'FTP:",
      ),
      t(
        "One per 30 m climbed, coloured by intensity against threshold pace:",
        "Una ogni 30 m di dislivello, colorata per intensità rispetto al passo di soglia:",
      ),
    ),
    points: [
      t("Green: easy", "Verde: facile"),
      t("Blue: steady", "Blu: regolare"),
      t("Gold: tempo", "Oro: tempo"),
      t("Red: hard", "Rosso: dura"),
    ],
  },
  {
    id: "birds",
    term: t("Birds", "Uccellini"),
    text: t(
      "One per brioche eaten on that activity (set it at the bottom of its page). Each is a sparrow, robin, snow bunting, blackbird, blue tit, goldfinch or kingfisher, at random.",
      "Uno per ogni brioche mangiata in quell'attività (impostala in fondo alla sua pagina). Ognuno è un passero, un pettirosso, uno zigolo delle nevi, un merlo, una cinciarella, un cardellino o un martin pescatore, a caso.",
    ),
  },
  {
    id: "squirrel",
    term: t("Squirrel", "Scoiattolo"),
    text: t(
      byMain(
        "Lives on the branch of your longest ride ever.",
        "Lives on the branch of your longest run ever.",
      ),
      byMain(
        "Vive sul ramo della tua uscita più lunga di sempre.",
        "Vive sul ramo della tua corsa più lunga di sempre.",
      ),
    ),
  },
  {
    id: "owl",
    term: t("Owl", "Gufo"),
    text: t(
      byMain(
        "Keeps watch on the branch of the ride with the most climbing ever.",
        "Keeps watch on the branch of the run with the most climbing ever.",
      ),
      byMain(
        "Fa la guardia sul ramo dell'uscita con più dislivello di sempre.",
        "Fa la guardia sul ramo della corsa con più dislivello di sempre.",
      ),
    ),
  },
  {
    id: "rest",
    term: t("Small green dots", "Puntini verdi"),
    text: t("Rest days on the bark.", "Giorni di riposo sulla corteccia."),
  },
  SPROUTS,
  {
    id: "knots",
    term: t("Knots", "Nodi"),
    text: t(
      "A dark spiral for each day sick or injured, from Sick and Injured events in the intervals.icu calendar. Mark today in the crown's sheet, or a past run of rest days by tapping it.",
      "Una spirale scura per ogni giorno di malattia o infortunio, dagli eventi Sick e Injured del calendario di intervals.icu. Segna oggi dal pannello della chioma, o una serie passata di giorni di riposo toccandola.",
    ),
  },
  {
    id: "weeks",
    term: t("Weeks", "Settimane"),
    text: t(
      "Older history folds into one bough per week:",
      "Lo storico più vecchio si raccoglie in un ramo per settimana:",
    ),
    points: [
      t(
        "Golden bark: building (load above the last 4 weeks)",
        "Corteccia dorata: settimana di carico (carico sopra le 4 settimane precedenti)",
      ),
      t("Blue bark: recovery week", "Corteccia blu: settimana di scarico"),
    ],
  },
  {
    id: "roots",
    term: t("Roots", "Radici"),
    text: t(
      "Where your intervals.icu history begins.",
      "Dove inizia il tuo storico su intervals.icu.",
    ),
  },
  {
    id: "years",
    term: t("Years", "Anni"),
    text: t("The trunk cut across:", "Il tronco in sezione:"),
    points: [
      t(
        "One ring per year, the inner ones older",
        "Un anello per anno, i più interni sono i più vecchi",
      ),
      t("A wider ring is a bigger year", "Un anello più largo è un anno più intenso"),
      t("Darker grain is a heavier week", "Le venature scure sono le settimane più pesanti"),
      t(
        "A knot with the grain flowing around it, the same spiral as on the trunk: an injury, bigger the longer it lasted",
        "Un nodo con le venature che gli girano attorno, la stessa spirale del tronco: un infortunio, più grande quanto più è durato",
      ),
      t("Tap a month to open it in the calendar", "Tocca un mese per aprirlo nel calendario"),
    ],
  },
];

export const GARDEN_GUIDE: GuideItem[] = [
  {
    id: "plants",
    term: t("Plants", "Piante"),
    text: t(
      "One per session, in its sport's bed, older to the left. Taller for a longer session, lusher for a harder one. A new sport gets a vegetable at random, and you can change it in Settings; what a session bears depends on the sport:",
      "Una per seduta, nell'aiuola del suo sport, le più vecchie a sinistra. Più alta se è più lunga, più rigogliosa se è più dura. Un nuovo sport riceve un ortaggio a caso, e puoi cambiarlo nelle Impostazioni; quanto frutta una seduta dipende dallo sport:",
    ),
    points: [
      byMain(
        t("Running: one per 5 km", "Corsa: uno ogni 5 km"),
        t("Cycling: one per 20 km", "Ciclismo: uno ogni 20 km"),
      ),
      t("Strength: one, as big as the session", "Forza: uno, grande quanto la seduta"),
      t(
        "Yoga, pilates and stretching: one per 10 minutes",
        "Yoga, pilates e stretching: uno ogni 10 minuti",
      ),
      t(
        "Walks and hikes: one per 100 m climbed",
        "Camminate ed escursioni: uno ogni 100 m di dislivello",
      ),
      t("Swimming: one per 500 m", "Nuoto: uno ogni 500 m"),
      t("Skiing: the plant itself is the crop", "Sci: il raccolto è la pianta stessa"),
      t("Rowing and paddling: one per 3 km", "Canottaggio e pagaia: uno ogni 3 km"),
      t("Climbing: by the session's load", "Arrampicata: secondo il carico della seduta"),
      t(
        "A sport you named: one per quarter of an hour",
        "Uno sport con il tuo nome: uno ogni quarto d'ora",
      ),
      t("Other sports: one", "Altri sport: uno"),
    ],
  },
  {
    id: "ripening",
    term: t("Ripening", "Maturazione"),
    text: t(
      "Fruit is green the day you train and ripens over the week after, as the training is absorbed.",
      "La frutta è verde il giorno dell'allenamento e matura nella settimana dopo, mentre l'allenamento viene assorbito.",
    ),
  },
  {
    id: "soil",
    term: t("Soil", "Terra"),
    text: t(
      `Dark and moist when you've trained at your garden's sports regularly in the last 4 weeks, pale and resting when not.`,
      "Scura e umida con allenamenti regolari negli sport del tuo orto nelle ultime 4 settimane, altrimenti chiara e a riposo.",
    ),
  },
  {
    id: "animals",
    term: t("Animals", "Animali"),
    text: t(
      "A hedgehog under your longest run ever, a frog on your longest swim, a snail beside your longest walk or hike.",
      "Un riccio sotto la tua corsa più lunga di sempre, una rana sulla tua nuotata più lunga, una lumaca accanto alla tua camminata o escursione più lunga.",
    ),
  },
  {
    id: "garden-sky",
    term: t("Sky", "Cielo"),
    text: t(
      "The real time of day, with the moon at night; the weather is your form, as on the tree. The season is today's readiness.",
      "L'ora vera del giorno, con la luna di notte; il tempo è la tua forma, come sull'albero. La stagione è la readiness di oggi.",
    ),
  },
  {
    id: "pantry",
    term: t("Pantry", "Dispensa"),
    text: t(
      `A jar per month, as full as its hours ${byMain("off the bike", "at other sports")}, in layers coloured by sport. Tap one for that month's activities.`,
      `Un barattolo per mese, pieno quanto le sue ore ${byMain("senza bici", "di altri sport")}, a strati colorati per sport. Toccane uno per le attività di quel mese.`,
    ),
  },
];

/** How to use the search bar: one line each, with what to type. */
export const ASK_GUIDE: GuideItem[] = [
  {
    id: "find",
    term: t("Find", "Trovare"),
    text: t(
      "Type in your own words, in Italian or English: you get up to three alternatives, the best next to your thumb. All lists every page.",
      "Scrivi con parole tue, in italiano o in inglese: ricevi fino a tre alternative, la migliore vicino al pollice. Tutto elenca ogni pagina.",
    ),
    points: [
      "analisi",
      "vasi",
      t("the name of a ride or climb", "il nome di un'uscita o di una salita"),
      "fantabosco",
    ],
  },
  {
    id: "numbers",
    term: t("Numbers", "Numeri"),
    text: t("The value appears right in the row.", "Il valore appare direttamente nella riga."),
    points: ["ftp", "soglia", "z2", "fitness", "peso", "hrv"],
  },
  {
    id: "charts",
    term: t("One chart", "Un grafico"),
    text: t(
      "A chart's name opens only that chart.",
      "Il nome di un grafico apre solo quel grafico.",
    ),
    points: ["eftp", "durability", t("power curve", "curva di potenza"), t("sleep", "sonno")],
  },
  {
    id: "time",
    term: t("Any stretch of time", "Un periodo qualsiasi"),
    text: t(
      "A recap of what happened, and what's planned ahead.",
      "Il riepilogo di com'è andata, e cosa c'è in programma.",
    ),
    points: t(
      "tomorrow|saturday|last 10 days|last month|october|2025",
      "domani|sabato|ultimi 10 giorni|mese scorso|ottobre|2025",
    ).split("|"),
  },
  {
    id: "records",
    term: t("Your records", "I tuoi record"),
    text: t("Only ever yours.", "Sempre e solo tuoi."),
    points: t(
      "best manghen|last manghen|how many times manghen|best 20 min|best 10 km|km this year|longest ride",
      "best manghen|ultima manghen|quante volte manghen|best 20 min|best 10 km|km quest'anno|uscita più lunga",
    ).split("|"),
  },
  {
    id: "today",
    term: t("Today", "Oggi"),
    text: t("What today calls for, and why.", "Cosa chiede la giornata, e perché."),
    points: t(
      "what should i do|why|next race|eat 3 hours",
      "cosa faccio oggi|perché|prossima gara|mangiare 3 ore",
    ).split("|"),
  },
  {
    id: "save",
    term: t("Save", "Salvare"),
    text: t(
      "A row says what will be saved; choosing it saves, and the message that follows has Undo.",
      "Una riga dice cosa verrà salvato; sceglierla salva, e il messaggio che segue ha Annulla.",
    ),
    points: t(
      "weight 68.2|fat 14|sleep 7h 30|sick today|not sick|2 brioches|feel good",
      "peso 68.2|grasso 14|sonno 7h 30|malato oggi|non più malato|2 brioche|sensazione buona",
    ).split("|"),
  },
  {
    id: "plan",
    term: t("Plan", "Pianificare"),
    text: t(
      "Opens the Calendar on that day, ready to choose a workout.",
      "Apre il Calendario su quel giorno, pronto per scegliere un allenamento.",
    ),
    points: t(
      "plan tomorrow|plan saturday|plan 12 november",
      "plan domani|pianifica sabato|plan 12 novembre",
    ).split("|"),
  },
];
