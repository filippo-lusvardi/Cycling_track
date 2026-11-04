import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { clear as clearIdb } from "idb-keyval";
import { useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { Panel } from "@/components/StatCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useLocalStore } from "@/hooks/use-local-store";
import {
  EmailAuthProvider,
  deleteUser,
  reauthenticateWithCredential,
  updatePassword,
} from "firebase/auth";
import { CropPicker } from "@/components/garden/CropPicker";
import { signOutAndWipe } from "@/lib/account";
import { applyAccent } from "@/lib/accent";
import { authError } from "@/lib/auth-errors";
import { deleteUserData, saveProfile } from "@/lib/cloud";
import { auth } from "@/lib/firebase";
import { format, lang, setLang, t } from "@/lib/i18n";
import { getAthlete } from "@/lib/source";
import { activitiesQuery, wellnessQuery } from "@/lib/queries";
import { ACCURACY_MIN_RIDES, HRV_BAND_DAYS, readinessAccuracy } from "@/lib/readiness";
import { addDays, isoDate } from "@/lib/training";
import { historyYears, segmentEngine, startSegments } from "@/lib/segment-app";
import {
  API_KEY,
  NO_PERF,
  QUIET_TREE,
  SEASON_ACCENT,
  SEGMENT_HISTORY,
  SOURCE,
  readSetting,
  writeSetting,
} from "@/lib/settings";
import type { SourceKind } from "@/lib/source";
import { rideZonesQuery } from "@/lib/queries";
import { UploadRides } from "@/components/UploadRides";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/settings")({
  head: () => ({ meta: [{ title: t("Settings — Cirmolo", "Impostazioni — Cirmolo") }] }),
  component: SettingsPage,
});

function SettingsPage() {
  const [source] = useLocalStore<SourceKind | null>(SOURCE, null);
  return (
    <div className="space-y-6">
      <div>
        <div className="eyebrow">{t("This device", "Questo dispositivo")}</div>
        <h1 className="on-sky text-3xl font-bold tracking-tight">
          {t("Settings", "Impostazioni")}
        </h1>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Language />
        <QuietTree />
        <TreeGuide />
        <GardenGuide />
        <CropPicker />
        <Account />
        {source === "native" && <Athlete />}
        {source === "native" && <RideFiles />}
        <IntervalsKey />
        {source !== "native" && <WithoutIntervals />}
        <SegmentAnalysis />
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
    const before = readSetting<SourceKind>(SOURCE);
    writeSetting(API_KEY, key.trim());
    writeSetting(SOURCE, "intervals");
    setBusy(true);
    try {
      const a = await getAthlete();
      await saveProfile({ intervalsKey: key.trim(), source: "intervals" });
      toast.success(
        a.name
          ? t(`Connected to intervals.icu as ${a.name}`, `Connesso a intervals.icu come ${a.name}`)
          : t("Connected to intervals.icu", "Connesso a intervals.icu"),
      );
      await qc.invalidateQueries();
      navigate({ to: "/" });
    } catch {
      writeSetting(API_KEY, null);
      writeSetting(SOURCE, before);
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
            placeholder={t(
              "From intervals.icu → Settings → Developer",
              "Da intervals.icu → Settings → Developer",
            )}
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
                void saveProfile({ intervalsKey: null });
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
            "Kept in your account (readable only by you), so every device you sign in on uses it.",
            "Conservata nel tuo account (leggibile solo da te), così ogni dispositivo su cui accedi la usa.",
          )}
        </p>
      </form>
    </Panel>
  );
}

