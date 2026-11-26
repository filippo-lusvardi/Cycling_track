// A page's layout: saved on this device at once, and with the account a moment later, so it follows you.
import { useMemo } from "react";
import { useLocalStore } from "@/hooks/use-local-store";
import { resolveLayout, type Layout, type LayoutKind, type SectionDef } from "@/lib/layouts";
import { LAYOUTS, readSetting } from "@/lib/settings";

type All = Partial<Record<LayoutKind, Layout>>;

let timer: ReturnType<typeof setTimeout> | undefined;
/** As text, because the profile is saved by merging, which would bring a removed choice back. */
function pushLater(all: All) {
  clearTimeout(timer);
  timer = setTimeout(() => {
    void import("@/lib/cloud")
      .then(({ saveProfile }) => saveProfile({ layouts: JSON.stringify(all) }))
      .catch((e) => console.warn("Layout not saved", e));
  }, 1000);
}

/**
 * With `startFrom`, a page not arranged yet looks like that one (a gravel ride like the rides before kinds had their own
 * pages), and the first change makes it its own.
 */
export function useLayout(kind: LayoutKind, defs: SectionDef[], startFrom?: LayoutKind) {
  const [all, setAll] = useLocalStore<All>(LAYOUTS, readSetting<All>(LAYOUTS) ?? {});
  const saved = all[kind] ?? (startFrom ? all[startFrom] : undefined);
  const sections = useMemo(() => resolveLayout(saved, defs), [saved, defs]);
  const change = (next: Layout | undefined) => {
    setAll((prev) => {
      const out = { ...prev };
      if (next) out[kind] = next;
      // Back to the defaults, not to what it started from.
      else if (startFrom && startFrom !== kind) out[kind] = {};
      else delete out[kind];
      pushLater(out);
      return out;
    });
  };
  return { layout: saved ?? {}, sections, change };
}

export type UseLayout = ReturnType<typeof useLayout>;
