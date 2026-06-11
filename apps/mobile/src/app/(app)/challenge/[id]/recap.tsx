// /challenge/[id]/recap — 종료 정산/갤러리 placeholder. read 는 EVAL-0017,
// 공유 이미지/영상 endpoint 연동은 서버 유지 (00 §1.1).
import { useLocalSearchParams } from "expo-router";

import { PlaceholderScreen } from "@/shared/components/placeholder-screen";

export default function ChallengeRecapScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <PlaceholderScreen title="리캡" lines={[`challengeId: ${id}`, "정산/갤러리 — EVAL-0017"]} />
  );
}
