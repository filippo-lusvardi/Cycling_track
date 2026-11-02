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
import { useState } from "react";
import {
  Bike,
  CalendarDays,
  ChartSpline,
  CloudOff,
  Ellipsis,
  Mountain,
  Scale,
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
import { ForestSync } from "@/components/forest/ForestSync";
import { hasSource } from "@/lib/source";
import { cn } from "@/lib/utils";
import { t } from "@/lib/i18n";

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
    meta: [{ title: t("Cirmolo — Cycling Training", "Cirmolo — Allenamento ciclismo") }],
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
  { to: "/tree", label: t("Tree", "Albero"), icon: TreeDeciduous, bar: true },
  { to: "/segments", label: t("Segments", "Segmenti"), icon: Mountain, bar: true },
  { to: "/calendar", label: t("Calendar", "Calendario"), icon: CalendarDays, bar: true },
  { to: "/analysis", label: t("Analysis", "Analisi"), icon: ChartSpline, bar: true },
  { to: "/body", label: t("Body", "Corpo"), icon: Scale, bar: false },
  { to: "/rides", label: t("Rides", "Attività"), icon: Bike, bar: false },
  { to: "/settings", label: t("Settings", "Impostazioni"), icon: Settings, bar: false },
] as const;

function RootComponent() {
  const [more, setMore] = useState(false);
  const online = useOnline();
  const synced = useLastSynced();
  const bar = NAV.filter((n) => n.bar);
  const rest = NAV.filter((n) => !n.bar);
  const bare = useRouterState({
    select: (s) => s.location.pathname === "/login" || s.location.pathname === "/privacy",
  });
  // The Segments list fills the screen exactly: a footer after it would sit on top of the list.
  const fullScreen = useRouterState({ select: (s) => /^\/segments\/?$/.test(s.location.pathname) });
  // On the phone the tree and the forests end in their landscape, not in a line of credits (desktop keeps it).
  const scenic = useRouterState({
    select: (s) => /^\/(tree|forest)(\/|$)/.test(s.location.pathname),
  });

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
      {/* Desktop only: on the phone each page's own title is the top, and the bottom bar navigates. */}
      <header className="sticky top-0 z-20 hidden border-b border-border bg-background/80 backdrop-blur lg:block">
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
          <nav className="flex gap-1">
            {NAV.map((n) => (
              <Link
                key={n.to}
                to={n.to}
                className="rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
                activeProps={{ className: "bg-secondary text-foreground" }}
              >
                {n.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      {/* Phone only: the icon and name on a transparent line that scrolls away with the page. */}
      <header className="pt-[env(safe-area-inset-top)] lg:hidden">
        <div className="flex h-12 items-center px-4">
          <Link to="/" className="flex items-center gap-2 font-bold tracking-tight">
            <img src="/icon.svg" alt="" width={24} height={24} className="rounded" />
            Cirmolo
          </Link>
        </div>
      </header>
      {/* Clip anything too wide, so a stray long line never makes the phone zoom the whole page out. On wider
          screens the body clips instead, so the forest scenes can reach the window's edges past this column. */}
      <main className="mx-auto max-w-5xl overflow-x-clip px-4 sm:overflow-x-visible pb-32 pt-2 lg:pb-12 lg:pt-6">
        <Outlet />
        {!fullScreen && (
          <AppFooter
            className={cn("mt-10 border-t border-border pt-4", scenic && "hidden lg:flex")}
          />
        )}
      </main>
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
            className="flex flex-col items-center gap-1 py-3 text-xs text-muted-foreground"
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
      <DailyCheckIn />
      <ForestSync />
      <Toaster position="top-center" />
      <PwaUpdater />
    </>
  );
}
