import { useMemo } from "react";
import { useLocalStore } from "@/hooks/use-local-store";
import { cropMap, type CropMap } from "@/lib/garden";
import { GARDEN_CROPS } from "@/lib/settings";

/** Which vegetable grows for which sport (Settings → Garden), and a way to change it. */
export function useCropMap() {
  const [chosen, setChosen] = useLocalStore<Partial<CropMap>>(GARDEN_CROPS, {});
  const map = useMemo(() => cropMap(chosen), [chosen]);
  return [map, (next: CropMap) => setChosen(() => next)] as const;
}
