import { useEffect, useMemo } from "react";
import { useLocalStore } from "@/hooks/use-local-store";
import { sessionReady } from "@/lib/account";
import { cropMap, growNewSports, type CropMap } from "@/lib/garden";
import type { Activity } from "@/lib/intervals";
import { GARDEN_CROPS, readSetting } from "@/lib/settings";
import { mainSport } from "@/lib/sport";

/**
 * The sports in the garden and what grows for each (Settings → Garden), and a way to change them. Given `acts`, a new
 * sport among them gets its bed.
 */
export function useCropMap(acts?: Activity[]) {
  const [chosen, setChosen] = useLocalStore<CropMap>(
    GARDEN_CROPS,
    readSetting<CropMap>(GARDEN_CROPS) ?? {},
  );
  const map = useMemo(() => cropMap(chosen), [chosen]);
  const change = (next: CropMap) => {
    setChosen(() => next);
    // As text: the profile is saved by merging, which would bring a removed sport back from a stored map.
    void import("@/lib/cloud")
      .then(({ saveProfile }) => saveProfile({ gardenCrops: JSON.stringify(next) }))
      .catch((e) => console.warn("Garden not saved", e));
  };
  useEffect(() => {
    if (!acts) return;
    let gone = false;
    // After the account's garden has arrived, so a device that's behind doesn't pick other vegetables over it.
    void sessionReady().then(() => {
      if (gone) return;
      const now = cropMap(readSetting<CropMap>(GARDEN_CROPS));
      const next = growNewSports(now, acts, mainSport());
      if (next !== now) change(next);
    });
    return () => {
      gone = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [acts]);
  return [map, change] as const;
}
