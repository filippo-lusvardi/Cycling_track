import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { clear as clearIdb } from "idb-keyval";
import { useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { Panel } from "@/components/StatCard";
import { FocusPanel } from "@/components/tree/TreeSheets";
import { useFocus } from "@/hooks/use-focus";
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
import { launcherLink, newLauncherKey, shareSeason, stopSharing } from "@/lib/launcher-share";
import type { Season } from "@/lib/tree";
import { authError } from "@/lib/auth-errors";
import { deleteUserData, saveProfile } from "@/lib/cloud";
import { auth } from "@/lib/firebase";
import { format, lang, setLang, t } from "@/lib/i18n";
import { getAthlete, hasSource, saveThresholds, sourceKind } from "@/lib/source";
import {
  activitiesQuery,
  allActivitiesQuery,
  wellnessQuery,
  wellnessRangeQuery,
} from "@/lib/queries";
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
  LAST_SEASON,
  LAUNCHER_KEY,
  MAIN_SPORT,
  RUN_THRESHOLD,
  SEGMENT_HISTORY,
  SOURCE,
  readSetting,
  writeSetting,
} from "@/lib/settings";
import type { Activity, Wellness } from "@/lib/intervals";
import type { SourceKind } from "@/lib/source";
import { rideZonesQuery, runDataQuery, thresholdsQuery } from "@/lib/queries";
import { formatPace, parsePace } from "@/lib/pace";
import { GARDEN_GUIDE, SPROUTS, TREE_GUIDE, type GuideItem } from "@/lib/guides";
import { UploadRides } from "@/components/UploadRides";
import { cn } from "@/lib/utils";
import { mainSport, type MainSport } from "@/lib/sport";

/** The page's categories. Language and main sport reload the page, so the open one lives in the URL. */
const CATEGORIES = ["general", "garden", "data", "account"] as const;
type Category = (typeof CATEGORIES)[number];

export const Route = createFileRoute("/settings")({
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

/** The training block: what it trains, why it was chosen, the races ahead, and choosing it by hand. */
function TrainingBlock() {
  const today = isoDate(new Date());
  const { data: acts } = useQuery(allActivitiesQuery());
  const oldest = acts?.length
    ? acts[acts.length - 1]!.start_date_local.slice(0, 10)
    : addDays(today, -365);
  const { data: wellness } = useQuery({
    ...wellnessRangeQuery({ oldest, newest: today }),
    enabled: !!acts,
  });
  // Only on full data: the block is remembered, so one worked out from nothing would stick.
  return acts && wellness ? <LoadedBlock acts={acts} wellness={wellness} today={today} /> : null;
}

function LoadedBlock({
  acts,
  wellness,
  today,
}: {
  acts: Activity[];
  wellness: Wellness[];
  today: string;
}) {
  const focus = useFocus(acts, wellness, today);
  return (
    <div className="rounded-xl bg-card">
      <FocusPanel focus={focus} quality={false} />
    </div>
  );
}

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
        <div className="eyebrow">{t("Account & device", "Account e dispositivo")}</div>
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
          {hasSource() && <TrainingBlock />}
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
          ? t(
              `Connected to intervals.icu as ${a.name}`,
              `Connessione a intervals.icu riuscita: ${a.name}`,
            )
          : t("Connected to intervals.icu", "Connessione a intervals.icu riuscita"),
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
              {t("Remove key", "Rimuovi chiave")}
            </Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          {t(
            "Kept in your account (readable only by you), ready on every device you sign in on.",
            "Conservata nel tuo account (leggibile solo da te), pronta su ogni dispositivo su cui accedi.",
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
            "Cirmolo can keep your activities itself. Upload .fit files from your device or training app and it works out fitness, fatigue, zones and curves. Check-ins, weight, races and sick days are saved in your account.",
            "Cirmolo può conservare le tue attività: carica i file .fit dal tuo dispositivo o dalla tua app di allenamento e calcola fitness, fatica, zone e curve. Check-in, peso, gare e giorni di malattia restano nel tuo account.",
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
              "I agree that Cirmolo stores my activities and health data (heart rate, HRV, sleep, weight) in my account to analyse my training, as described in the ",
              "Acconsento alla conservazione nel mio account delle mie attività e dei dati sulla salute (frequenza cardiaca, HRV, sonno, peso) per analizzare il mio allenamento, come descritto nell'",
            )}
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
    toast.success(t("Activities recalculated", "Attività ricalcolate"));
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
            "FTP sets cycling power zones and training load; leave it empty to use the estimate from your last 42 days. Threshold heart rate (or 90% of max) is used for activities without a power meter.",
            "L'FTP definisce zone di potenza in bici e carico; lascialo vuoto per usare la stima degli ultimi 42 giorni. La FC di soglia (o il 90% della massima) serve per le attività senza misuratore di potenza.",
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
              : t("Recalculate all activities", "Ricalcola tutte le attività")}
          </Button>
        </div>
      </form>
    </Panel>
  );
}

