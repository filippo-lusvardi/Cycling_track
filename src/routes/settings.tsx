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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useLocalStore } from "@/hooks/use-local-store";
import {
  EmailAuthProvider,
  deleteUser,
  reauthenticateWithCredential,
  updatePassword,
} from "firebase/auth";
import { CropPicker } from "@/components/garden/CropPicker";
import {
  changedRow,
  IntervalsThresholds,
  ThresholdConfirm,
  ZoneLimits,
  type PendingWrite,
} from "@/components/Thresholds";
import { signOutAndWipe } from "@/lib/account";
import { applyAccent } from "@/lib/accent";
import { authError } from "@/lib/auth-errors";
import { deleteUserData, saveProfile } from "@/lib/cloud";
import { auth } from "@/lib/firebase";
import { format, lang, setLang, t } from "@/lib/i18n";
import { getAthlete, hasSource, saveThresholds, sourceKind } from "@/lib/source";
import { activitiesQuery, wellnessQuery } from "@/lib/queries";
import {
  ACCURACY_MIN_RIDES,
  HRV_BAND_DAYS,
  readinessAccuracy,
  readinessRows,
} from "@/lib/readiness";
import { addDays, isoDate } from "@/lib/training";
import { historyYears, segmentEngine, startSegments } from "@/lib/segment-app";
import {
  API_KEY,
  NO_PERF,
  QUIET_TREE,
  CHECK_IN,
  GARDEN,
  ANALYSIS_BOTH,
  SEASON_ACCENT,
  MAIN_SPORT,
  RUN_THRESHOLD,
  SEGMENT_HISTORY,
  SOURCE,
  readSetting,
  writeSetting,
} from "@/lib/settings";
import type { SourceKind } from "@/lib/source";
import { rideZonesQuery, runDataQuery, thresholdsQuery } from "@/lib/queries";
import { formatPace, parsePace } from "@/lib/pace";
import { UploadRides } from "@/components/UploadRides";
import { cn } from "@/lib/utils";
import { byMain, mainSport, type MainSport } from "@/lib/sport";

/** The page's categories. Language and main sport reload the page, so the open one lives in the URL. */
const CATEGORIES = ["general", "garden", "data", "account"] as const;
type Category = (typeof CATEGORIES)[number];

export const Route = createFileRoute("/settings")({
  head: () => ({ meta: [{ title: t("Settings — Cirmolo", "Impostazioni — Cirmolo") }] }),
  validateSearch: (s: Record<string, unknown>): { tab?: Category } =>
    CATEGORIES.includes(s["tab"] as Category) ? { tab: s["tab"] as Category } : {},
  component: SettingsPage,
});

const CATEGORY_LABEL: Record<Category, () => string> = {
  general: () => t("General", "Generale"),
  garden: () => t("Tree & garden", "Albero e orto"),
  data: () => t("Data", "Dati"),
  account: () => t("Account", "Account"),
};

/** Cards side by side on a desktop, each at its own height. */
const GRID = "grid items-start gap-6 lg:grid-cols-2";

