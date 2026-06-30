// 인증 세션이 생기면 그 user 에 대해 1회 push token 등록을 시도하는 훅 (task: _layout 에서 호출).
// upsert 라 멱등이지만, 같은 user 에 대한 중복 호출(권한 프롬프트 재시도)을 막으려고 ref 로 1회 가드한다.
import { useEffect, useRef } from "react";

import { registerPushToken } from "./register-token";

export function useRegisterPushToken(userId: string | undefined): void {
  const registeredFor = useRef<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    if (registeredFor.current === userId) return;
    registeredFor.current = userId;
    // 등록 실패(권한 거부 등)는 registerPushToken 내부에서 흡수 — 화면 흐름을 막지 않는다.
    void registerPushToken(userId);
  }, [userId]);
}
