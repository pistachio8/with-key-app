// /challenge/[id] — feed tab placeholder. id 검증은 상위 _layout 에서 완료.
// feed/dashboard/info 상단탭 구성과 실데이터 read 는 EVAL-0017.
import { useLocalSearchParams } from "expo-router";

import { PlaceholderScreen } from "@/shared/components/placeholder-screen";

export default function ChallengeFeedScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <PlaceholderScreen title="챌린지 피드" lines={[`challengeId: ${id}`, "read — EVAL-0017"]} />
  );
}
