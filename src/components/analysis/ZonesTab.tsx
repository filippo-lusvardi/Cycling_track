// Your zones and the thresholds they come from, to read. Editing stays in Settings.
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Panel, StatCard } from "@/components/StatCard";
import { t } from "@/lib/i18n";
import { formatPace } from "@/lib/pace";
import { rideZonesQuery, thresholdsQuery } from "@/lib/queries";
import { zoneTops } from "@/lib/settings";
import { knownRunThreshold, type MainSport } from "@/lib/sport";
import { cn } from "@/lib/utils";
import { hrRows, paceRows, powerRows, type ZoneRow } from "@/lib/zone-table";

const Edit = () => (
  <Link
    to="/settings"
    search={{ tab: "general" }}
    className="text-xs text-muted-foreground hover:text-foreground"
  >
    {t("Edit", "Modifica")}
  </Link>
);

function Zones({ title, rows, on }: { title: string; rows: ZoneRow[]; on?: number | undefined }) {
  return (
    <Panel title={title} action={<Edit />}>
      {rows.length ? (
        <div className="-mx-2 space-y-0.5">
          {rows.map((r) => (
            <div
              key={r.zone}
              aria-current={on === r.zone ? "true" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-lg px-2 py-1.5",
                on === r.zone && "bg-secondary",
              )}
            >
              <span
                className="stat-num flex h-7 w-8 shrink-0 items-center justify-center rounded-md text-xs font-semibold"
                style={{
                  background: `color-mix(in oklab, var(--z${r.zone}) 28%, transparent)`,
                  color: `var(--z${r.zone})`,
                }}
              >
                Z{r.zone}
              </span>
              <span className={cn("min-w-0 flex-1 text-sm", on === r.zone && "font-medium")}>
                {r.name}
              </span>
              <span className="stat-num shrink-0 text-sm">{r.range}</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="py-2 text-sm text-muted-foreground">
          {t("Not set yet.", "Non ancora impostate.")}{" "}
          <Link to="/settings" search={{ tab: "general" }} className="underline">
            {t("Set them in Settings", "Vai alle Impostazioni")}
          </Link>
        </p>
      )}
    </Panel>
  );
}

export function ZonesTab({ sport, zone }: { sport: MainSport; zone?: number | undefined }) {
  const { data: zones } = useQuery(rideZonesQuery(sport));
  const { data: th } = useQuery(thresholdsQuery(sport));
  const run = sport === "run";
  const threshold = knownRunThreshold();
  const hr = hrRows(zones?.hr ?? [], sport);
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2 md:gap-3">
        {run ? (
          <StatCard
            label={t("Pace", "Passo")}
            tone="fitness"
            value={threshold ? formatPace(threshold) : "–"}
            hint="min/km"
          />
        ) : (
          <StatCard label="FTP" tone="fitness" value={zones?.ftp ?? th?.ftp ?? "–"} hint="W" />
        )}
        <StatCard
          label={t("Threshold HR", "FC soglia")}
          tone="fatigue"
          value={th?.lthr ?? "–"}
          hint="bpm"
        />
        <StatCard label={t("Max HR", "FC max")} value={th?.maxHr ?? "–"} hint="bpm" />
      </div>
      <div className="grid items-start gap-4 lg:grid-cols-2">
        {run ? (
          <Zones
            title={t("Pace (min/km)", "Passo (min/km)")}
            rows={threshold ? paceRows(threshold, zoneTops().pace) : []}
            on={zone}
          />
        ) : (
          <Zones title={t("Power", "Potenza")} rows={powerRows(zones?.power ?? [])} on={zone} />
        )}
        <Zones title={t("Heart rate", "Frequenza cardiaca")} rows={hr} on={zone} />
      </div>
    </div>
  );
}
