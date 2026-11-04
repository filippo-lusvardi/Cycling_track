import { useQueryClient } from "@tanstack/react-query";
import { Upload } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { t } from "@/lib/i18n";
import { segmentEngine } from "@/lib/segment-app";
import { cn } from "@/lib/utils";

/** Drop or pick .fit files (Garmin, Wahoo, Zwift…); each becomes a ride in the account. */
export function UploadRides({ onDone }: { onDone?: () => void }) {
  const qc = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<[number, number] | null>(null);
  const [over, setOver] = useState(false);

  async function upload(list: FileList | null) {
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
        {t(
          "Ride files (.fit) from a Garmin, Wahoo, Zwift (Documents/Zwift/Activities)… Drop them here or",
          "File delle uscite (.fit) da Garmin, Wahoo, Zwift (Documenti/Zwift/Activities)… Trascinali qui oppure",
        )}
      </p>
      <input
        ref={input}
        type="file"
        accept=".fit"
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
