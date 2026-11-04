// Ride files dropped into Cirmolo: parsed on the device and stored in the account.
import { FIT_PARSER, parseFit } from "./fit";
import { emptyRide, saveRide, storedRide } from "./index";

export type UploadResult = {
  added: string[];
  updated: string[];
  skipped: string[];
  failed: string[];
};

/**
 * Store each .fit file as a ride. A file already stored (same start time) is skipped, unless an older version of the
 * parser read it: then its numbers are redone from the file, keeping what the athlete added (notes, brioches, feel).
 */
export async function uploadFitFiles(
  files: File[],
  onProgress?: (done: number, total: number) => void,
): Promise<UploadResult> {
  const out: UploadResult = { added: [], updated: [], skipped: [], failed: [] };
  for (const [i, f] of files.entries()) {
    try {
      const r = parseFit(await f.arrayBuffer(), f.name);
      const old = await storedRide(r.id);
      if (old?.parser === FIT_PARSER) out.skipped.push(f.name);
      else {
        await saveRide(
          {
            ...emptyRide(r.id, r.name, r.type, r.start_date_local),
            trainer: r.trainer,
            garmin: r.garmin,
            calories: r.calories,
            icu_intervals: r.intervals,
            totals: r.totals,
            parser: FIT_PARSER,
            description: old?.description ?? null,
            feel: old?.feel ?? null,
          },
          r.streams,
        );
        (old ? out.updated : out.added).push(r.id);
      }
    } catch (e) {
      console.warn("Couldn't read", f.name, e);
      out.failed.push(f.name);
    }
    onProgress?.(i + 1, files.length);
  }
  return out;
}
