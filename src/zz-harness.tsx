import { createRoot } from "react-dom/client";
import "./styles.css";
import { Plus } from "lucide-react";
import { PageSky } from "@/components/sky/SkyPage";
import { OpenScene, phoneFit } from "@/components/forest/ForestScene";
import { ForestGrove } from "@/components/forest/ForestGrove";
import { ClimbWorld } from "@/components/forest/ClimbWorld";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const q = new URLSearchParams(location.search);
const tab = q.get("tab") ?? "trees";
const nT = Number(q.get("n") ?? 4);
const nC = Number(q.get("c") ?? 2);
const crown = (season: string, leaves: number) => ({ season, leaves, ctl: 50 }) as never;
const seasons = ["autumn", "winter", "spring", "summer"];
const trees = Array.from({ length: nT }, (_, i) => ({
  uid: `u${i}`,
  name: ["Lupo Lucio", "PiselloneAlberto", "strega varana", "Tonio Cartonio"][i % 4]!,
  header: { crown: crown(seasons[i % 4]!, seasons[i % 4] === "winter" ? 0 : 50) } as never,
}));
const mk = (i: number, gain: number) => ({
  climb: {
    sid: `s${i}`, name: i % 2 ? "Salita di Vela" : "Rovereto → Pozzacchio", length: 11100, grade: 5.4, gain,
    trace: { dist: [0, 1, 2, 3, 4, 5, 6], alt: [200, 260, 380, 420, 600, 700, 803] },
  } as never,
  leader: { uid: "u", name: "Lupo Lucio", duration: 2407 } as never,
});
const climbs = Array.from({ length: nC }, (_, i) => mk(i, i % 2 ? 300 : 800));

function App() {
  return (
    <>
      <PageSky />
      <header className="on-sky relative z-10 lg:hidden"><div className="flex h-12 items-center px-4">Cirmolo</div></header>
      <main className="relative z-10 mx-auto max-w-5xl overflow-x-clip px-4 sm:overflow-x-visible pb-32 pt-2 lg:pb-12 lg:pt-6">
        <div className="space-y-5">
          <div className="on-sky"><h1 className="text-3xl font-bold">FantaBosco</h1></div>
          <div className="glass flex gap-1 rounded-lg p-1"><div className="p-1.5 text-sm">tabs ({tab})</div></div>
          {tab === "trees" ? (
            <div className="max-sm:-mb-32">
              <OpenScene>
                {(w, fit) => <ForestGrove seed="abc" trees={trees} onTree={() => {}} me="u0" w={w} {...phoneFit(w, fit)} />}
              </OpenScene>
            </div>
          ) : (
            <div className={cn("relative space-y-4", "max-sm:-mb-32")}>
              <OpenScene>
                {(w, fit) => <ClimbWorld w={w} {...(w > 360 ? { fit: fit - 43 } : phoneFit(w, fit, 64))} climbs={climbs} onOpen={() => {}} />}
              </OpenScene>
              <div className="max-sm:absolute max-sm:inset-x-0 max-sm:bottom-[calc(4.875rem+env(safe-area-inset-bottom))]">
                <Button variant="outline"><Plus /> Add one of my climbs</Button>
              </div>
            </div>
          )}
        </div>
      </main>
      <nav className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-5 border-t border-border bg-card lg:hidden">
        {["Home", "Segments", "Calendar", "Analysis", "More"].map((l) => (
          <div key={l} className="flex flex-col items-center gap-1 py-3 text-xs text-muted-foreground"><span className="h-5 w-5" />{l}</div>
        ))}
      </nav>
    </>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