/** For people without intervals.icu: Cirmolo keeps their rides and computes the numbers itself. */
function WithoutIntervals() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [consent, setConsent] = useState(false);
  return (
    <Panel title={t("No intervals.icu account?", "Non hai un account intervals.icu?")}>
      <div className="space-y-3 text-sm">
        <p className="text-muted-foreground">
          {t(
            "Cirmolo can keep your rides itself: upload ride files (.fit) from your Garmin, Wahoo or Zwift, and it works out fitness, fatigue, zones and power curves on its own. Check-ins, weight, races and sick days are saved in your account.",
            "Cirmolo può conservare da sé le tue uscite: carica i file (.fit) di Garmin, Wahoo o Zwift e calcola da solo forma, fatica, zone e curve di potenza. Check-in, peso, gare e giorni di malattia restano nel tuo account.",
          )}
        </p>
        <label className="flex items-start gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
          />
          <span>
            {t(
              "I agree that Cirmolo stores my rides and health data (heart rate, HRV, sleep, weight) in my account to analyse my training, as described in the",
              "Acconsento che Cirmolo conservi nel mio account le mie uscite e i dati sulla salute (frequenza cardiaca, HRV, sonno, peso) per analizzare il mio allenamento, come descritto nell'",
            )}{" "}
            <Link to="/privacy" className="underline">
              {t("privacy notice", "informativa privacy")}
            </Link>
            .
          </span>
        </label>
        <Button
          variant="outline"
          disabled={!consent}
          onClick={async () => {
            writeSetting(SOURCE, "native");
            await saveProfile({ source: "native", healthConsentAt: Date.now() }).catch(() => {});
            qc.clear();
            navigate({ to: "/settings" });
          }}
        >
          {t("Use Cirmolo without intervals.icu", "Usa Cirmolo senza intervals.icu")}
        </Button>
      </div>
    </Panel>
  );
}

const numOrNull = (v: string) => (v.trim() && Number(v) > 0 ? Number(v) : null);

