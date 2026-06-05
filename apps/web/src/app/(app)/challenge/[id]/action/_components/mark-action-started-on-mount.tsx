"use client";

import { useEffect, useRef } from "react";
import { markActionStarted } from "../../_actions";

// PRD §6.2 — action 페이지 진입 시 그룹원에게 시작 알림 자동 발화.
// 과거 page.tsx 에서 `void markActionStarted(...)` 로 호출했으나, RSC
// prefetch · HMR · RSC payload 재요청마다 server action 이 실행되며 그때마다
// `withUser` 가 raw `supabase.auth.getUser()` 를 부르는 바람에 GoTrue
// `over_request_rate_limit` (429) 의 메인 기여자가 되었다.
// → mount 시 1회만 발화하도록 클라이언트로 이동. server 측 idempotency
// (events 테이블 `action_started` + 오늘 KST) 가 새로고침/뒤로가기에서도
// 중복 알림을 막아주므로 의미는 동일.
export function MarkActionStartedOnMount({ challengeId }: { challengeId: string }) {
  const firedRef = useRef(false);
  useEffect(() => {
    if (firedRef.current) return;
    firedRef.current = true;
    void markActionStarted({ challengeId });
  }, [challengeId]);
  return null;
}
