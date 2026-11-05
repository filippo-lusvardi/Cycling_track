import { QueryClient } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  redirect,
  useRouter,
  useRouterState,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useState } from "react";
import {
  Activity,
  CalendarDays,
  ChartSpline,
  CloudOff,
  Dumbbell,
  Ellipsis,
  Mountain,
  Sprout,
  Settings,
  TreeDeciduous,
} from "lucide-react";

import { Toaster } from "@/components/ui/sonner";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { DailyCheckIn } from "@/components/CheckIn";
import { PwaUpdater } from "@/components/PwaUpdater";
import { useLastSynced, useOnline } from "@/hooks/use-online";
import { sessionReady } from "@/lib/account";
import { auth, authReady } from "@/lib/firebase";
import { AuthError } from "@/lib/intervals";
import { AppFooter } from "@/components/AppFooter";
import { AskNav } from "@/components/nav/AskNav";
import { Legend } from "@/components/nav/Legend";
import { openLegend } from "@/components/nav/legend-store";
import { PageSky, SkyLand } from "@/components/sky/SkyPage";
import { SKY_PAGE, useSkyPage } from "@/hooks/use-sky-page";
import { recordSinceLoad } from "@/lib/perf";
import { hasSource } from "@/lib/source";
import { cn } from "@/lib/utils";
import { t } from "@/lib/i18n";
import { useLocalStore } from "@/hooks/use-local-store";
import {
  CLASSIC_NAV,
  GARDEN,
  gardenOn,
  LEGEND_SEEN,
  readSetting,
  writeSetting,
} from "@/lib/settings";
import { byMain } from "@/lib/sport";

// Background forest sync needs Firestore: loaded after the first screen, not before it.
const ForestSync = lazy(() =>
  import("@/components/forest/ForestSync").then((m) => ({ default: m.ForestSync })),
);

function NotFoundComponent() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">
          {t("Page not found", "Pagina non trovata")}
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {t(
            "The page you're looking for doesn't exist or has been moved.",
            "La pagina che cerchi non esiste o è stata spostata.",
          )}
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            {t("Go home", "Torna alla home")}
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: ErrorComponentProps) {
  console.error(error);
  const router = useRouter();
  const auth = error instanceof AuthError;

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          {auth
            ? t(
                "intervals.icu didn't accept the API key",
                "intervals.icu non ha accettato la chiave API",
              )
            : t("This page didn't load", "Questa pagina non si è caricata")}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {auth
            ? t("Check the key in Settings.", "Controlla la chiave nelle Impostazioni.")
            : navigator.onLine
              ? t(
                  "intervals.icu couldn't be reached. Try again in a moment.",
                  "intervals.icu non è raggiungibile. Riprova tra poco.",
                )
              : t(
                  "You're offline and this page isn't cached yet.",
                  "Sei offline e questa pagina non è ancora in cache.",
                )}
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          {auth ? (
            <Link
              to="/settings"
              className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              {t("Open Settings", "Apri Impostazioni")}
            </Link>
          ) : (
            <button
              onClick={() => {
                router.invalidate();
                reset();
              }}
              className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              {t("Try again", "Riprova")}
            </button>
          )}
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            {t("Go home", "Torna alla home")}
          </Link>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      {
        title: byMain(
          t("Cirmolo — Cycling Training", "Cirmolo — Allenamento di ciclismo"),
          t("Cirmolo — Running Training", "Cirmolo — Allenamento di corsa"),
        ),
      },
    ],
  }),
  beforeLoad: async ({ location }) => {
    // The privacy notice must be readable before anyone signs up.
    if (location.pathname === "/privacy") return;
    await authReady;
    const login = location.pathname === "/login";
    if (!auth.currentUser) {
      // An invite link survives signing in: the login page comes back to it.
      if (!login) throw redirect({ to: "/login", search: { next: location.href } });
      return;
    }
    if (login) throw redirect({ to: "/" });
    // A new device waits for the account's settings; one that has them opens at once, even offline.
    if (!hasSource()) await sessionReady();
    // Settings must open before a data source is chosen; a forest invite can be answered before that.
    const free = location.pathname === "/settings" || location.pathname.startsWith("/forest/join/");
    if (!free && !hasSource()) throw redirect({ to: "/settings" });
  },
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

/** `bar: true` items sit in the Android bottom bar; the rest go under "More". */
const NAV = [
  { to: "/", label: t("Tree", "Albero"), icon: TreeDeciduous, bar: true },
  { to: "/garden", label: t("Garden", "Orto"), icon: Sprout, bar: true },
  { to: "/segments", label: t("Segments", "Segmenti"), icon: Mountain, bar: true },
  { to: "/calendar", label: t("Calendar", "Calendario"), icon: CalendarDays, bar: true },
  { to: "/analysis", label: t("Analysis", "Analisi"), icon: ChartSpline, bar: true },
  { to: "/rides", label: t("Activities", "Attività"), icon: Activity, bar: false },
  { to: "/workouts", label: t("Workouts", "Allenamenti"), icon: Dumbbell, bar: false },
  { to: "/settings", label: t("Settings", "Impostazioni"), icon: Settings, bar: false },
] as const;

