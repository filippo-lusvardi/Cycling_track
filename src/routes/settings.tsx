import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { clear as clearIdb } from "idb-keyval";
import { useEffect, useState, useSyncExternalStore } from "react";
import { ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { Panel } from "@/components/StatCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useLocalStore } from "@/hooks/use-local-store";
import { syncSegments } from "@/hooks/use-segments";
import { githubUser } from "@/lib/gist";
import { format, lang, setLang, t } from "@/lib/i18n";
import { getAthlete } from "@/lib/intervals";
import QRCode from "qrcode";
import { historyYears, segmentEngine, startSegments } from "@/lib/segment-app";
import { canShareSetup, setupLink } from "@/lib/setup-link";
import {
  API_KEY,
  GIST_ID,
  GITHUB_TOKEN,
  QUIET_TREE,
  SEGMENT_HISTORY,
  readSetting,
  writeSetting,
} from "@/lib/settings";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/settings")({
  head: () => ({ meta: [{ title: t("Settings — Cirmolo", "Impostazioni — Cirmolo") }] }),
  component: SettingsPage,
});

function SettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <div className="eyebrow">{t("This device", "Questo dispositivo")}</div>
        <h1 className="text-3xl font-bold tracking-tight">{t("Settings", "Impostazioni")}</h1>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Language />
        <QuietTree />
        <TreeGuide />
        <IntervalsKey />
        <GithubSync />
        <SegmentAnalysis />
        <PhoneSetup />
        <Storage />
      </div>
    </div>
  );
}

