// /challenge/[id]/pledge — 서약서 서명 placeholder. sign mutation 은 EVAL-0018.
import { useLocalSearchParams } from "expo-router";

import { PlaceholderScreen } from "@/shared/components/placeholder-screen";

export default function ChallengePledgeScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <PlaceholderScreen title="서약서" lines={[`challengeId: ${id}`, "서명 — EVAL-0018"]} />;
}