function RideFiles() {
  return (
    <Panel title={t("Activity files", "File delle attività")}>
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
            {t("Signed in as", "Accesso effettuato come")}{" "}
            <span className="font-medium">{user.email}</span>
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
            "Signing out removes your data from this device. It stays in your account, and on intervals.icu if you use it.",
            "Uscendo, i tuoi dati vengono rimossi da questo dispositivo. Restano nel tuo account e, se lo usi, su intervals.icu.",
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
                "Deletes your account and saved segments. Enter your current password above to confirm. Any data on intervals.icu isn't touched.",
                "Elimina l'account e i segmenti salvati. Inserisci la password attuale qui sopra per confermare. Gli eventuali dati su intervals.icu non vengono toccati.",
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
          `Lo sport principale fa crescere l'albero e determina Analisi, Segmenti e focus di allenamento.${garden ? " Gli altri sport possono crescere nell'orto." : ""} Puoi cambiarlo quando vuoi: non si perde nulla.`,
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
        t("Write the pace as min:sec, e.g. 4:30", "Scrivi il passo come min:sec, es. 4:30"),
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
            label: t("Threshold pace", "Passo di soglia"),
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
                  ? t(
                      `estimated ${formatPace(data.fit.speed)}`,
                      `stimata ${formatPace(data.fit.speed)}`,
                    )
                  : "4:30"
              }
              onChange={(e) => setForm({ ...form, pace: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="run-lthr">
              {t("Threshold HR", "FC di soglia")}{" "}
              <span className="text-muted-foreground">(bpm)</span>
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
            "Il passo di soglia definisce zone di passo e carico: circa quello che reggeresti per un'ora. Lascialo vuoto per stimarlo dai migliori sforzi degli ultimi 90 giorni.",
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
                    " La frequenza cardiaca è il valore su intervals.icu: salvando cambia anche lì, dopo avertelo chiesto. Il passo resta in Cirmolo.",
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
              "Asks how you slept and how you feel each morning. Off: it's no longer asked, and the crown comes from your HRV, sleep, form and how your activities felt. Your past answers stay saved, but don't count.",
              "Chiede ogni mattina come hai dormito e come ti senti. Disattivato: non viene più chiesto, e la chioma dipende da HRV, sonno, forma e da come sono andate le attività. Le risposte passate restano salvate, ma non contano.",
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
          <span className="block">
            {t("Hide scores on the tree", "Nascondi i numeri sull'albero")}
          </span>
          <span className="block text-sm font-normal text-muted-foreground">
            {t(
              "Readiness, fitness, form and load stay hidden until you tap.",
              "Readiness, fitness, forma e carico restano nascosti finché non tocchi.",
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
              "Schede, barre, pulsanti e link prendono il colore dall'albero di oggi: verde in primavera ed estate, ambra in autunno, azzurro ghiaccio in inverno, più grigio quanto peggiore è il tempo. Disattivato: il blu classico.",
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
      <LauncherShare />
    </Panel>
  );
}

/** A link the phone launcher reads today's season from, to take its colour. */
function LauncherShare() {
  const [key, setKey] = useState(() => readSetting<string>(LAUNCHER_KEY));
  const [busy, setBusy] = useState(false);
  const link = key ? launcherLink(key) : null;

  async function start() {
    const next = newLauncherKey();
    setBusy(true);
    try {
      writeSetting(LAUNCHER_KEY, next);
      await saveProfile({ launcherKey: next });
      const season = readSetting<Season>(LAST_SEASON);
      if (season) await shareSeason(season, true);
      setKey(next);
    } catch (e) {
      writeSetting(LAUNCHER_KEY, null);
      console.warn("Launcher link not created", e);
      toast.error(t("Couldn't create the link", "Impossibile creare il link"));
    } finally {
      setBusy(false);
    }
  }

  async function stop() {
    if (!key) return;
    setBusy(true);
    try {
      await stopSharing(key);
      await saveProfile({ launcherKey: null });
      writeSetting(LAUNCHER_KEY, null);
      setKey(null);
    } catch (e) {
      console.warn("Launcher link not removed", e);
      toast.error(t("Couldn't stop sharing", "Impossibile smettere di condividere"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4 space-y-2">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <span className="block text-sm font-medium">
            {t("Phone launcher", "Launcher del telefono")}
          </span>
          <span className="block text-sm text-muted-foreground">
            {t(
              "A link your launcher reads today's season from, to take its colour. Whoever has the link sees the season and nothing else.",
              "Un link da cui il launcher legge la stagione di oggi, per prenderne il colore. Chi ha il link vede la stagione e nient'altro.",
            )}
          </span>
        </div>
        {link ? (
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => void stop()}>
            {t("Stop", "Interrompi")}
          </Button>
        ) : (
          <Button size="sm" variant="outline" disabled={busy} onClick={() => void start()}>
            {t("Create link", "Crea link")}
          </Button>
        )}
      </div>
      {link && (
        <div className="flex gap-2">
          <Input
            readOnly
            value={link}
            onFocus={(e) => e.currentTarget.select()}
            className="font-mono text-xs"
          />
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              void navigator.clipboard
                .writeText(link)
                .then(() => toast.success(t("Link copied", "Link copiato")))
            }
          >
            {t("Copy", "Copia")}
          </Button>
        </div>
      )}
    </div>
  );
}

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
              "Gli altri sport crescono nell'orto, con un germoglio sull'albero. Disattivato, per seguire un solo sport: l'orto e i germogli spariscono. Non si cancella nulla, e le altre attività restano in Attività e nel Calendario.",
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
        "The Tree page grows from your main sport: the top is today, going down is going back in time. Tap any part to see its details.",
        "La pagina Albero cresce con il tuo sport principale: in alto c'è oggi, scendendo si torna indietro nel tempo. Tocca qualsiasi parte per vederne i dettagli.",
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
            ? t("weak: treat it as a rough hint", "debole: prendila come un'indicazione di massima")
            : t(
                "not matching: check HRV and sleep data",
                "non corrisponde: controlla i dati di HRV e sonno",
              );
  return (
    <div className="mt-4 rounded-lg bg-secondary/60 p-3 text-sm">
      <div className="font-medium">
        {t("Is readiness right for you?", "La readiness è affidabile per te?")}
      </div>
      <p className="mt-1 text-muted-foreground">
        {acc.r == null
          ? t(
              `Rate how your activities felt, on their own pages: after ${ACCURACY_MIN_RIDES} rated activities (${acc.rides} so far) this compares them with that morning's readiness.`,
              `Valuta come sono andate le attività, nella loro pagina: dopo ${ACCURACY_MIN_RIDES} attività valutate (finora ${acc.rides}) qui si confrontano con la readiness di quella mattina.`,
            )
          : t(
              `Over ${acc.rides} rated activities in the last ${CHECK_DAYS} days, readiness and how they felt match with a correlation of ${acc.r.toFixed(2)}: ${verdict}.`,
              `Su ${acc.rides} attività valutate negli ultimi ${CHECK_DAYS} giorni, readiness e sensazioni corrispondono con una correlazione di ${acc.r.toFixed(2)}: ${verdict}.`,
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
            "Each outdoor activity is downloaded once and analysed on this device; after that only new ones are. More history finds more recurring climbs but takes longer the first time (and uses mobile data on the phone).",
            "Ogni attività all'aperto viene scaricata una volta e analizzata su questo dispositivo; poi solo le nuove. Più storico trova più salite ricorrenti ma la prima volta richiede più tempo (e usa dati mobili sul telefono).",
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
                  "Downloaded activities deleted; they'll be fetched again on the next sync",
                  "Attività scaricate eliminate; verranno riscaricate alla prossima sincronizzazione",
                ),
              );
            }}
          >
            {t("Delete downloaded activities", "Elimina attività scaricate")}
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
            "The latest data and every activity's recordings are kept on this device, so the app opens offline.",
            "Gli ultimi dati e le registrazioni di ogni attività restano su questo dispositivo, così l'app si apre offline.",
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
