import { QueryClient } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  redirect,
  useRouter,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Activity, Bike, CalendarDays, ChartSpline, CloudOff, Ellipsis, Gauge, Mountain, Scale, Settings } from "lucide-react";

import { Toaster } from "@/components/ui/sonner";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { DailyCheckIn } from "@/components/CheckIn";
import { PwaUpdater } from "@/components/PwaUpdater";
import { useLastSynced, useOnline } from "@/hooks/use-online";
import { syncSegments } from "@/hooks/use-segments";
import { AuthError } from "@/lib/intervals";
import { hasApiKey } from "@/lib/settings";
import { cn } from "@/lib/utils";

function NotFoundComponent() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
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
          {auth ? "intervals.icu didn't accept the API key" : "This page didn't load"}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {auth
            ? "Check the key in Settings."
            : navigator.onLine
              ? "intervals.icu couldn't be reached. Try again in a moment."
              : "You're offline and this page isn't cached yet."}
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          {auth ? (
            <Link
              to="/settings"
              className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Open Settings
            </Link>
          ) : (
            <button
              onClick={() => {
                router.invalidate();
                reset();
              }}
              className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Try again
            </button>
          )}
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [{ title: "Cadence — Cycling Training" }],
  }),
  beforeLoad: ({ location }) => {
    if (location.pathname !== "/settings" && !hasApiKey()) throw redirect({ to: "/settings" });
  },
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

/** `bar: true` items sit in the Android bottom bar; the rest go under "More". */
const NAV = [
  { to: "/", label: "Today", icon: Gauge, bar: true },
  { to: "/rides", label: "Rides", icon: Bike, bar: true },
  { to: "/calendar", label: "Calendar", icon: CalendarDays, bar: true },
  { to: "/analysis", label: "Analysis", icon: ChartSpline, bar: true },
  { to: "/segments", label: "Segments", icon: Mountain, bar: false },
  { to: "/fitness", label: "Fitness", icon: Activity, bar: false },
  { to: "/body", label: "Body", icon: Scale, bar: false },
  { to: "/settings", label: "Settings", icon: Settings, bar: false },
] as const;

function RootComponent() {
  const [more, setMore] = useState(false);
  const online = useOnline();
  const synced = useLastSynced();
  const bar = NAV.filter((n) => n.bar);
  const rest = NAV.filter((n) => !n.bar);

  useEffect(() => {
    syncSegments().catch((e) => console.warn("Segment sync failed", e));
  }, []);

  return (
    <>
      <header className="sticky top-0 z-20 border-b border-border bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
          <Link to="/" className="flex items-center gap-2 font-bold tracking-tight">
            <img src="/icon.svg" alt="" width={24} height={24} className="rounded" />
            Cadence
          </Link>
          {!online && (
            <span className="flex items-center gap-1.5 rounded-full bg-secondary px-2.5 py-1 text-xs text-muted-foreground">
              <CloudOff className="h-3.5 w-3.5" />
              Offline{synced ? ` · data from ${synced}` : ""}
            </span>
          )}
          <nav className="hidden gap-1 lg:flex">
            {NAV.map((n) => (
              <Link
                key={n.to}
                to={n.to}
                activeOptions={{ exact: n.to === "/" }}
                className="rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
                activeProps={{ className: "bg-secondary text-foreground" }}
              >
                {n.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 pb-32 pt-6 lg:pb-12">
        <Outlet />
      </main>
      <nav
        className="fixed inset-x-0 bottom-0 z-20 grid border-t border-border bg-card pb-[env(safe-area-inset-bottom)] lg:hidden"
        style={{ gridTemplateColumns: `repeat(${bar.length + 1}, minmax(0, 1fr))` }}
      >
        {bar.map((n) => (
          <Link
            key={n.to}
            to={n.to}
            activeOptions={{ exact: n.to === "/" }}
            className="flex flex-col items-center gap-1 py-3 text-xs text-muted-foreground"
            activeProps={{ className: "text-primary" }}
          >
            <n.icon className="h-5 w-5" />
            {n.label}
          </Link>
        ))}
        <button
          onClick={() => setMore(true)}
          className={cn("flex flex-col items-center gap-1 py-3 text-xs text-muted-foreground", more && "text-primary")}
        >
          <Ellipsis className="h-5 w-5" />
          More
        </button>
      </nav>
      <Sheet open={more} onOpenChange={setMore}>
        <SheetContent side="bottom" className="rounded-t-2xl pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
          <SheetHeader>
            <SheetTitle>More</SheetTitle>
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
      <Toaster position="top-center" />
      <PwaUpdater />
    </>
  );
}