function IntervalsKey() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [key, setKey] = useState(() => readSetting<string>(API_KEY) ?? "");
  const [busy, setBusy] = useState(false);
  const saved = !!readSetting<string>(API_KEY);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    writeSetting(API_KEY, key.trim());
    setBusy(true);
    try {
      const a = await getAthlete();
      toast.success(
        a.name
          ? t(`Connected to intervals.icu as ${a.name}`, `Connesso a intervals.icu come ${a.name}`)
          : t("Connected to intervals.icu", "Connesso a intervals.icu"),
      );
      await qc.invalidateQueries();
      navigate({ to: "/" });
    } catch {
      writeSetting(API_KEY, null);
      toast.error(t("intervals.icu rejected that key", "intervals.icu ha rifiutato la chiave"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel title="intervals.icu">
      <form onSubmit={onSubmit} className="space-y-3">
        <div className="space-y-1">
          <Label htmlFor="apikey">{t("API key", "Chiave API")}</Label>
          <Input
            id="apikey"
            type="password"
            autoComplete="off"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder={t("From intervals.icu → Settings → Developer", "Da intervals.icu → Settings → Developer")}
            required
          />
        </div>
        <div className="flex gap-2">
          <Button type="submit" disabled={busy || !key.trim()}>
            {busy ? t("Checking…", "Verifica…") : t("Save & connect", "Salva e connetti")}
          </Button>
          {saved && (
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                writeSetting(API_KEY, null);
                setKey("");
                qc.clear();
              }}
            >
              {t("Forget key", "Dimentica chiave")}
            </Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          {t(
            "Stored only in this browser. Each device (Zen on Ubuntu, the phone) needs it once.",
            "Salvata solo in questo browser. Ogni dispositivo (Zen su Ubuntu, il telefono) la richiede una volta.",
          )}
        </p>
      </form>
    </Panel>
  );
}

function GithubSync() {
  const [token, setToken] = useState(() => readSetting<string>(GITHUB_TOKEN) ?? "");
  const [user, setUser] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const saved = !!readSetting<string>(GITHUB_TOKEN);

  useEffect(() => {
    if (saved)
      githubUser().then(
        (u) => setUser(u.login),
        () => setUser(null),
      );
  }, [saved]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    writeSetting(GITHUB_TOKEN, token.trim());
    setBusy(true);
    try {
      const u = await githubUser();
      setUser(u.login);
      await syncSegments();
      toast.success(t("Segments synced with your private gist", "Segmenti sincronizzati con il tuo gist privato"));
    } catch {
      toast.error(
        t(
          "GitHub rejected that token, or it lacks the Gists permission",
          "GitHub ha rifiutato il token, oppure manca il permesso Gists",
        ),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel title={t("Segment sync (GitHub Gist)", "Sincronizzazione segmenti (GitHub Gist)")}>
      <form onSubmit={onSubmit} className="space-y-3">
        <p className="text-sm text-muted-foreground">
          {t(
            "Saved segments and stars sync between devices through a secret gist on your GitHub account (free). Create a",
            "Segmenti salvati e preferiti si sincronizzano tra dispositivi tramite un gist segreto sul tuo account GitHub (gratis). Crea un",
          )}{" "}
          <a
            className="text-primary underline"
            href="https://github.com/settings/personal-access-tokens/new"
            target="_blank"
            rel="noreferrer"
          >
            {t("fine-grained token", "token fine-grained")}
          </a>{" "}
          {t("with only", "con solo")}{" "}
          <span className="font-medium text-foreground">Gists: Read and write</span>.
        </p>
        <div className="space-y-1">
          <Label htmlFor="ghtoken">{t("GitHub token", "Token GitHub")}</Label>
          <Input
            id="ghtoken"
            type="password"
            autoComplete="off"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="github_pat_…"
            required
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" disabled={busy || !token.trim()}>
            {busy ? t("Syncing…", "Sincronizzazione…") : t("Save & sync", "Salva e sincronizza")}
          </Button>
          {saved && (
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                writeSetting(GITHUB_TOKEN, null);
                writeSetting(GIST_ID, null);
                setToken("");
                setUser(null);
              }}
            >
              {t("Disconnect", "Disconnetti")}
            </Button>
          )}
          {user && <span className="text-xs text-muted-foreground">{t("Connected as", "Connesso come")} {user}</span>}
        </div>
      </form>
    </Panel>
  );
}

function Language() {
  return (
    <Panel title={t("Language", "Lingua")}>
      <div className="flex gap-1 rounded-lg bg-secondary p-1 text-sm">
        {(
          [
            ["it", "Italiano"],
            ["en", "English"],
          ] as const
        ).map(([l, label]) => (
          <button
            key={l}
            onClick={() => setLang(l)}
            className={`flex-1 rounded-md px-3 py-1.5 text-xs ${lang === l ? "bg-background text-foreground" : "text-muted-foreground"}`}
          >
            {label}
          </button>
        ))}
      </div>
    </Panel>
  );
}

/** Each part of the Tree page: what it shows, plus a bullet per detail where there are several. */
const TREE_GUIDE: { term: string; text: string; points?: string[] }[] = [
  {
    term: t("Crown", "Chioma"),
    text: t(
      "Today's readiness (HRV, sleep, form and check-in) as a season. Tap it for today's advice and the check-in.",
      "La prontezza di oggi (HRV, sonno, forma e check-in) come stagione. Toccala per il consiglio del giorno e il check-in.",
    ),
    points: [
      t("Summer (≥ 75): ready for intensity", "Estate (≥ 75): pronto per l'intensità"),
      t("Spring (≥ 55): endurance day", "Primavera (≥ 55): giornata di fondo"),
      t("Autumn (≥ 40): go easy", "Autunno (≥ 40): vai piano"),
      t("Winter: rest", "Inverno: riposo"),
      t(
        "Held at spring when fatigue is 1.3× fitness or fitness rises 6 in a week, and at autumn from 1.5× or +8 (stricter for six weeks after injury, illness or two weeks off): volume counts, not only intensity",
        "Ferma alla primavera quando la fatica è 1,3× la forma fisica o la forma fisica sale di 6 in una settimana, e all'autunno da 1,5× o +8 (più severa nelle sei settimane dopo infortunio, malattia o due settimane di stop): conta il volume, non solo l'intensità",
      ),
    ],
  },
  {
    term: t("Sky", "Cielo"),
    text: t("Form (TSB):", "Forma (TSB):"),
    points: [
      t("Sun: fresh", "Sole: fresco"),
      t("Sun and clouds: neutral", "Sole e nuvole: neutro"),
      t("Clouds: training hard", "Nuvole: carico intenso"),
      t("Rain: overreached", "Pioggia: sovraccarico"),
    ],
  },
  {
    term: t("Wind in the crown", "Vento nella chioma"),
    text: t(
      "A trend over several days worth watching before it shows in readiness: HRV below your usual for a week, high fatigue, stress or low mood on most recent check-ins, or short nights. Tap the crown to see which.",
      "Una tendenza di più giorni da tenere d'occhio prima che si veda nella prontezza: HRV sotto il tuo solito da una settimana, fatica o stress alti o umore basso nella maggior parte degli ultimi check-in, oppure notti corte. Tocca la chioma per vedere quale.",
    ),
  },
  {
    term: t("Ceiling", "Tetto"),
    text: t(
      "On easy and endurance days, the power and heart rate to stay under: the top of Z1 or Z2 in your intervals.icu zones.",
      "Nei giorni facili e di fondo, la potenza e la frequenza cardiaca da non superare: il limite di Z1 o Z2 nelle tue zone di intervals.icu.",
    ),
  },
  {
    term: t("Training focus", "Focus di allenamento"),
    text: t(
      "What to train in this block (base, high aerobic, VO2max, anaerobic, sprint), shown above the crown. Readiness decides when to go hard; the focus decides what. It comes from:",
      "Cosa allenare in questo blocco (base, aerobico alto, VO2max, anaerobico, sprint), mostrato sopra la chioma. La prontezza decide quando spingere; il focus decide cosa. Nasce da:",
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
      t(
        "Your last 42 days of power against your best of the year: the biggest gap that the races need",
        "La tua potenza degli ultimi 42 giorni rispetto al tuo meglio dell'anno: la mancanza più grande che serve alle gare",
      ),
      t(
        "Base first when steady rides decouple, Z2 time drops or fitness is well below your usual",
        "Prima la base se le uscite regolari si disaccoppiano, il tempo in Z2 cala o la forma fisica è molto sotto il solito",
      ),
      t(
        "A block lasts at least two weeks; around races: taper 10 days before an A, easy 3 days before a B, recovery the day after",
        "Un blocco dura almeno due settimane; attorno alle gare: scarico 10 giorni prima di una A, facile 3 giorni prima di una B, recupero il giorno dopo",
      ),
    ],
  },
  {
    term: t("Buds above the crown", "Gemme sopra la chioma"),
    text: t("Workouts planned for today in intervals.icu.", "Allenamenti pianificati per oggi su intervals.icu."),
  },
  {
    term: t("Trunk", "Tronco"),
    text: t(
      "Fitness (CTL): the wider, the fitter compared with the rest of your history.",
      "Forma fisica (CTL): più è largo, più sei in forma rispetto al resto del tuo storico.",
    ),
  },
  {
    term: t("Branches", "Rami"),
    text: t("One per activity in the last 5 days:", "Uno per attività negli ultimi 5 giorni:"),
    points: [
      t("Length: duration", "Lunghezza: durata"),
      t("Thickness: load", "Spessore: carico"),
      t(
        "A coloured bud at the tip: not a ride (run, gym, walk, swim)",
        "Una gemma colorata in punta: non è un'uscita in bici (corsa, palestra, camminata, nuoto)",
      ),
    ],
  },
  {
    term: t("Leaves", "Foglie"),
    text: t(
      "One per 100 m climbed, coloured by intensity against FTP:",
      "Una ogni 100 m di dislivello, colorata per intensità rispetto all'FTP:",
    ),
    points: [
      t("Green: easy", "Verde: facile"),
      t("Blue: steady", "Blu: regolare"),
      t("Gold: tempo", "Oro: tempo"),
      t("Red: hard", "Rosso: dura"),
    ],
  },
  {
    term: t("Birds", "Uccellini"),
    text: t(
      "One per brioche eaten on that ride (set it at the bottom of the ride's page).",
      "Uno per ogni brioche mangiata in quell'uscita (impostala in fondo alla pagina dell'uscita).",
    ),
  },
  {
    term: t("Small green dots", "Puntini verdi"),
    text: t("Rest days on the bark.", "Giorni di riposo sulla corteccia."),
  },
  {
    term: t("Knots", "Nodi"),
    text: t(
      "A dark spiral for each day sick or injured, from Sick and Injured events in the intervals.icu calendar. Mark today in the crown's sheet, or a past run of rest days by tapping it.",
      "Una spirale scura per ogni giorno di malattia o infortunio, dagli eventi Malato e Infortunato del calendario di intervals.icu. Segna oggi dal pannello della chioma, o una serie passata di giorni di riposo toccandola.",
    ),
  },
  {
    term: t("Weeks", "Settimane"),
    text: t("Older history folds into one bough per week:", "Lo storico più vecchio si raccoglie in un ramo per settimana:"),
    points: [
      t(
        "Golden bark: building (load above the last 4 weeks)",
        "Corteccia dorata: costruzione (carico sopra le 4 settimane precedenti)",
      ),
      t("Blue bark: recovery week", "Corteccia blu: settimana di scarico"),
    ],
  },
  {
    term: t("Roots", "Radici"),
    text: t("Where your intervals.icu history begins.", "Dove inizia il tuo storico su intervals.icu."),
  },
  {
    term: t("Years", "Anni"),
    text: t("The trunk cut across:", "Il tronco in sezione:"),
    points: [
      t("One ring per year, the inner ones older", "Un anello per anno, i più interni sono i più vecchi"),
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

function QuietTree() {
  const [quiet, setQuiet] = useLocalStore(QUIET_TREE, false);
  return (
    <Panel title={t("Tree", "Albero")}>
      <div className="flex items-start justify-between gap-4">
        <Label htmlFor="quiet-tree" className="block space-y-1">
          <span className="block">{t("Quiet tree", "Albero silenzioso")}</span>
          <span className="block text-sm font-normal text-muted-foreground">
            {t(
              "Hide scores on the tree (readiness, fitness, form, load) until you tap. Read the picture first.",
              "Nasconde i numeri sull'albero (prontezza, forma fisica, forma, carico) finché non tocchi. Leggi prima l'immagine.",
            )}
          </span>
        </Label>
        <Switch id="quiet-tree" checked={quiet} onCheckedChange={(v) => setQuiet(() => v)} />
      </div>
    </Panel>
  );
}

function TreeGuide() {
  const [open, setOpen] = useState(false);
  return (
    <Panel
      title={t("How to read the tree", "Come leggere l'albero")}
      action={
        <Button size="sm" variant="ghost" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
          {open ? t("Hide", "Nascondi") : t("Show", "Mostra")}
          <ChevronDown className={cn("transition-transform", open && "rotate-180")} />
        </Button>
      }
    >
      <p className="text-sm text-muted-foreground">
        {t(
          "The Tree page grows from your training: the top is today, going down is going back in time. Tap any part to see its details.",
          "La pagina Albero cresce con i tuoi allenamenti: in alto c'è oggi, scendendo si torna indietro nel tempo. Tocca qualsiasi parte per vederne i dettagli.",
        )}
      </p>
      {open && (
        <dl className="mt-3 space-y-3 text-sm">
          {TREE_GUIDE.map((g) => (
            <div key={g.term}>
              <dt className="font-medium">{g.term}</dt>
              <dd className="text-muted-foreground">
                {g.text}
                {g.points && (
                  <ul className="mt-1 list-disc space-y-0.5 pl-5">
                    {g.points.map((p) => (
                      <li key={p}>{p}</li>
                    ))}
                  </ul>
                )}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </Panel>
  );
}

const HISTORY_OPTIONS = [
  [1, t("1 year", "1 anno")],
  [2, t("2 years", "2 anni")],
  [5, t("5 years", "5 anni")],
  [0, t("All", "Tutto")],
] as const;

function SegmentAnalysis() {
  const snap = useSyncExternalStore(segmentEngine.subscribe, segmentEngine.getSnapshot);
  const [years, setYears] = useState(historyYears);
  const [usage, setUsage] = useState<number | null>(null);
  const busy = snap.status.phase !== "idle" && snap.status.phase !== "error";
  useEffect(() => void startSegments(false), []);
  useEffect(() => {
    navigator.storage?.estimate?.().then(
      (e) => setUsage(e.usage ?? null),
      () => setUsage(null),
    );
  }, [snap.rides]);

  return (
    <Panel title={t("Segment analysis", "Analisi segmenti")}>
      <div className="space-y-3 text-sm">
        <p className="text-muted-foreground">
          {t(
            "Each outdoor ride is downloaded once and analysed on this device; after that only new rides are. More history finds more recurring climbs but takes longer the first time (and uses mobile data on the phone).",
            "Ogni pedalata viene scaricata una volta e analizzata su questo dispositivo; poi solo le nuove. Più storico trova più salite ricorrenti ma la prima volta richiede più tempo (e usa dati mobili sul telefono).",
          )}
        </p>
        <div className="space-y-1">
          <Label>{t("History to analyse", "Storico da analizzare")}</Label>
          <div className="flex gap-1 rounded-lg bg-secondary p-1">
            {HISTORY_OPTIONS.map(([y, label]) => (
              <button
                key={y}
                onClick={() => {
                  setYears(y);
                  writeSetting(SEGMENT_HISTORY, y);
                }}
                className={`flex-1 rounded-md px-3 py-1.5 text-xs ${years === y ? "bg-background text-foreground" : "text-muted-foreground"}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <p className="stat-num text-xs text-muted-foreground">
          {t(
            `${snap.rides} rides analysed · ${snap.groups.length} climbs found`,
            `${snap.rides} attività analizzate · ${snap.groups.length} salite trovate`,
          )}
          {usage != null &&
            t(` · ${(usage / 1e6).toFixed(0)} MB stored by Cirmolo`, ` · ${(usage / 1e6).toFixed(0)} MB salvati da Cirmolo`)}
          {snap.lastSync &&
            t(" · last sync ", " · ultima sincronizzazione ") + format(snap.lastSync, "d MMM yyyy HH:mm")}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button disabled={busy} onClick={() => void segmentEngine.sync()}>
            {busy ? t("Working…", "In corso…") : t("Sync now", "Sincronizza ora")}
          </Button>
          <Button variant="outline" disabled={busy} onClick={() => void segmentEngine.rebuild()}>
            {t("Re-analyse", "Rianalizza")}
          </Button>
          <Button
            variant="outline"
            disabled={busy}
            onClick={async () => {
              await segmentEngine.clear();
              toast.success(
                t(
                  "Downloaded rides deleted; they'll be fetched again on the next sync",
                  "Attività scaricate eliminate; verranno riscaricate alla prossima sincronizzazione",
                ),
              );
            }}
          >
            {t("Delete downloaded rides", "Elimina attività scaricate")}
          </Button>
        </div>
      </div>
    </Panel>
  );
}

const QR_SECONDS = 60;

/** QR with a setup link (keys in the #fragment) so the phone needs no typing. Shown only on request. */
function PhoneSetup() {
  const [svg, setSvg] = useState<string | null>(null);
  const [left, setLeft] = useState(0);
  const key = readSetting<string>(API_KEY);
  const token = readSetting<string>(GITHUB_TOKEN);
  const shareable = canShareSetup(window.location);

  useEffect(() => {
    if (!svg) return;
    if (left <= 0) {
      setSvg(null);
      return;
    }
    const id = setTimeout(() => setLeft((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [svg, left]);

  async function show() {
    if (!key) return;
    const link = setupLink(window.location.origin, {
      apiKey: key,
      ...(token ? { githubToken: token } : {}),
      history: historyYears(),
    });
    setSvg(
      await QRCode.toString(link, {
        type: "svg",
        margin: 1,
        errorCorrectionLevel: "M",
        color: { dark: "#0b1220", light: "#ffffff" },
      }),
    );
    setLeft(QR_SECONDS);
  }

  return (
    <Panel title={t("Copy setup to phone", "Copia configurazione sul telefono")}>
      <div className="space-y-3 text-sm">
        <p className="text-muted-foreground">
          {token
            ? t(
                "Scan with the phone's camera to open Cirmolo there with your intervals.icu key, GitHub token and history setting already filled in.",
                "Inquadra con la fotocamera del telefono per aprire Cirmolo con chiave intervals.icu, token GitHub e storico già compilati.",
              )
            : t(
                "Scan with the phone's camera to open Cirmolo there with your intervals.icu key and history setting already filled in.",
                "Inquadra con la fotocamera del telefono per aprire Cirmolo con chiave intervals.icu e storico già compilati.",
              )}
        </p>
        {!shareable ? (
          <p className="rounded-lg bg-secondary/60 p-3 text-xs text-muted-foreground">
            {t(
              `The phone can't open this page's address (${window.location.host}). Open Cirmolo from its hosted https address, then come back here.`,
              `Il telefono non può aprire l'indirizzo di questa pagina (${window.location.host}). Apri Cirmolo dal suo indirizzo https pubblicato, poi torna qui.`,
            )}
          </p>
        ) : !key ? (
          <p className="text-xs text-muted-foreground">{t("Connect intervals.icu above first.", "Prima collega intervals.icu qui sopra.")}</p>
        ) : svg ? (
          <div className="space-y-2">
            <div
              className="mx-auto w-56 rounded-lg bg-white p-2 [&_svg]:h-auto [&_svg]:w-full"
              aria-label={t("Setup QR code", "QR di configurazione")}
              // Generated locally by the qrcode library from our own link.
              dangerouslySetInnerHTML={{ __html: svg }}
            />
            <p className="text-center text-xs text-muted-foreground">
              {t("Contains: intervals.icu key", "Contiene: chiave intervals.icu")}
              {token ? t(" · GitHub token", " · token GitHub") : ""}
              {t(` · history setting. Hides in ${left} s.`, ` · storico. Si nasconde tra ${left} s.`)}
            </p>
            <Button variant="outline" className="w-full" onClick={() => setSvg(null)}>
              {t("Hide", "Nascondi")}
            </Button>
          </div>
        ) : (
          <>
            <p className="text-xs text-muted-foreground">
              {t(
                "Anyone who photographs the code gets your keys: show it only to your own phone.",
                "Chi fotografa il codice ottiene le tue chiavi: mostralo solo al tuo telefono.",
              )}
            </p>
            <Button onClick={show}>{t("Show QR", "Mostra QR")}</Button>
          </>
        )}
      </div>
    </Panel>
  );
}

function Storage() {
  const qc = useQueryClient();
  const [persisted, setPersisted] = useState<boolean | null>(null);
  useEffect(() => {
    navigator.storage?.persisted?.().then(setPersisted, () => setPersisted(null));
  }, []);

  return (
    <Panel title={t("Offline storage", "Archivio offline")}>
      <div className="space-y-3 text-sm">
        <p className="text-muted-foreground">
          {t(
            "The latest data and every ride's streams are kept on this device so the app opens offline.",
            "Gli ultimi dati e i flussi di ogni attività restano su questo dispositivo, così l'app si apre offline.",
          )}
        </p>
        <p>
          {t("Protected from browser clean-up:", "Protetto dalla pulizia del browser:")}{" "}
          <span className="stat-num">
            {persisted == null ? t("unknown", "sconosciuto") : persisted ? t("yes", "sì") : t("no", "no")}
          </span>
        </p>
        <Button
          variant="outline"
          onClick={async () => {
            await clearIdb();
            qc.clear();
            toast.success(t("Cached data cleared", "Dati in cache cancellati"));
          }}
        >
          {t("Clear cached data", "Cancella dati in cache")}
        </Button>
        <p className="stat-num text-xs text-muted-foreground">Cirmolo v{__APP_VERSION__}</p>
      </div>
    </Panel>
  );
}
