import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ForestClimbs } from "@/components/forest/ForestClimbs";
import { ForestMembers } from "@/components/forest/ForestMembers";
import { Back, ForestLayout, TABS, type Tab } from "@/components/forest/ForestLayout";
import { OpenScene, type SceneTree } from "@/components/forest/ForestScene";
import { ForestGrove } from "@/components/forest/ForestGrove";
import {
  watchForest,
  watchMembers,
  watchRequests,
  type Forest,
  type JoinRequest,
  type Member,
} from "@/lib/forest/forests";
import { watchHeaders } from "@/lib/forest/trees";
import type { TreeHeader } from "@/lib/forest/types";
import { t } from "@/lib/i18n";

export const Route = createFileRoute("/forest/$fid/")({
  head: () => ({ meta: [{ title: t("Forest — Cirmolo", "Bosco — Cirmolo") }] }),
  validateSearch: (s: Record<string, unknown>): { tab?: Tab } =>
    TABS.includes(s["tab"] as Tab) ? { tab: s["tab"] as Tab } : {},
  component: ForestDetail,
});

function ForestDetail() {
  const { fid } = Route.useParams();
  const { tab = "trees" } = Route.useSearch();
  const navigate = useNavigate();
  const [forest, setForest] = useState<Forest | null | undefined>(undefined);
  const [members, setMembers] = useState<Member[]>([]);
  const [headers, setHeaders] = useState<Record<string, TreeHeader>>({});
  const [requests, setRequests] = useState<JoinRequest[]>([]);
  useEffect(() => watchForest(fid, setForest), [fid]);
  useEffect(() => watchMembers(fid, setMembers), [fid]);
  useEffect(() => watchHeaders(fid, setHeaders), [fid]);
  useEffect(() => watchRequests(fid, setRequests), [fid]);

  if (forest === undefined) return null;
  if (forest === null)
    return (
      <div className="space-y-4">
        <Back />
        <p className="text-sm text-muted-foreground">
          {t(
            "This forest doesn't exist, or you're not one of its members.",
            "Questo bosco non esiste, oppure non ne fai parte.",
          )}
        </p>
      </div>
    );

  const trees: SceneTree[] = forest.members.map((uid) => ({
    uid,
    name: members.find((m) => m.uid === uid)?.name ?? "…",
    header: headers[uid],
  }));
  const openTree = (uid: string) => navigate({ to: "/forest/$fid/$uid", params: { fid, uid } });

  return (
    <ForestLayout
      forest={forest}
      tab={tab}
      waiting={requests.length}
      onTab={(next) => navigate({ to: "/forest/$fid", params: { fid }, search: { tab: next } })}
    >
      {tab === "trees" && (
        <OpenScene>
          {(w, fit) => (
            <ForestGrove seed={forest.id} trees={trees} onTree={openTree} w={w} fit={fit} />
          )}
        </OpenScene>
      )}
      {tab === "climbs" && <ForestClimbs forest={forest} members={members} />}
      {tab === "members" && <ForestMembers forest={forest} members={members} requests={requests} />}
    </ForestLayout>
  );
}
