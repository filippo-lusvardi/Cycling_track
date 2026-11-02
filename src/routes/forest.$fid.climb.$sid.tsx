import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ForestClimbView } from "@/components/forest/ForestClimbView";
import { watchForest, watchMembers, type Forest, type Member } from "@/lib/forest/forests";
import {
  removeClimb,
  watchClimb,
  watchTimes,
  type ForestClimb,
  type ForestTime,
} from "@/lib/forest/leaderboard";
import { t } from "@/lib/i18n";

export const Route = createFileRoute("/forest/$fid/climb/$sid")({
  head: () => ({ meta: [{ title: t("Forest climb — Cirmolo", "Salita del bosco — Cirmolo") }] }),
  component: ForestClimbPage,
});

/** A forest climb's page: like one's own climb page, with the forest's leaderboard instead of one's efforts. */
function ForestClimbPage() {
  const { fid, sid } = Route.useParams();
  const navigate = useNavigate();
  const [forest, setForest] = useState<Forest | null>(null);
  const [climb, setClimb] = useState<ForestClimb | null | undefined>(undefined);
  const [members, setMembers] = useState<Member[]>([]);
  const [times, setTimes] = useState<ForestTime[]>([]);
  useEffect(() => watchForest(fid, setForest), [fid]);
  useEffect(() => watchClimb(fid, sid, setClimb), [fid, sid]);
  useEffect(() => watchMembers(fid, setMembers), [fid]);
  useEffect(() => watchTimes(fid, sid, setTimes), [fid, sid]);
  return (
    <ForestClimbView
      fid={fid}
      sid={sid}
      forest={forest}
      climb={climb}
      members={members}
      times={times}
      onRemove={async () => {
        await removeClimb(fid, sid);
        navigate({ to: "/forest/$fid", params: { fid }, search: { tab: "climbs" } });
      }}
    />
  );
}
