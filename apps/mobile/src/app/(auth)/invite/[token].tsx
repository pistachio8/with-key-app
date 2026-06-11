// /invite/[token] — 초대 deep link 착지점 (00 §10 · 04 §3 (auth) group).
// 미인증도 진입 가능한 public preview. token 은 route 경계에서 zod 검증 (inviteTokenSchema).
// 초대 preview read 는 EVAL-0016, stash → 로그인 후 accept orchestration 은 EVAL-0013.
import { inviteTokenSchema } from "@withkey/domain";
import { useLocalSearchParams } from "expo-router";

import { PlaceholderScreen } from "@/shared/components/placeholder-screen";

export default function InviteScreen() {
  const params = useLocalSearchParams<{ token?: string | string[] }>();
  // 중복 쿼리/세그먼트 파라미터는 string[] 로 도착할 수 있다 — 첫 값만 사용
  const rawToken = Array.isArray(params.token) ? params.token[0] : params.token;
  const parsed = inviteTokenSchema.safeParse(rawToken);

  if (!parsed.success) {
    return <PlaceholderScreen title="유효하지 않은 초대" lines={["링크를 다시 확인해 주세요."]} />;
  }

  return (
    <PlaceholderScreen
      title="초대장"
      lines={[`token: ${parsed.data}`, "preview read — EVAL-0016 · accept — EVAL-0013"]}
    />
  );
}
