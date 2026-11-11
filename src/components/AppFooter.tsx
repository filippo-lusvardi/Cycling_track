import { Link } from "@tanstack/react-router";
import { useLocalStore } from "@/hooks/use-local-store";
import { t } from "@/lib/i18n";
import { GARMIN, SOURCE } from "@/lib/settings";
import { cn } from "@/lib/utils";

/** Data credits (Garmin's attribution once any activity came from one), privacy, licence and source links. */
export function AppFooter({ className }: { className?: string }) {
  const [garmin] = useLocalStore<boolean>(GARMIN, false);
  const [source] = useLocalStore<string | null>(SOURCE, null);
  const credits = [
    source !== "native" && t("Data from intervals.icu", "Dati da intervals.icu"),
    garmin &&
      t(
        "Insights derived in part from Garmin device-sourced data",
        "Analisi derivate in parte da dati di dispositivi Garmin",
      ),
  ].filter(Boolean);
  return (
    <footer
      className={cn(
        "flex flex-wrap justify-between gap-x-4 gap-y-1 text-xs text-muted-foreground",
        className,
      )}
    >
      <span>{credits.join(" · ")}</span>
      <span className="flex gap-3">
        <Link to="/privacy" className="underline hover:text-foreground">
          {t("Privacy", "Privacy")}
        </Link>
        <a
          href="/licenses.txt"
          target="_blank"
          rel="noreferrer"
          className="underline hover:text-foreground"
        >
          {t("Licences", "Licenze")}
        </a>
        <a
          href="https://github.com/filippo-lusvardi/Cycling_track"
          target="_blank"
          rel="noreferrer"
          className="underline hover:text-foreground"
        >
          {t("Source code", "Codice sorgente")}
        </a>
      </span>
    </footer>
  );
}
