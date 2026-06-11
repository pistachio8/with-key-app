// challenge stack — challengeId 는 route 경계에서 uuid 검증한다 (zod SoT 재사용,
// challengeSchema.shape.id). 잘못된 id 로 deep link 진입 시 /home 으로 회수.
import { challengeSchema } from "@withkey/domain";
import { Redirect, Stack, useLocalSearchParams } from "expo-router";

const challengeIdSchema = challengeSchema.shape.id;

export default function ChallengeLayout() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  // 중복 쿼리/세그먼트 파라미터는 string[] 로 도착할 수 있다 — 첫 값만 사용
  const rawId = Array.isArray(params.id) ? params.id[0] : params.id;
  const parsed = challengeIdSchema.safeParse(rawId);

  if (!parsed.success) {
    return <Redirect href="/home" />;
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}
