// Pages that live under the sky of the moment (Home, the Garden, the forests): the page itself takes the sky's top
// colour, so a scene's sky runs on behind the top bar and the page's own header with no edge, and those float over
// it as glass (see styles.css, `html.time-sky`).
import { useEffect } from "react";
import { useNow } from "@/hooks/use-now";
import { daylight, skyColors } from "@/lib/daylight";

/** Paths drawn under the time-of-day sky. The tree, a member's tree and ride pages keep their own look. */
export const SKY_PAGE = /^\/($|garden(\/|$)|forest\/?$|forest\/[^/]+\/?$|forest\/[^/]+\/climb\/)/;

/**
 * Colour the page with the sky's top on `active` pages (and nothing elsewhere), following the hour. Sets
 * `html.time-sky` and `--page-sky` (see styles.css).
 */
export function useSkyPage(active: boolean) {
  const now = useNow();
  const top = active ? skyColors(daylight(now)).top : null;
  useEffect(() => {
    const html = document.documentElement;
    if (top) {
      html.classList.add("time-sky");
      html.style.setProperty("--page-sky", top);
    } else {
      html.classList.remove("time-sky");
      html.style.removeProperty("--page-sky");
    }
  }, [top]);
}
