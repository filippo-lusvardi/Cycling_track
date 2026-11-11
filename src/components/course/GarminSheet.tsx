// Send a route to the bike computer: share the FIT course to the Garmin Connect app (phone), or download it (computer,
// or USB into GARMIN/NewFiles), or a GPX for anything else.
import { Download, Share2 } from "lucide-react";
import { toast } from "sonner";
import { ResponsiveDialog } from "@/components/ResponsiveDialog";
import { fileName, fitCourse, gpxCourse, type CourseFile } from "@/lib/course/fit-course";
import type { LatLng } from "@/lib/course/geo";
import { t } from "@/lib/i18n";

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

const Row = ({
  icon: Icon,
  title,
  sub,
  onClick,
  main,
}: {
  icon: typeof Download;
  title: string;
  sub: string;
  onClick: () => void;
  main?: boolean;
}) => (
  <button
    type="button"
    onClick={onClick}
    className={`flex w-full items-center gap-3 rounded-xl border bg-card p-3 text-left transition-colors hover:bg-secondary ${main ? "border-primary" : "border-border"}`}
  >
    <Icon className={`h-5 w-5 shrink-0 ${main ? "text-primary" : "text-muted-foreground"}`} />
    <span className="min-w-0 flex-1">
      <span className="block font-medium">{title}</span>
      <span className="block text-xs text-muted-foreground">{sub}</span>
    </span>
  </button>
);

export function GarminSheet({
  open,
  onOpenChange,
  course,
  waypoints,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  course: CourseFile;
  waypoints: (LatLng & { name: string })[];
}) {
  const fit = () =>
    new File([fitCourse(course) as BlobPart], fileName(course.name, "fit"), {
      type: "application/octet-stream",
    });
  const canShare = (() => {
    try {
      return (
        typeof navigator.canShare === "function" &&
        navigator.canShare({ files: [new File([""], "x.fit")] })
      );
    } catch {
      return false;
    }
  })();
  async function share() {
    const file = fit();
    try {
      await navigator.share({ files: [file], title: course.name });
      onOpenChange(false);
    } catch (e) {
      if ((e as Error).name !== "AbortError") {
        download(file, file.name);
        toast(t("Saved as a file instead", "Salvato come file"));
      }
    }
  }
  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("Send to Garmin", "Invia a Garmin")}
      description={t(
        "A course to follow, with your checkpoints and the foot and top of each climb.",
        "Un percorso da seguire, con le tappe e l'inizio e la cima di ogni salita.",
      )}
    >
      <div className="space-y-2 pb-2">
        {canShare && (
          <Row
            main
            icon={Share2}
            title={t("Open in Garmin Connect", "Apri in Garmin Connect")}
            sub={t(
              'Share the file with the app, then "Send to device"',
              "Condividi il file con l'app, poi «Invia al dispositivo»",
            )}
            onClick={() => void share()}
          />
        )}
        <Row
          main={!canShare}
          icon={Download}
          title={t("Download .fit", "Scarica .fit")}
          sub={t(
            "On a computer: connect.garmin.com › Courses › Import, or copy it into GARMIN/NewFiles",
            "Su computer: connect.garmin.com › Percorsi › Importa, o copialo in GARMIN/NewFiles",
          )}
          onClick={() => {
            const f = fit();
            download(f, f.name);
          }}
        />
        <Row
          icon={Download}
          title={t("Download .gpx", "Scarica .gpx")}
          sub={t("For other devices and apps", "Per altri dispositivi e app")}
          onClick={() =>
            download(
              new Blob([gpxCourse(course.name, course.line, waypoints)], {
                type: "application/gpx+xml",
              }),
              fileName(course.name, "gpx"),
            )
          }
        />
      </div>
    </ResponsiveDialog>
  );
}