function SettingsPage() {
  const [source] = useLocalStore<SourceKind | null>(SOURCE, null);
  const [bothSports] = useLocalStore(ANALYSIS_BOTH, false);
  const [garden] = useLocalStore(GARDEN, true);
  const navigate = useNavigate({ from: Route.fullPath });
  // Someone with no data yet is sent here to connect it: that's what they need to see first.
  const active = Route.useSearch().tab ?? (hasSource() ? "general" : "data");
  return (
    <div className="space-y-6">
      <div>
        <div className="eyebrow">{t("This device", "Questo dispositivo")}</div>
        <h1 className="on-sky text-3xl font-bold tracking-tight">
          {t("Settings", "Impostazioni")}
        </h1>
      </div>
      <Tabs
        value={active}
        onValueChange={(v) =>
          void navigate({ search: { tab: v as Category }, replace: true, resetScroll: false })
        }
      >
        <TabsList className="flex w-full">
          {CATEGORIES.map((c) => (
            <TabsTrigger key={c} value={c} className="flex-1 px-1.5 text-xs sm:text-sm">
              {c === "garden" && !garden ? t("Tree", "Albero") : CATEGORY_LABEL[c]()}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="general" className={cn("mt-6", GRID)}>
          <Language />
          <MainSportPanel />
          {(mainSport() === "run" || bothSports) && <RunningPanel />}
          {source === "native" && <Athlete />}
          {source !== "native" && hasSource() && <IntervalsThresholds />}
          <ZoneLimits runs={mainSport() === "run" || bothSports} />
        </TabsContent>
        {/* Two stacks, not a grid: the guides open long, and the garden's stay above the plants they point to. */}
        <TabsContent value="garden" className={cn("mt-6", GRID)}>
          <div className="space-y-6">
            <QuietTree />
            <TreeGuide />
          </div>
          <div className="space-y-6">
            <GardenSwitch />
            {garden && (
              <>
                <GardenGuide />
                <CropPicker />
              </>
            )}
          </div>
        </TabsContent>
        <TabsContent value="data" className={cn("mt-6", GRID)}>
          {source === "native" && <RideFiles />}
          <IntervalsKey />
          {source !== "native" && <WithoutIntervals />}
          <SegmentAnalysis />
          <Storage />
        </TabsContent>
        <TabsContent value="account" className={cn("mt-6", GRID)}>
          <Account />
        </TabsContent>
      </Tabs>
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
            navigate({ to: "/settings", search: { tab: "data" } });
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
const SPROUTS: GuideItem = {
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

const TREE_GUIDE: GuideItem[] = [
  {
    term: t("Crown", "Chioma"),
    text: t(
      "Today's readiness (HRV, sleep, form and check-in, if you use it) as a season, each measured against your own normal: HRV against its 60-day range, sleep against your usual, answers against how you usually answer. Tap it for today's advice and the check-in.",
      "La prontezza di oggi (HRV, sonno, forma e check-in, se lo usi) come stagione, ognuno misurato rispetto al tuo normale: HRV sul suo intervallo di 60 giorni, sonno sul tuo solito, risposte su come rispondi di solito. Toccala per il consiglio del giorno e il check-in.",
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
      byMain(
        t(
          "Your last 42 days of power against your best of the year: the biggest gap that the races need",
          "La tua potenza degli ultimi 42 giorni rispetto al tuo meglio dell'anno: la mancanza più grande che serve alle gare",
        ),
        t(
          "Your last 42 days of grade-adjusted pace against your best of the year: the biggest gap that the races need",
          "Il tuo ritmo corretto per pendenza degli ultimi 42 giorni rispetto al tuo meglio dell'anno: la mancanza più grande che serve alle gare",
        ),
      ),
      byMain(
        t(
          "Base first when steady rides decouple, Z2 time drops, fitness is well below your usual, or your 20 min power fades over 15% after 30 kJ/kg (Analysis → Durability)",
          "Prima la base se le uscite regolari si disaccoppiano, il tempo in Z2 cala, la forma fisica è molto sotto il solito o la potenza sui 20 min cala oltre il 15% dopo 30 kJ/kg (Analisi → Resistenza alla fatica)",
        ),
        t(
          "Base first when easy runs drift, Z2 time drops, fitness is well below your usual, or your 5 min pace fades over 15% after 25 km (Analysis → Late-run fade)",
          "Prima la base se le corse facili vanno in deriva, il tempo in Z2 cala, la forma fisica è molto sotto il solito o il ritmo sui 5 min cala oltre il 15% dopo 25 km (Analisi → Calo nel finale)",
        ),
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
    term: t("Leaves", "Foglie"),
    text: byMain(
      t(
        "One per 100 m climbed, coloured by intensity against FTP:",
        "Una ogni 100 m di dislivello, colorata per intensità rispetto all'FTP:",
      ),
      t(
        "One per 30 m climbed, coloured by intensity against threshold pace:",
        "Una ogni 30 m di dislivello, colorata per intensità rispetto al ritmo di soglia:",
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
  SPROUTS,
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

/** Which sport the app is built around. Wording and pages are fixed for the page's lifetime, so changing it reloads. */
function MainSportPanel() {
  const current = mainSport();
  const [both, setBoth] = useLocalStore(ANALYSIS_BOTH, false);
  const [garden] = useLocalStore(GARDEN, true);
  const choose = async (sport: MainSport) => {
    if (sport === current) return;
    writeSetting(MAIN_SPORT, sport);
    // Firestore waits for the network to confirm a write, so offline it's queued and the page goes on without it.
    await Promise.race([
      saveProfile({ mainSport: sport }).catch((e) => console.warn("Sport not saved", e)),
      new Promise((r) => setTimeout(r, 1500)),
    ]);
    window.location.reload();
  };
  return (
    <Panel title={t("Main sport", "Sport principale")}>
      <p className="text-sm text-muted-foreground">
        {t(
          `Your main sport grows the tree and shapes Analysis, Segments and your training focus.${garden ? " Other sports can grow in the garden." : ""} You can switch at any time: nothing is lost.`,
          `Lo sport principale fa crescere l'albero e dà forma ad Analisi, Segmenti e obiettivo di allenamento.${garden ? " Gli altri sport possono crescere nell'orto." : ""} Puoi cambiarlo quando vuoi: non si perde nulla.`,
        )}
      </p>
      <div className="mt-3 flex gap-1 rounded-lg bg-secondary p-1">
        {(
          [
            ["ride", t("Cycling", "Ciclismo")],
            ["run", t("Running", "Corsa")],
          ] as const
        ).map(([sport, label]) => (
          <button
            key={sport}
            type="button"
            aria-pressed={current === sport}
            onClick={() => void choose(sport)}
            className={`flex-1 rounded-md px-3 py-1.5 text-xs ${current === sport ? "bg-background text-foreground" : "text-muted-foreground"}`}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="mt-4 flex items-start justify-between gap-4">
        <Label htmlFor="analysis-both" className="block space-y-1">
          <span className="block">
            {t("Analysis for both sports", "Analisi per entrambi gli sport")}
          </span>
          <span className="block text-sm font-normal text-muted-foreground">
            {t(
              "Adds a toggle to the Analysis page to switch between cycling and running. It always opens on your main sport.",
              "Aggiunge alla pagina Analisi un selettore per passare da ciclismo a corsa e viceversa. Si apre sempre sullo sport principale.",
            )}
          </span>
        </Label>
        <Switch
          id="analysis-both"
          checked={both}
          onCheckedChange={(v) => {
            setBoth(() => v);
            saveProfile({ analysisBoth: v }).catch((e) => console.warn("Setting not saved", e));
          }}
        />
      </div>
    </Panel>
  );
}

/**
 * Threshold pace and heart rate on foot. Empty means estimated from your runs, or the same heart rate as on the bike.
 * With intervals.icu they're the ones it holds, and saving writes them there after asking; pace stays Cirmolo's own for
 * as long as `paceSynced` says it can't be read from there.
 */
function RunningPanel() {
  const qc = useQueryClient();
  const { data } = useQuery(runDataQuery());
  const { data: th } = useQuery({ ...thresholdsQuery("run"), enabled: hasSource() });
  const native = sourceKind() === "native";
  const [form, setForm] = useState({ pace: "", lthr: "", maxHr: "" });
  const [loaded, setLoaded] = useState(false);
  const [pending, setPending] = useState<PendingWrite | null>(null);
  useEffect(() => {
    if (!th) return;
    void (async () => {
      const pace = th.paceSynced
        ? th.pace
        : (await import("@/lib/cloud").then((m) => m.readProfile())).runThreshold;
      setForm({
        pace: pace ? formatPace(pace) : "",
        lthr: th.lthr ? String(th.lthr) : "",
        maxHr: th.maxHr ? String(th.maxHr) : "",
      });
      setLoaded(true);
    })();
  }, [th]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const speed = form.pace.trim() ? parsePace(form.pace) : null;
    if (form.pace.trim() && !speed) {
      toast.error(
        t("Write the pace as min:sec, e.g. 4:30", "Scrivi il ritmo come min:sec, es. 4:30"),
      );
      return;
    }
    if (native) {
      writeSetting(RUN_THRESHOLD, speed);
      await saveThresholds("run", {
        pace: speed,
        lthr: numOrNull(form.lthr),
        maxHr: numOrNull(form.maxHr),
      });
      await qc.invalidateQueries();
      toast.success(t("Saved", "Salvato"));
      return;
    }
    // What stays in Cirmolo needs no asking.
    if (!th?.paceSynced) {
      writeSetting(RUN_THRESHOLD, speed);
      await saveProfile({ runThreshold: speed });
    }
    const lthr = changedRow(t("Threshold HR", "FC di soglia"), th?.lthr, form.lthr, "bpm");
    const maxHr = changedRow(t("Max HR", "FC massima"), th?.maxHr, form.maxHr, "bpm");
    const pace =
      th?.paceSynced && speed && formatPace(speed) !== formatPace(th.pace)
        ? {
            label: t("Threshold pace", "Ritmo di soglia"),
            from: th.pace ? `${formatPace(th.pace)}/km` : "–",
            to: `${formatPace(speed)}/km`,
            value: speed,
          }
        : null;
    const rows = [pace, lthr, maxHr].filter((r) => r != null);
    if (rows.length && th?.exists) {
      setPending({
        sport: "run",
        rows,
        patch: {
          ...(pace ? { pace: pace.value } : {}),
          ...(lthr ? { lthr: lthr.value } : {}),
          ...(maxHr ? { maxHr: maxHr.value } : {}),
        },
      });
      return;
    }
    await qc.invalidateQueries();
    toast.success(t("Saved", "Salvato"));
  }

  const hrOff = !native && th != null && !th.exists;
  return (
    <Panel title={t("Running", "Corsa")}>
      <form onSubmit={save} className="space-y-3 text-sm">
        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1">
            <Label htmlFor="run-pace">
              {t("Threshold", "Soglia")} <span className="text-muted-foreground">(min/km)</span>
            </Label>
            <Input
              id="run-pace"
              value={form.pace}
              placeholder={
                data?.fit
                  ? t(`estimated ${formatPace(data.fit.speed)}`, `stimata ${formatPace(data.fit.speed)}`)
                  : "4:30"
              }
              onChange={(e) => setForm({ ...form, pace: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="run-lthr">
              {t("Threshold HR", "FC di soglia")} <span className="text-muted-foreground">(bpm)</span>
            </Label>
            <Input
              id="run-lthr"
              inputMode="numeric"
              disabled={hrOff}
              value={form.lthr}
              onChange={(e) => setForm({ ...form, lthr: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="run-max">
              {t("Max HR", "FC massima")} <span className="text-muted-foreground">(bpm)</span>
            </Label>
            <Input
              id="run-max"
              inputMode="numeric"
              disabled={hrOff}
              value={form.maxHr}
              onChange={(e) => setForm({ ...form, maxHr: e.target.value })}
            />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          {t(
            "Threshold pace sets pace zones and training load: about what you could hold for an hour. Leave it empty to estimate it from your best efforts of the last 90 days.",
            "Il ritmo di soglia definisce zone di ritmo e carico: circa quello che reggeresti per un'ora. Lascialo vuoto per stimarlo dai migliori sforzi degli ultimi 90 giorni.",
          )}
          {!native &&
            (hrOff
              ? t(
                  " intervals.icu has no running settings for you yet: add them there to set heart rate.",
                  " intervals.icu non ha ancora impostazioni di corsa per te: aggiungile lì per impostare la frequenza cardiaca.",
                )
              : th?.paceSynced
                ? t(
                    " These are the values on intervals.icu: saving changes them there too, after asking.",
                    " Questi sono i valori su intervals.icu: salvando cambiano anche lì, dopo avertelo chiesto.",
                  )
                : t(
                    " Heart rate is the value on intervals.icu: saving changes it there too, after asking. Pace stays in Cirmolo.",
                    " La frequenza cardiaca è il valore su intervals.icu: salvando cambia anche lì, dopo avertelo chiesto. Il ritmo resta in Cirmolo.",
                  ))}
        </p>
        <Button type="submit" disabled={!loaded}>
          {t("Save", "Salva")}
        </Button>
      </form>
      <ThresholdConfirm pending={pending} onClose={() => setPending(null)} />
    </Panel>
  );
}

function QuietTree() {
  const [quiet, setQuiet] = useLocalStore(QUIET_TREE, false);
  const [seasonal, setSeasonal] = useLocalStore(SEASON_ACCENT, true);
  const [checkIn, setCheckIn] = useLocalStore(CHECK_IN, true);
  return (
    <Panel title={t("Tree", "Albero")}>
      <div className="mb-4 flex items-start justify-between gap-4">
        <Label htmlFor="check-in" className="block space-y-1">
          <span className="block">{t("Morning check-in", "Check-in mattutino")}</span>
          <span className="block text-sm font-normal text-muted-foreground">
            {t(
              "Asks how you slept and how you feel each morning. Off: it's no longer asked, and the crown comes only from your HRV, sleep and form. Your past answers stay saved, but don't count.",
              "Chiede ogni mattina come hai dormito e come ti senti. Spento: non viene più chiesto, e la chioma dipende solo da HRV, sonno e forma. Le risposte passate restano salvate, ma non contano.",
            )}
          </span>
        </Label>
        <Switch
          id="check-in"
          checked={checkIn}
          onCheckedChange={(v) => {
            setCheckIn(() => v);
            saveProfile({ checkIn: v }).catch((e) => console.warn("Setting not saved", e));
          }}
        />
      </div>
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

/** Off, for someone tracking one sport only: the Garden leaves the app, and other sports leave the tree. */
function GardenSwitch() {
  const [garden, setGarden] = useLocalStore(GARDEN, true);
  return (
    <Panel title={t("Garden", "Orto")}>
      <div className="flex items-start justify-between gap-4">
        <Label htmlFor="garden" className="block space-y-1">
          <span className="block">{t("Show the Garden", "Mostra l'orto")}</span>
          <span className="block text-sm font-normal text-muted-foreground">
            {t(
              "Other sports grow in the Garden, with a sprout on the tree. Off, for tracking one sport only: the Garden and the sprouts disappear. Nothing is deleted, and your other activities stay in Activities and the Calendar.",
              "Gli altri sport crescono nell'orto, con un germoglio sull'albero. Spento, per seguire un solo sport: l'orto e i germogli spariscono. Non si cancella nulla, e le altre attività restano in Attività e nel Calendario.",
            )}
          </span>
        </Label>
        <Switch
          id="garden"
          checked={garden}
          onCheckedChange={(v) => {
            setGarden(() => v);
            saveProfile({ garden: v }).catch((e) => console.warn("Setting not saved", e));
          }}
        />
      </div>
    </Panel>
  );
}

function TreeGuide() {
  const [garden] = useLocalStore(GARDEN, true);
  return (
    <Guide
      title={t("How to read the tree", "Come leggere l'albero")}
      intro={t(
        `The Tree page grows from your ${byMain("rides", "runs")}: the top is today, going down is going back in time. Tap any part to see its details.`,
        `La pagina Albero cresce con ${byMain("le tue uscite in bici", "le tue corse")}: in alto c'è oggi, scendendo si torna indietro nel tempo. Tocca qualsiasi parte per vederne i dettagli.`,
      )}
      items={garden ? TREE_GUIDE : TREE_GUIDE.filter((i) => i !== SPROUTS)}
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
        `The sports you do grow in the garden for 8 weeks, then go into the pantry. Tap a plant for its activity, a sign for its bed, a jar for its month.`,
        `Gli sport che fai crescono nell'orto per 8 settimane, poi finiscono in dispensa. Tocca una pianta per la sua attività, un cartello per la sua aiuola, un barattolo per il suo mese.`,
      )}
      items={GARDEN_GUIDE}
    />
  );
}

const GARDEN_GUIDE: GuideItem[] = [
  {
    term: t("Plants", "Piante"),
    text: t(
      "One per session, in its sport's bed, older to the left. Taller for a longer session, lusher for a harder one. A new sport gets a vegetable at random, and you can change it (below); what a session bears depends on the sport:",
      "Una per sessione, nell'aiuola del suo sport, le più vecchie a sinistra. Più alta per una sessione più lunga, più rigogliosa per una più dura. Un nuovo sport riceve un ortaggio a caso, e puoi cambiarlo (qui sotto); quanto frutta una sessione dipende dallo sport:",
    ),
    points: [
      byMain(
        t("Running: one per 5 km", "Corsa: uno ogni 5 km"),
        t("Cycling: one per 20 km", "Ciclismo: uno ogni 20 km"),
      ),
      t("Strength: one, as big as the session", "Forza: uno, grande quanto la sessione"),
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
      t("Climbing: by the session's load", "Arrampicata: secondo il carico della sessione"),
      t(
        "A sport you named: one per quarter of an hour",
        "Uno sport con il tuo nome: uno ogni quarto d'ora",
      ),
      t("Other sports: one", "Altri sport: uno"),
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
      `Dark and moist when you've trained at your garden's sports regularly in the last 4 weeks, pale and resting when not.`,
      `Scura e umida se nelle ultime 4 settimane ti sei allenato regolarmente negli sport del tuo orto, chiara e a riposo se no.`,
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
      `A jar per month, as full as its hours ${byMain("off the bike", "at other sports")}, in layers coloured by sport. Tap one for that month's activities.`,
      `Un barattolo per mese, pieno quanto le sue ore ${byMain("senza bici", "di altri sport")}, a strati colorati per sport. Toccane uno per le attività di quel mese.`,
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
        ? readinessAccuracy(
            readinessRows(wellness),
            acts,
            addDays(isoDate(new Date()), -CHECK_DAYS),
          )
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
            "Each outdoor ride and run is downloaded once and analysed on this device; after that only new ones are. More history finds more recurring climbs but takes longer the first time (and uses mobile data on the phone).",
            "Ogni pedalata e corsa all'aperto viene scaricata una volta e analizzata su questo dispositivo; poi solo le nuove. Più storico trova più salite ricorrenti ma la prima volta richiede più tempo (e usa dati mobili sul telefono).",
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
            `${snap.rides} activities analysed · ${snap.groups.length} climbs found`,
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
