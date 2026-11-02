// Ride files dropped into Cirmolo: parsed on the device and stored in the account.
import { parseFit } from "./fit";
import { emptyRide, rideExists, saveRide } from "./index";

export type UploadResult = { added: string[]; skipped: string[]; failed: string[] };

/** Store each .fit file as a ride; files already stored (same start time) are skipped. */
export async function uploadFitFiles(
  files: File[],
  onProgress?: (done: number, total: number) => void,
): Promise<UploadResult> {
  const out: UploadResult = { added: [], skipped: [], failed: [] };
  for (const [i, f] of files.entries()) {
    try {
      const r = parseFit(await f.arrayBuffer());
      if (await rideExists(r.id)) out.skipped.push(f.name);
      else {
        await saveRide(
          {
            ...emptyRide(r.id, r.name, r.type, r.start_date_local),
            trainer: r.trainer,
            garmin: r.garmin,
            icu_intervals: r.intervals,
          },
          r.streams,
        );
        out.added.push(r.id);
      }
    } catch (e) {
      console.warn("Couldn't read", f.name, e);
      out.failed.push(f.name);
    }
    onProgress?.(i + 1, files.length);
  }
  return out;
}
