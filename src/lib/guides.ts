// What each part of the Tree and the Garden means: Settings' guides, the legend and the typed questions all read these.
import { t } from "./i18n";
import { byMain } from "./sport";

export type GuideItem = { id?: string; term: string; text: string; points?: string[] };

/** Each part of the Tree page: what it shows, plus a bullet per detail where there are several. */
export const SPROUTS: GuideItem = {
  id: "sprouts",
  term: t("Sprouts", "Germogli"),
  text: t(
    "A day of another sport (gym, swim, hike…), in its colour: that training grows in the garden. It still counts for the trunk and the crown.",
    "Un giorno di un altro sport (palestra, nuoto, escursione…), nel suo colore: quell'allenamento cresce nell'orto. Conta comunque per il tronco e la chioma.",
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
    text: byMain(
      t(
        "On easy and endurance days, the power and heart rate to stay under: the top of Z1 or Z2 in your zones.",
        "Nei giorni facili e di fondo, potenza e frequenza cardiaca da non superare: il limite di Z1 o Z2 nelle tue zone.",
      ),
      t(
        "On easy and endurance days, the pace and heart rate to keep to: the limit of Z1 or Z2 in your zones.",
        "Nei giorni facili e di fondo, passo e frequenza cardiaca da rispettare: il limite di Z1 o Z2 nelle tue zone.",
      ),
    ),
  },
  {
    id: "focus",
    term: t("Training focus", "Focus di allenamento"),
    text: byMain(
      t(
        "What to train in this block (base, high aerobic, VO2max, anaerobic, sprint), shown above the crown. Readiness decides when to go hard; the focus decides what. It comes from:",
        "Cosa allenare in questo blocco (base, aerobico alto, VO2max, anaerobico, sprint), mostrato sopra la chioma. La readiness decide quando spingere; il focus decide cosa. Nasce da:",
      ),
      t(
        "What to train in this block (base, threshold, VO2max, speed), shown above the crown. Readiness decides when to go hard; the focus decides what. It comes from:",
        "Cosa allenare in questo blocco (base, soglia, VO2max, velocità), mostrato sopra la chioma. La readiness decide quando spingere; il focus decide cosa. Nasce da:",
      ),
    ),
    points: [
      byMain(
        t(
          "Your races in the next 20 weeks (add them in Calendar with kind, estimated time and sprint finish); A counts more than B and C, nearer more than later",
          "Le tue gare nelle prossime 20 settimane (aggiungile dal Calendario con tipo, tempo stimato e arrivo in volata); A conta più di B e C, le più vicine più delle lontane",
        ),
        t(
          "Your races in the next 20 weeks (add them in Calendar with kind and estimated time); A counts more than B and C, nearer more than later",
          "Le tue gare nelle prossime 20 settimane (aggiungile dal Calendario con tipo e tempo stimato); A conta più di B e C, le più vicine più delle lontane",
        ),
      ),
      t(
        "With no races, all-round: everything counts the same",
        "Senza gare, a tutto tondo: tutto conta allo stesso modo",
      ),
      byMain(
        t(
          "Your last 42 days of power against your best of the year: the biggest gap that the races need",
          "La tua potenza degli ultimi 42 giorni rispetto al tuo meglio dell'anno: il divario più grande tra ciò che serve alle gare",
        ),
        t(
          "Your last 42 days of grade-adjusted pace against your best of the year: the biggest gap that the races need",
          "Il tuo passo corretto per pendenza degli ultimi 42 giorni rispetto al tuo meglio dell'anno: il divario più grande tra ciò che serve alle gare",
        ),
      ),
      byMain(
        t(
          "Base first when steady rides decouple, Z2 time drops, fitness is well below your usual, or your 20 min power fades over 15% after 30 kJ/kg (Analysis → Durability)",
          "Prima la base se il decoupling delle uscite regolari sale, il tempo in Z2 cala, il fitness è molto sotto il solito o la potenza sui 20 min cala oltre il 15% dopo 30 kJ/kg (Analisi → Durability)",
        ),
        t(
          "Base first when easy runs decouple, Z2 time drops, fitness is well below your usual, or your 5 min pace fades over 15% after 25 km (Analysis → Late-run fade)",
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
    text: t("Workouts planned for today.", "Allenamenti pianificati per oggi."),
  },
  {
    id: "trunk",
    term: t("Trunk", "Tronco"),
    text: t(
      "Fitness (CTL): the wider, the fitter compared with the rest of your history.",
      "Fitness (CTL): più è largo, più è alto il fitness rispetto al resto del tuo storico.",
    ),
  },
  {
    id: "branches",
    term: t("Branches", "Rami"),
    text: t(
      "One per activity of your main sport in the last 5 days:",
      "Uno per attività del tuo sport principale negli ultimi 5 giorni:",
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
      "Lives on the branch of your longest activity ever.",
      "Vive sul ramo della tua attività più lunga di sempre.",
    ),
  },
  {
    id: "owl",
    term: t("Owl", "Gufo"),
    text: t(
      "Keeps watch on the branch of the activity with the most climbing ever.",
      "Fa la guardia sul ramo dell'attività con più dislivello di sempre.",
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
      "A dark spiral for each day sick or injured. Mark today in the crown's sheet, or a past stretch of rest days by tapping it.",
      "Una spirale scura per ogni giorno di malattia o infortunio. Segna oggi dal pannello della chioma, o una serie passata di giorni di riposo toccandola.",
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
    text: t("Where your history begins.", "Dove inizia il tuo storico."),
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
      "One per activity, in its sport's bed, older to the left. Taller for a longer one, lusher for a harder one. A new sport gets a vegetable at random, and you can change it in Settings; what an activity bears depends on the sport:",
      "Una per attività, nell'aiuola del suo sport, le più vecchie a sinistra. Più alta se è più lunga, più rigogliosa se è più dura. Un nuovo sport riceve un ortaggio a caso, e puoi cambiarlo nelle Impostazioni; quanto frutta un'attività dipende dallo sport:",
    ),
    points: [
      byMain(
        t("Running: one per 5 km", "Corsa: uno ogni 5 km"),
        t("Cycling: one per 20 km", "Ciclismo: uno ogni 20 km"),
      ),
      t("Strength: one, as big as the workout", "Forza: uno, grande quanto l'allenamento"),
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
      t("Climbing: by the activity's load", "Arrampicata: secondo il carico dell'attività"),
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
    text: byMain(
      t(
        "A hedgehog under your longest run ever, a frog on your longest swim, a snail beside your longest walk or hike.",
        "Un riccio sotto la tua corsa più lunga di sempre, una rana sulla tua nuotata più lunga, una lumaca accanto alla tua camminata o escursione più lunga.",
      ),
      t(
        "A frog on your longest swim ever, a snail beside your longest walk or hike.",
        "Una rana sulla tua nuotata più lunga di sempre, una lumaca accanto alla tua camminata o escursione più lunga.",
      ),
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
      "A jar per month, as full as its hours at other sports, in layers coloured by sport. Tap one for that month's activities.",
      "Un barattolo per mese, pieno quanto le sue ore di altri sport, a strati colorati per sport. Toccane uno per le attività di quel mese.",
    ),
  },
];

/** How to use the search bar: one line each, with what to type. A "+" in an example stands for a name of your own. */
export const ASK_GUIDE: GuideItem[] = [
  {
    id: "find",
    term: t("Find", "Trovare"),
    text: t(
      "Type in your own words, in Italian or English: you get up to three alternatives, the best next to your thumb. All lists every page.",
      "Scrivi con parole tue, in italiano o in inglese: ricevi fino a tre alternative, la migliore vicino al pollice. Tutto elenca ogni pagina.",
    ),
    points: [
      t("analysis", "analisi"),
      t("jars", "vasi"),
      t("the name of an activity or climb", "il nome di un'attività o di una salita"),
      t("the name of a forest", "il nome di un bosco"),
    ],
  },
  {
    id: "numbers",
    term: t("Numbers", "Numeri"),
    text: t("The value appears right in the row.", "Il valore appare direttamente nella riga."),
    points: [
      byMain("ftp", t("threshold pace", "passo di soglia")),
      t("threshold", "soglia"),
      "z2",
      "fitness",
      t("weight", "peso"),
      "hrv",
    ],
  },
  {
    id: "efforts",
    term: t("Efforts", "Sforzi"),
    text: t(
      "Power, heart rate, pace or speed, for any day, stretch or ride, with the words in any order. On an activity or a recap, what you ask is about that page.",
      "Potenza, FC, passo o velocità, per qualsiasi giorno, periodo o attività, con le parole in qualsiasi ordine. Su un'attività o un riepilogo, quello che chiedi riguarda quella pagina.",
    ),
    points: [
      t("power today 3m", "potenza oggi 3 min"),
      t("hr yesterday 5m", "fc ieri 5 min"),
      t("20 min power march", "20 min potenza marzo"),
      t("hr last activity 5m", "fc ultima attività 5 min"),
      t("avg hr this week", "fc media questa settimana"),
      t("speed march", "velocità marzo"),
    ],
  },
  {
    id: "distribution",
    term: t("Distribution", "Distribuzione"),
    text: t(
      "How the time was spread over power and heart rate, for an activity or a stretch.",
      "Come si è distribuito il tempo tra potenza e FC, per un'attività o un periodo.",
    ),
    points: [
      t("hr distribution this week", "distribuzione fc questa settimana"),
      t("power distribution last activity", "distribuzione potenza ultima attività"),
      t("zones march", "zone marzo"),
    ],
  },
  {
    id: "time-at",
    term: t("Time at", "Tempo a"),
    text: t(
      "How long in a zone, or past a value, on a day or a stretch.",
      "Quanto tempo in una zona o oltre un valore, in un giorno o un periodo.",
    ),
    points: [
      t("time in z2 this week", "tempo in z2 questa settimana"),
      t("time above 160 bpm today", "tempo sopra 160 bpm oggi"),
    ],
  },
  {
    id: "lists",
    term: t("Lists", "Elenchi"),
    text: t(
      "Your own activities that match, opened on their own list.",
      "Le tue attività che corrispondono, aperte in un elenco tutto loro.",
    ),
    points: [
      t("activities over 50 km", "attività sopra 50 km"),
      t("top 5 by climbing 2026", "top 5 per dislivello 2026"),
      t("indoor activities march", "attività indoor marzo"),
    ],
  },
  {
    id: "together",
    term: t("Several together", "Più cose insieme"),
    text: t(
      "Several questions in one line, the time said once. A line that saves several things shows each part before saving.",
      "Più domande in una riga, con il periodo detto una volta sola. Una riga che salva più cose le mostra una per una prima di salvare.",
    ),
    points: [
      t("km and climbing march", "km e dislivello marzo"),
      t("tired, weight 70", "stanco, peso 70"),
    ],
  },
  {
    id: "pinned",
    term: t("Pinned", "Fissate"),
    text: t(
      "The pin beside an answer keeps it at hand: up to three, answered afresh whenever you open the empty field.",
      "La puntina accanto a una risposta la tiene a portata di mano: fino a tre, aggiornate ogni volta che apri il campo vuoto.",
    ),
  },
  {
    id: "climb-ahead",
    term: t("A climb ahead", "Una salita davanti"),
    text: t(
      "How long a climb takes, or what power it asks for, from your curve, your weight and your own passes. A range, never to the second.",
      "Quanto ci metti su una salita, o che potenza chiede, dalla tua curva, dal tuo peso e dai tuoi passaggi. Un intervallo, mai al secondo.",
    ),
  },
  {
    id: "charts",
    term: t("One chart", "Un grafico"),
    text: t(
      "A chart's name opens only that chart.",
      "Il nome di un grafico apre solo quel grafico.",
    ),
    points: [
      ...byMain(
        ["eftp", "durability", t("power curve", "curva di potenza")],
        [t("best times", "migliori tempi"), t("pace curve", "curva del passo")],
      ),
      t("sleep", "sonno"),
    ],
  },
  {
    id: "time",
    term: t("Any stretch of time", "Un periodo qualsiasi"),
    text: t(
      "A recap of what happened, and what's planned ahead.",
      "Il riepilogo di com'è andata, e cosa c'è in programma.",
    ),
    points: t(
      "tomorrow|saturday|last 10 days|3 days ago|last weekend|october|september 2025|summer 2025|from march to june 2025|2025",
      "domani|sabato|ultimi 10 giorni|3 giorni fa|weekend scorso|ottobre|settembre 2025|estate 2025|da marzo a giugno 2025|2025",
    ).split("|"),
  },
  {
    id: "records",
    term: t("Your records", "I tuoi record"),
    text: t("Your bests and totals.", "I tuoi migliori e i tuoi totali."),
    points: [
      ...t(
        "best + climb|last + climb|how many times + climb",
        "miglior + salita|ultima + salita|quante volte + salita",
      ).split("|"),
      ...byMain(
        [t("best 20 min", "miglior 20 min"), t("best 5 min 2025", "miglior 5 min 2025")],
        [t("best pace 20 min", "miglior passo 20 min")],
      ),
      t("best 10 km", "miglior 10 km"),
      t("km this year", "km quest'anno"),
      t("how many km in september 2025", "quanti km ho fatto a settembre 2025"),
      t("september 2025 vs 2026", "settembre 2025 vs 2026"),
      byMain(t("longest ride", "pedalata più lunga"), t("longest run", "corsa più lunga")),
    ],
  },
  {
    id: "power",
    term: byMain(t("Power", "Potenza"), t("Pace", "Passo")),
    text: byMain(
      t(
        "What you've held for that long lately, against your year, your weight and your FTP.",
        "Quanto hai tenuto per quel tempo di recente, rispetto al tuo anno, al tuo peso e alla tua FTP.",
      ),
      t(
        "What you've held for that long lately, against your year and your threshold.",
        "Quanto hai tenuto per quel tempo di recente, rispetto al tuo anno e alla tua soglia.",
      ),
    ),
    points: byMain(
      t("power 5 min|power 30 s|power 2h", "potenza 5 min|potenza 30 s|potenza 2h"),
      t("pace 5 min|pace 20 min|pace 1h", "passo 5 min|passo 20 min|passo 1h"),
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
      "log 15m gym|log run 5 km 30 min at 18|tired today|slept badly|undo|weight 70|fat 15|sleep 7h 30|sick today|not sick|2 brioches|feel good",
      "registra palestra 15 min|ieri ho fatto corsa 5 km 30 min alle 18|stanco oggi|dormito male|annulla|peso 70|grasso 15|sonno 7h 30|malattia oggi|fine malattia|2 brioche|sensazione buona",
    ).split("|"),
  },
  {
    id: "plan",
    term: t("Plan", "Pianificare"),
    text: t(
      "Opens the Calendar on that day, ready to choose a workout. With a name and a length it puts your own activity on the calendar. A week with hours and load opens a proposal.",
      "Apre il Calendario su quel giorno, pronto per scegliere un allenamento. Con un nome e una durata mette in calendario un'attività tua. Una settimana con ore e carico apre una proposta.",
    ),
    points: t(
      "plan tomorrow|plan 12 november|plan saturday ride with Marco 3h|plan week 8h 400 load|remove saturday|move saturday to sunday|delete last activity",
      "pianifica domani|pianifica 12 novembre|pianifica sabato giro con Marco 3h|pianifica settimana 8h 400 carico|togli sabato|sposta sabato a domenica|elimina ultima attività",
    ).split("|"),
  },
  {
    id: "suggest",
    term: t("Suggestions", "Consigli"),
    text: t(
      "A few workouts that fit, from how the day reads, your block and your recent days. Choosing one shows it first; nothing is saved until you add it.",
      "Qualche allenamento adatto, da come si presenta la giornata, dal tuo blocco e dagli ultimi giorni. Sceglierne uno te lo mostra prima; nulla viene salvato finché non lo aggiungi.",
    ),
    points: t(
      "suggest|suggest tomorrow|suggest 1h|suggest threshold|suggest week",
      "consiglia|consiglia domani|consiglia 1h|consiglia soglia|consiglia settimana",
    ).split("|"),
  },
];
