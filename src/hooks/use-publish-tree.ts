import { useEffect } from "react";
import type { TreeInput } from "@/lib/forest/publish";

/**
 * Keep my forests' copy of my tree current from whichever page has the data (the Tree). The publisher needs
 * Firestore, so it's imported once the page is up, never before; it throttles itself.
 */
export function usePublishTree({ acts, wellness, offEvents, crown, today }: TreeInput) {
  useEffect(() => {
    void import("@/lib/forest/publish")
      .then(({ publishTree }) => publishTree({ acts, wellness, offEvents, crown, today }))
      .catch((e) => console.warn("Forest publish unavailable", e));
  }, [acts, wellness, offEvents, crown, today]);
}