/** What intervals.icu's athlete settings hold, for accounts without it: weight, FTP, threshold and max heart rate. */
function Athlete() {
  const qc = useQueryClient();
  const { data: zones } = useQuery(rideZonesQuery());
  const [form, setForm] = useState({ weight: "", ftp: "", lthr: "", maxHr: "" });
  const [loaded, setLoaded] = useState(false);
  const [progress, setProgress] = useState<[number, number] | null>(null);
  useEffect(() => {
    void import("@/lib/cloud").then(({ readProfile }) =>
      readProfile().then((p) => {
        setForm({
          weight: p.weight ? String(p.weight) : "",
          ftp: p.ftp ? String(p.ftp) : "",
          lthr: p.lthr ? String(p.lthr) : "",
          maxHr: p.maxHr ? String(p.maxHr) : "",
        });
        setLoaded(true);
      }),
    );
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    await saveProfile({
      weight: numOrNull(form.weight),
      ftp: numOrNull(form.ftp),
      lthr: numOrNull(form.lthr),
      maxHr: numOrNull(form.maxHr),
    });
    await qc.invalidateQueries();
    toast.success(t("Saved", "Salvato"));
  }

  async function recompute() {
    const { recomputeRides } = await import("@/lib/native");
    setProgress([0, 0]);
    await recomputeRides((done, total) => setProgress([done, total]));
    setProgress(null);
    await qc.invalidateQueries();
    toast.success(t("Rides recalculated", "Uscite ricalcolate"));
  }

  const field = (k: keyof typeof form, label: string, unit: string, hint?: string) => (
    <div className="space-y-1">
      <Label htmlFor={`athlete-${k}`}>
        {label} <span className="text-muted-foreground">({unit})</span>
      </Label>
      <Input
        id={`athlete-${k}`}
        inputMode="decimal"
        value={form[k]}
        placeholder={hint}
        onChange={(e) => setForm({ ...form, [k]: e.target.value })}
      />
    </div>
  );

  return (
    <Panel title={t("Athlete", "Atleta")}>
      <form onSubmit={save} className="space-y-3 text-sm">
        <div className="grid grid-cols-2 gap-3">
          {field("weight", t("Weight", "Peso"), "kg")}
          {field(
            "ftp",
            "FTP",
            "W",
            !form.ftp && zones?.ftp
              ? t(`estimated ${zones.ftp}`, `stimata ${zones.ftp}`)
              : undefined,
          )}
          {field("lthr", t("Threshold HR", "FC di soglia"), "bpm")}
          {field("maxHr", t("Max HR", "FC massima"), "bpm")}
        </div>
        <p className="text-xs text-muted-foreground">
          {t(
            "FTP sets power zones and training load; leave it empty to use the estimate from your last 42 days. Threshold heart rate (or 90% of max) is used for rides without a power meter.",
            "L'FTP definisce zone di potenza e carico; lascialo vuoto per usare la stima dagli ultimi 42 giorni. La FC di soglia (o il 90% della massima) serve per le uscite senza misuratore di potenza.",
          )}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={!loaded}>
            {t("Save", "Salva")}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={!!progress}
            onClick={() => void recompute()}
          >
            {progress
              ? t(
                  `Recalculating ${progress[0]}/${progress[1]}…`,
                  `Ricalcolo ${progress[0]}/${progress[1]}…`,
                )
              : t("Recalculate all rides", "Ricalcola tutte le uscite")}
          </Button>
        </div>
      </form>
    </Panel>
  );
}

function RideFiles() {
  return (
    <Panel title={t("Ride files", "File delle uscite")}>
      <UploadRides />
    </Panel>
  );
}

function Account() {
  const user = auth.currentUser;
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [busy, setBusy] = useState<"password" | "delete" | "signout" | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  /** Firebase asks for the password again before changing it or deleting the account. */
  async function reauth() {
    await reauthenticateWithCredential(user!, EmailAuthProvider.credential(user!.email!, current));
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    setBusy("password");
    try {
      await reauth();
      await updatePassword(user!, next);
      setCurrent("");
      setNext("");
      toast.success(t("Password changed", "Password cambiata"));
    } catch (err) {
      toast.error(authError(err));
    } finally {
      setBusy(null);
    }
  }

  async function deleteAccount() {
    setBusy("delete");
    try {
      await reauth();
      // My trees and times leave every forest first (afterwards I couldn't reach them).
      const { leaveAllForests } = await import("@/lib/forest/forests");
      await leaveAllForests();
      await deleteUserData();
      await deleteUser(user!);
      await signOutAndWipe();
    } catch (err) {
      toast.error(authError(err));
      setBusy(null);
    }
  }

  if (!user) return null;
  return (
    <Panel title={t("Account", "Account")}>
      <div className="space-y-4 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span>
            {t("Signed in as", "Accesso come")} <span className="font-medium">{user.email}</span>
          </span>
          <Button
            variant="outline"
            disabled={busy != null}
            onClick={() => {
              setBusy("signout");
              void signOutAndWipe();
            }}
          >
            {t("Sign out", "Esci")}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          {t(
            "Signing out removes your data from this device. It stays in your account and on intervals.icu.",
            "Uscendo i tuoi dati vengono rimossi da questo dispositivo. Restano nel tuo account e su intervals.icu.",
          )}{" "}
          <Link to="/privacy" className="underline hover:text-foreground">
            {t("Privacy notice", "Informativa privacy")}
          </Link>
        </p>
        <SpeedMeasurements />
        <form onSubmit={changePassword} className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="current-password">{t("Current password", "Password attuale")}</Label>
            <Input
              id="current-password"
              type="password"
              autoComplete="current-password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="new-password">{t("New password", "Nuova password")}</Label>
            <Input
              id="new-password"
              type="password"
              autoComplete="new-password"
              minLength={8}
              value={next}
              onChange={(e) => setNext(e.target.value)}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={busy != null || !current || next.length < 8}>
              {busy === "password"
                ? t("Saving…", "Salvataggio…")
                : t("Change password", "Cambia password")}
            </Button>
            {confirmDelete ? (
              <>
                <Button
                  type="button"
                  variant="destructive"
                  disabled={busy != null || !current}
                  onClick={() => void deleteAccount()}
                >
                  {busy === "delete"
                    ? t("Deleting…", "Eliminazione…")
                    : t("Delete for good", "Elimina definitivamente")}
                </Button>
                <Button type="button" variant="ghost" onClick={() => setConfirmDelete(false)}>
                  {t("Cancel", "Annulla")}
                </Button>
              </>
            ) : (
              <Button type="button" variant="ghost" onClick={() => setConfirmDelete(true)}>
                {t("Delete account", "Elimina account")}
              </Button>
            )}
          </div>
          {confirmDelete && (
            <p className="text-xs text-muted-foreground">
              {t(
                "Deletes your account and saved segments. Enter your current password above to confirm. Your intervals.icu data isn't touched.",
                "Elimina l'account e i segmenti salvati. Inserisci la password attuale qui sopra per confermare. I dati su intervals.icu non vengono toccati.",
              )}
            </p>
          )}
        </form>
      </div>
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
const TREE_GUIDE: GuideItem[] = [
  {
    term: t("Crown", "Chioma"),
    text: t(
      "Today's readiness (HRV, sleep, form and check-in) as a season, each measured against your own normal: HRV against its 60-day range, sleep against your usual, answers against how you usually answer. Tap it for today's advice and the check-in.",
      "La prontezza di oggi (HRV, sonno, forma e check-in) come stagione, ognuno misurato rispetto al tuo normale: HRV sul suo intervallo di 60 giorni, sonno sul tuo solito, risposte su come rispondi di solito. Toccala per il consiglio del giorno e il check-in.",
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
    text: t(
      "Form (TSB) as a share of fitness, like intervals.icu: −20 means more at fitness 40 than at 100.",
      "Forma (TSB) in percentuale della forma fisica, come intervals.icu: −20 pesa di più a forma fisica 40 che a 100.",
    ),
    points: [
      t("Sun (over +5%): fresh", "Sole (oltre +5%): fresco"),
      t("Sun and clouds (−10% to +5%): neutral", "Sole e nuvole (da −10% a +5%): neutro"),
      t("Clouds (−30% to −10%): training hard", "Nuvole (da −30% a −10%): carico intenso"),
      t("Rain (under −30%): overreached", "Pioggia (sotto −30%): sovraccarico"),
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
        "Base first when steady rides decouple, Z2 time drops, fitness is well below your usual, or your 20 min power fades over 15% after 30 kJ/kg (Analysis → Durability)",
        "Prima la base se le uscite regolari si disaccoppiano, il tempo in Z2 cala, la forma fisica è molto sotto il solito o la potenza sui 20 min cala oltre il 15% dopo 30 kJ/kg (Analisi → Resistenza alla fatica)",
      ),
      t(
        "A block lasts at least two weeks; around races: taper 10 days before an A, easy 3 days before a B, recovery the day after",
        "Un blocco dura almeno due settimane; attorno alle gare: scarico 10 giorni prima di una A, facile 3 giorni prima di una B, recupero il giorno dopo",
      ),
    ],
  },
  {
    term: t("Buds above the crown", "Gemme sopra la chioma"),
    text: t(
      "Workouts planned for today in intervals.icu.",
      "Allenamenti pianificati per oggi su intervals.icu.",
    ),
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
    text: t(
      "One per ride in the last 5 days (only cycling grows branches):",
      "Uno per uscita in bici negli ultimi 5 giorni (solo la bici fa crescere i rami):",
    ),
    points: [t("Length: duration", "Lunghezza: durata"), t("Thickness: load", "Spessore: carico")],
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
      "One per brioche eaten on that ride (set it at the bottom of the ride's page). Each is a sparrow, robin, snow bunting, blackbird, blue tit, goldfinch or kingfisher, at random.",
      "Uno per ogni brioche mangiata in quell'uscita (impostala in fondo alla pagina dell'uscita). Ognuno è un passero, un pettirosso, uno zigolo delle nevi, un merlo, una cinciarella, un cardellino o un martin pescatore, a caso.",
    ),
  },
  {
    term: t("Squirrel", "Scoiattolo"),
    text: t(
      "Lives on the branch of your longest ride ever.",
      "Vive sul ramo della tua uscita più lunga di sempre.",
    ),
  },
  {
    term: t("Owl", "Gufo"),
    text: t(
      "Keeps watch on the branch of the ride with the most climbing ever.",
      "Fa la guardia sul ramo dell'uscita con più dislivello di sempre.",
    ),
  },
  {
    term: t("Small green dots", "Puntini verdi"),
    text: t("Rest days on the bark.", "Giorni di riposo sulla corteccia."),
  },
  {
    term: t("Sprouts", "Germogli"),
    text: t(
      "A day trained off the bike (run, gym, swim, hike…), in the sport's colour: that training grows in the garden. It still counts for the trunk and the crown.",
      "Un giorno di allenamento senza bici (corsa, palestra, nuoto, escursione…), nel colore dello sport: quell'allenamento cresce nell'orto. Conta comunque per il tronco e la chioma.",
    ),
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
    text: t(
      "Older history folds into one bough per week:",
      "Lo storico più vecchio si raccoglie in un ramo per settimana:",
    ),
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
    text: t(
      "Where your intervals.icu history begins.",
      "Dove inizia il tuo storico su intervals.icu.",
    ),
  },
  {
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

/** Opt-out of Firebase Performance Monitoring on this device (see lib/perf). */
function SpeedMeasurements() {
  const [noPerf, setNoPerf] = useLocalStore(NO_PERF, false);
  return (
    <div className="flex items-start justify-between gap-4">
      <Label htmlFor="speed-measurements" className="block space-y-1">
        <span className="block">
          {t("Share anonymous speed measurements", "Condividi misure anonime di velocità")}
        </span>
        <span className="block text-sm font-normal text-muted-foreground">
          {t(
            "How long the app takes to start and open screens on this device, to keep it fast. No training data.",
            "Quanto tempo impiega l'app ad avviarsi e ad aprire le schermate su questo dispositivo, per mantenerla veloce. Nessun dato di allenamento.",
          )}
        </span>
      </Label>
      <Switch
        id="speed-measurements"
        checked={!noPerf}
        onCheckedChange={(v) => setNoPerf(() => !v)}
      />
    </div>
  );
}

function QuietTree() {
  const [quiet, setQuiet] = useLocalStore(QUIET_TREE, false);
  const [seasonal, setSeasonal] = useLocalStore(SEASON_ACCENT, true);
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
      <div className="mt-4 flex items-start justify-between gap-4">
        <Label htmlFor="season-accent" className="block space-y-1">
          <span className="block">
            {t("Colours of today's tree", "Colori dell'albero di oggi")}
          </span>
          <span className="block text-sm font-normal text-muted-foreground">
            {t(
              "Cards, bars, buttons and links take their colour from today's tree: green in spring and summer, amber in autumn, icy blue in winter, greyer the worse the weather. Off: the classic blue.",
              "Schede, barre, pulsanti e link prendono il colore dall'albero di oggi: verde in primavera ed estate, ambra in autunno, azzurro ghiaccio in inverno, più grigio quanto peggiore è il tempo. Spento: il blu classico.",
            )}
          </span>
        </Label>
        <Switch
          id="season-accent"
          checked={seasonal}
          onCheckedChange={(v) => {
            // Saved first, so the colours follow at once.
            writeSetting(SEASON_ACCENT, v);
            applyAccent();
            setSeasonal(() => v);
          }}
        />
      </div>
    </Panel>
  );
}

type GuideItem = { term: string; text: string; points?: string[] };

/** A "how to read" panel: a line of intro, and the legend behind a Show button. */
function Guide({
  title,
  intro,
  items,
  children,
}: {
  title: string;
  intro: string;
  items: GuideItem[];
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Panel
      title={title}
      action={
        <Button size="sm" variant="ghost" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
          {open ? t("Hide", "Nascondi") : t("Show", "Mostra")}
          <ChevronDown className={cn("transition-transform", open && "rotate-180")} />
        </Button>
      }
    >
      <p className="text-sm text-muted-foreground">{intro}</p>
      {open && (
        <dl className="mt-3 space-y-3 text-sm">
          {items.map((g) => (
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
      {open && children}
    </Panel>
  );
}

function TreeGuide() {
  return (
    <Guide
      title={t("How to read the tree", "Come leggere l'albero")}
      intro={t(
        "The Tree page grows from your rides: the top is today, going down is going back in time. Tap any part to see its details.",
        "La pagina Albero cresce con le tue uscite in bici: in alto c'è oggi, scendendo si torna indietro nel tempo. Tocca qualsiasi parte per vederne i dettagli.",
      )}
      items={TREE_GUIDE}
    >
      <ReadinessCheck />
    </Guide>
  );
}

function GardenGuide() {
  return (
    <Guide
      title={t("How to read the garden", "Come leggere l'orto")}
      intro={t(
        "Everything you train off the bike grows in the garden for 8 weeks, then goes into the pantry. Tap a plant for its activity, a sign for its bed, a jar for its month.",
        "Tutto ciò che alleni senza bici cresce nell'orto per 8 settimane, poi finisce in dispensa. Tocca una pianta per la sua attività, un cartello per la sua aiuola, un barattolo per il suo mese.",
      )}
      items={GARDEN_GUIDE}
    />
  );
}

const GARDEN_GUIDE: GuideItem[] = [
  {
    term: t("Plants", "Piante"),
    text: t(
      "One per session, in its sport's bed, older to the left. Taller for a longer session, lusher for a harder one. What grows for each sport is yours to choose (below); by default:",
      "Una per sessione, nell'aiuola del suo sport, le più vecchie a sinistra. Più alta per una sessione più lunga, più rigogliosa per una più dura. Cosa cresce per ogni sport lo scegli tu (qui sotto); di base:",
    ),
    points: [
      t("Tomatoes: running, one per 5 km", "Pomodori: corsa, uno ogni 5 km"),
      t("Pumpkins: strength, as big as the session", "Zucche: forza, grandi quanto la sessione"),
      t(
        "Flowers: yoga, pilates and stretching, one per 10 minutes",
        "Fiori: yoga, pilates e stretching, uno ogni 10 minuti",
      ),
      t(
        "Herbs: walks and hikes, a flower per 100 m climbed",
        "Erbe: camminate ed escursioni, un fiore ogni 100 m di dislivello",
      ),
      t("Water lilies: swimming, a flower per 500 m", "Ninfee: nuoto, un fiore ogni 500 m"),
      t("Winter kale: skiing", "Cavolo nero: sci"),
      t("Reeds: rowing and paddling", "Canne: canottaggio e pagaia"),
      t("Beans: climbing", "Fagioli: arrampicata"),
      t("Sunflowers: any other sport", "Girasoli: qualsiasi altro sport"),
    ],
  },
  {
    term: t("Ripening", "Maturazione"),
    text: t(
      "Fruit is green the day you train and ripens over the week after, as the training is absorbed.",
      "La frutta è verde il giorno dell'allenamento e matura nella settimana dopo, mentre l'allenamento viene assorbito.",
    ),
  },
  {
    term: t("Soil", "Terra"),
    text: t(
      "Dark and moist when you've trained off the bike regularly in the last 4 weeks, pale and resting when not.",
      "Scura e umida se nelle ultime 4 settimane ti sei allenato regolarmente senza bici, chiara e a riposo se no.",
    ),
  },
  {
    term: t("Animals", "Animali"),
    text: t(
      "A hedgehog under your longest run ever, a frog on your longest swim, a snail beside your longest walk or hike.",
      "Un riccio sotto la tua corsa più lunga di sempre, una rana sulla tua nuotata più lunga, una lumaca accanto alla tua camminata o escursione più lunga.",
    ),
  },
  {
    term: t("Sky", "Cielo"),
    text: t(
      "The real time of day, with the moon at night; the weather is your form, as on the tree. The season is today's readiness.",
      "L'ora vera del giorno, con la luna di notte; il tempo è la tua forma, come sull'albero. La stagione è la prontezza di oggi.",
    ),
  },
  {
    term: t("Pantry", "Dispensa"),
    text: t(
      "A jar per month, as full as its hours off the bike, in layers coloured by sport.",
      "Un barattolo per mese, pieno quanto le sue ore senza bici, a strati colorati per sport.",
    ),
  },
];

/** Days of rides the accuracy check looks back over. */
const CHECK_DAYS = 90;

/** Has readiness matched how your rides felt? The score's accuracy measured on your own history, not assumed. */
function ReadinessCheck() {
  // Readiness for 90 days back needs the 60 days of HRV before them.
  const { data: wellness } = useQuery(wellnessQuery(CHECK_DAYS + HRV_BAND_DAYS));
  const { data: acts } = useQuery(activitiesQuery(CHECK_DAYS));
  const acc = useMemo(
    () =>
      wellness && acts
        ? readinessAccuracy(wellness, acts, addDays(isoDate(new Date()), -CHECK_DAYS))
        : null,
    [wellness, acts],
  );
  if (!acc) return null;
  const verdict =
    acc.r == null
      ? null
      : acc.r >= 0.4
        ? t("strong: trust it", "forte: fidati")
        : acc.r >= 0.2
          ? t("moderate: a useful guide", "moderata: una guida utile")
          : acc.r >= 0
            ? t("weak: listen to your legs too", "debole: ascolta anche le gambe")
            : t(
                "not matching: check HRV and sleep data",
                "non corrisponde: controlla i dati di HRV e sonno",
              );
  return (
    <div className="mt-4 rounded-lg bg-secondary/60 p-3 text-sm">
      <div className="font-medium">
        {t("Is readiness right for you?", "La prontezza funziona per te?")}
      </div>
      <p className="mt-1 text-muted-foreground">
        {acc.r == null
          ? t(
              `Rate how your rides felt on intervals.icu: after ${ACCURACY_MIN_RIDES} rated rides (${acc.rides} so far) this compares them with that morning's readiness.`,
              `Valuta come sono andate le uscite su intervals.icu: dopo ${ACCURACY_MIN_RIDES} uscite valutate (finora ${acc.rides}) qui si confrontano con la prontezza di quella mattina.`,
            )
          : t(
              `Over ${acc.rides} rated rides in the last ${CHECK_DAYS} days, readiness and how the ride felt match with a correlation of ${acc.r.toFixed(2)}: ${verdict}.`,
              `Su ${acc.rides} uscite valutate negli ultimi ${CHECK_DAYS} giorni, prontezza e sensazioni dell'uscita corrispondono con una correlazione di ${acc.r.toFixed(2)}: ${verdict}.`,
            )}
      </p>
    </div>
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
                  void saveProfile({ segmentHistory: y });
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
            t(
              ` · ${(usage / 1e6).toFixed(0)} MB stored by Cirmolo`,
              ` · ${(usage / 1e6).toFixed(0)} MB salvati da Cirmolo`,
            )}
          {snap.lastSync &&
            t(" · last sync ", " · ultima sincronizzazione ") +
              format(snap.lastSync, "d MMM yyyy HH:mm")}
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
            {persisted == null
              ? t("unknown", "sconosciuto")
              : persisted
                ? t("yes", "sì")
                : t("no", "no")}
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
