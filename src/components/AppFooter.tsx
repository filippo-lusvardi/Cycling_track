import { Link } from "@tanstack/react-router";
import { useLocalStore } from "@/hooks/use-local-store";
import { t } from "@/lib/i18n";
import { GARMIN } from "@/lib/settings";
import { cn } from "@/lib/utils";

/** Data credits (Garmin's attribution once any activity came from one) and the privacy link. */
export function AppFooter({ className }: { className?: string }) {
  const [garmin] = useLocalStore<boolean>(GARMIN, false);
  return (
    <footer
      className={cn(
        "flex flex-wrap justify-between gap-x-4 gap-y-1 text-xs text-muted-foreground",
        className,
      )}
    >
      <span>
        {t("Data from intervals.icu", "Dati da intervals.icu")}
        {garmin &&
          t(
            " · Insights derived in part from Garmin device-sourced data",
            " · Analisi derivate in parte da dati di dispositivi Garmin",
          )}
      </span>
      <Link to="/privacy" className="underline hover:text-foreground">
        {t("Privacy", "Privacy")}
      </Link>
    </footer>
  );
}