function RootComponent() {
  // The app shell is on screen (the page itself may still be loading its data).
  useEffect(() => recordSinceLoad("app_start"), []);
  const [more, setMore] = useState(false);
  const online = useOnline();
  const synced = useLastSynced();
  const [garden] = useLocalStore(GARDEN, gardenOn());
  const [classic] = useLocalStore(CLASSIC_NAV, readSetting<boolean>(CLASSIC_NAV) ?? false);
  const nav = NAV.filter((n) => garden || n.to !== "/garden");
  const bar = nav.filter((n) => n.bar);
  const rest = nav.filter((n) => !n.bar);
  const bare = useRouterState({
    select: (s) => s.location.pathname === "/login" || s.location.pathname === "/privacy",
  });
  // The Segments list fills the screen exactly: a footer after it would sit on top of the list.
  const fullScreen = useRouterState({ select: (s) => /^\/segments\/?$/.test(s.location.pathname) });
  // On the phone the landscapes end in themselves, not in a line of credits (desktop keeps it).
  const scenic = useRouterState({
    select: (s) => /^\/((garden|forest)(\/|$)|$)/.test(s.location.pathname),
  });
  // The forests are reached from the tree: the Tree stays lit in the nav there.
  const inForest = useRouterState({ select: (s) => /^\/forest(\/|$)/.test(s.location.pathname) });
  const navClass = (to: string, on: string) => (to === "/" && inForest ? on : undefined);
  // The Tree, the Garden and the forests live under the sky of the moment: the page takes its colour, the bar is glass.
  const skyPage = useRouterState({ select: (s) => SKY_PAGE.test(s.location.pathname) });
  useSkyPage(skyPage);
  // The legend comes up once on this device, the first time the tree does.
  const onTree = useRouterState({ select: (s) => s.location.pathname === "/" });
  useEffect(() => {
    if (!onTree || !hasSource() || readSetting(LEGEND_SEEN)) return;
    writeSetting(LEGEND_SEEN, true);
    openLegend("crown", "tree");
  }, [onTree]);
  // The sun and moon cross the sky only on the Garden and the forests; the other pages, the Tree among them, get the
  // plain sky over hills (the forests draw their own land).
  // A member's tree (/forest/<forest>/<member>) and their rides are plain pages too: plain sky, high hills.
  const memberTree = useRouterState({
    select: (s) =>
      /^\/forest\/(?!join\/)[^/]+\/[^/]+(\/ride\/[^/]+)?\/?$/.test(s.location.pathname),
  });
  const forestPage = useRouterState({
    select: (s) => /^\/forest(\/|$)/.test(s.location.pathname) && !memberTree,
  });
  const sunPage =
    useRouterState({
      select: (s) => /^\/garden(\/|$)/.test(s.location.pathname),
    }) || forestPage;

  if (bare)
    return (
      <>
        <main className="mx-auto max-w-5xl px-4 pb-12 pt-6">
          <Outlet />
        </main>
        <Toaster position="top-center" />
        <PwaUpdater />
      </>
    );

  return (
    <>
      {/* One sky behind the whole window, from its very top. */}
      {skyPage && <PageSky bodies={sunPage} own={!sunPage && !forestPage && !memberTree} />}
      {skyPage && !sunPage && !forestPage && <SkyLand high />}
      {/* Desktop only: on the phone each page's own title is the top, and the bottom bar navigates. */}
      <header
        className={cn(
          "sticky top-0 z-20 hidden backdrop-blur lg:block",
          // Over the sky, glass dense enough for the links to read on a noon sky as on a night one.
          skyPage
            ? "bg-gradient-to-b from-background/55 to-background/0 backdrop-blur-none"
            : "border-b border-border bg-background/80",
        )}
      >
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
          <Link to="/" className="flex items-center gap-2 font-bold tracking-tight">
            <img src="/icon.svg" alt="" width={24} height={24} className="rounded" />
            Cirmolo
          </Link>
          {!online && (
            <span className="flex items-center gap-1.5 rounded-full bg-secondary px-2.5 py-1 text-xs text-muted-foreground">
              <CloudOff className="h-3.5 w-3.5" />
              Offline{synced ? t(` · data from ${synced}`, ` · dati del ${synced}`) : ""}
            </span>
          )}
          {classic ? (
            <nav className="flex gap-1">
              {nav.map((n) => (
                <Link
                  key={n.to}
                  to={n.to}
                  activeOptions={{ exact: n.to === "/" }}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground",
                    navClass(n.to, "bg-secondary text-foreground"),
                  )}
                  activeProps={{ className: "bg-secondary text-foreground" }}
                >
                  {n.label}
                </Link>
              ))}
            </nav>
          ) : (
            <div className="w-[480px] min-w-0">
              <AskNav desktop />
            </div>
          )}
        </div>
      </header>
      {/* Phone only: the icon and name on a transparent line that scrolls away with the page. */}
      <header className="on-sky relative z-10 pt-[env(safe-area-inset-top)] lg:hidden">
        <div className="flex h-12 items-center px-4">
          <Link to="/" className="flex items-center gap-2 font-bold tracking-tight">
            <img src="/icon.svg" alt="" width={24} height={24} className="rounded" />
            Cirmolo
          </Link>
        </div>
      </header>
      {/* Clip anything too wide, so a stray long line never makes the phone zoom the whole page out. On wider
          screens the body clips instead, so the forest scenes can reach the window's edges past this column. */}
      <main
        className={cn(
          "mx-auto max-w-5xl overflow-x-clip px-4 sm:overflow-x-visible pb-32 pt-2 lg:pb-12 lg:pt-6",
          // Above the page's sky and land (components/sky/SkyPage).
          skyPage && "relative z-10",
        )}
      >
        <Outlet />
        {!fullScreen && (
          <AppFooter
            className={cn(
              "mt-10 border-t border-border pt-4",
              scenic && "hidden lg:flex",
              // Over the sky: a glass strip, so the credits read on any hour.
              skyPage && "glass rounded-xl border-t-0 px-4 pb-3 text-foreground/80",
            )}
          />
        )}
      </main>
      {classic ? (
        <>
          <nav
            className="fixed inset-x-0 bottom-0 z-20 grid border-t border-border bg-card pb-[env(safe-area-inset-bottom)] lg:hidden"
            style={{ gridTemplateColumns: `repeat(${bar.length + 1}, minmax(0, 1fr))` }}
          >
            {!online && (
              <div
                className="col-span-full flex items-center justify-center gap-1.5 border-b border-border py-1 text-xs text-muted-foreground"
                role="status"
              >
                <CloudOff className="h-3.5 w-3.5" />
                Offline{synced ? t(` · data from ${synced}`, ` · dati del ${synced}`) : ""}
              </div>
            )}
            {bar.map((n) => (
              <Link
                key={n.to}
                to={n.to}
                activeOptions={{ exact: n.to === "/" }}
                className={cn(
                  "flex flex-col items-center gap-1 py-3 text-xs text-muted-foreground",
                  navClass(n.to, "text-primary"),
                )}
                activeProps={{ className: "text-primary" }}
              >
                <n.icon className="h-5 w-5" />
                {n.label}
              </Link>
            ))}
            <button
              onClick={() => setMore(true)}
              className={cn(
                "flex flex-col items-center gap-1 py-3 text-xs text-muted-foreground",
                more && "text-primary",
              )}
            >
              <Ellipsis className="h-5 w-5" />
              {t("More", "Altro")}
            </button>
          </nav>
          <Sheet open={more} onOpenChange={setMore}>
            <SheetContent
              side="bottom"
              className="rounded-t-2xl pb-[calc(1.5rem+env(safe-area-inset-bottom))]"
            >
              <SheetHeader>
                <SheetTitle>{t("More", "Altro")}</SheetTitle>
              </SheetHeader>
              <div className="mt-4 grid grid-cols-3 gap-2">
                {rest.map((n) => (
                  <Link
                    key={n.to}
                    to={n.to}
                    onClick={() => setMore(false)}
                    className="flex flex-col items-center gap-2 rounded-xl bg-secondary py-4 text-sm"
                    activeProps={{ className: "text-primary" }}
                  >
                    <n.icon className="h-5 w-5" />
                    {n.label}
                  </Link>
                ))}
              </div>
            </SheetContent>
          </Sheet>
        </>
      ) : (
        <div className="pointer-events-none fixed inset-x-3 bottom-[calc(0.75rem+env(safe-area-inset-bottom))] z-20 mx-auto max-w-md space-y-1 lg:hidden">
          {!online && (
            <div
              className="on-sky flex items-center justify-center gap-1.5 text-xs text-foreground/85"
              role="status"
            >
              <CloudOff className="h-3.5 w-3.5" />
              Offline{synced ? t(` · data from ${synced}`, ` · dati del ${synced}`) : ""}
            </div>
          )}
          <div className="pointer-events-auto">
            <AskNav />
          </div>
        </div>
      )}
      <Legend garden={garden} />
      <DailyCheckIn />
      <Suspense fallback={null}>
        <ForestSync />
      </Suspense>
      <Toaster position="top-center" />
      <PwaUpdater />
    </>
  );
}
