import { useQueryClient } from "@tanstack/react-query";
import { Upload } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { t } from "@/lib/i18n";
import { ACTIVITY_FILE, uploadActivityFile } from "@/lib/intervals";
import { segmentEngine } from "@/lib/segment-app";
import { sourceKind } from "@/lib/source";
import { cn } from "@/lib/utils";
import { byMain } from "@/lib/sport";

/** intervals.icu takes a few seconds to read an uploaded file: the list is asked again once it has. */
const READ_DELAY = 8000;

/**
 * Drop or pick activity files; each becomes an activity in the account. Cirmolo's own accounts read .fit files on the
 * device; intervals.icu accounts send .fit, .gpx or .tcx (OpenTracks saves .gpx) to intervals.icu, which reads them.
 */
export function UploadRides({ onDone }: { onDone?: () => void }) {
  const qc = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<[number, number] | null>(null);
  const [over, setOver] = useState(false);
  const native = sourceKind() === "native";

  async function upload(list: FileList | null) {
    if (!native) return toIntervals(list);
    const files = [...(list ?? [])].filter((f) => /\.fit$/i.test(f.name));
    if (!files.length) {
      toast.error(t("Choose .fit files", "Scegli file .fit"));
      return;
    }
    setProgress([0, files.length]);
    const { uploadFitFiles } = await import("@/lib/native/upload");
    const r = await uploadFitFiles(files, (done, total) => setProgress([done, total]));
    setProgress(null);
    await qc.invalidateQueries();
    if (r.updated.length) void segmentEngine.rebuild(r.updated);
    else if (r.added.length) void segmentEngine.sync();
    const parts = [
      r.added.length && t(`${r.added.length} added`, `${r.added.length} aggiunte`),
      r.updated.length && t(`${r.updated.length} updated`, `${r.updated.length} aggiornate`),
      r.skipped.length &&
        t(`${r.skipped.length} already there`, `${r.skipped.length} già presenti`),
      r.failed.length && t(`${r.failed.length} unreadable`, `${r.failed.length} illeggibili`),
    ].filter(Boolean);
    (r.failed.length && !r.added.length && !r.updated.length ? toast.error : toast.success)(
      parts.join(" · "),
    );
    if (r.added.length || r.updated.length) onDone?.();
  }

  async function toIntervals(list: FileList | null) {
    const files = [...(list ?? [])].filter((f) => ACTIVITY_FILE.test(f.name));
    if (!files.length) {
      toast.error(t("Choose .gpx or .fit files", "Scegli file .gpx o .fit"));
      return;
    }
    let added = 0;
    let there = 0;
    let failed = 0;
    setProgress([0, files.length]);
    for (const [i, f] of files.entries()) {
      try {
        if ((await uploadActivityFile(f)) === "added") added++;
        else there++;
      } catch (e) {
        console.warn("Couldn't upload", f.name, e);
        failed++;
      }
      setProgress([i + 1, files.length]);
    }
    setProgress(null);
    await qc.invalidateQueries();
    if (added) setTimeout(() => void qc.invalidateQueries(), READ_DELAY);
    const parts = [
      added && t(`${added} added`, `${added} aggiunte`),
      there && t(`${there} already there`, `${there} già presenti`),
      failed && t(`${failed} not sent`, `${failed} non inviate`),
    ].filter(Boolean);
    (failed && !added ? toast.error : toast.success)(parts.join(" · "));
    if (added) onDone?.();
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        void upload(e.dataTransfer.files);
      }}
      className={cn(
        "space-y-2 rounded-lg border border-dashed border-border p-4 text-center text-sm",
        over && "border-primary bg-primary/5",
      )}
    >
      <p className="text-muted-foreground">
        {native
          ? t(
              byMain(
                "Ride files (.fit) from a Garmin, Wahoo, Zwift (Documents/Zwift/Activities)… Drop them here or",
                "Run files (.fit) from a Garmin, Coros, Suunto, Strava… Drop them here or",
              ),
              byMain(
                "File delle uscite (.fit) da Garmin, Wahoo, Zwift (Documenti/Zwift/Activities)… Trascinali qui oppure",
                "File delle corse (.fit) da Garmin, Coros, Suunto, Strava… Trascinali qui oppure",
              ),
            )
          : t(
              byMain(
                "Ride files (.gpx, .fit) from OpenTracks, a Garmin, Wahoo, Zwift… They go to intervals.icu. Drop them here or",
                "Run files (.gpx, .fit) from OpenTracks, a Garmin, Coros, Suunto… They go to intervals.icu. Drop them here or",
              ),
              byMain(
                "File delle uscite (.gpx, .fit) da OpenTracks, Garmin, Wahoo, Zwift… Vanno su intervals.icu. Trascinali qui oppure",
                "File delle corse (.gpx, .fit) da OpenTracks, Garmin, Coros, Suunto… Vanno su intervals.icu. Trascinali qui oppure",
              ),
            )}
      </p>
      <input
        ref={input}
        type="file"
        accept={native ? ".fit" : ".fit,.gpx,.tcx,.gz"}
        multiple
        className="hidden"
        onChange={(e) => {
          void upload(e.target.files);
          e.target.value = "";
        }}
      />
      <Button
        type="button"
        variant="outline"
        disabled={!!progress}
        onClick={() => input.current?.click()}
      >
        <Upload />
        {progress
          ? t(
              `Reading ${progress[0]} of ${progress[1]}…`,
              `Lettura ${progress[0]} di ${progress[1]}…`,
            )
          : t("Choose files", "Scegli file")}
      </Button>
    </div>
  );
}
