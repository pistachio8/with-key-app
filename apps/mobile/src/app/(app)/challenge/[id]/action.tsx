// /challenge/[id]/action — 사진 인증 제출 placeholder. camera/upload/AI 는 EVAL-0019.
import { useLocalSearchParams } from "expo-router";

import { PlaceholderScreen } from "@/shared/components/placeholder-screen";

export default function ChallengeActionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <PlaceholderScreen title="인증하기" lines={[`challengeId: ${id}`, "사진 인증 — EVAL-0019"]} />
  );
}
