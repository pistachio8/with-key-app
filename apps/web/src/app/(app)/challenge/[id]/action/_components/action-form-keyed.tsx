"use client";

import { useActionVisitKey } from "@/components/app-shell/action-visit-key";
import { ActionForm } from "./action-form";

// ActionForm 을 visitKey 로 keying 해, /action 재진입(cacheComponents 가 subtree 를
// 보존해도)마다 fresh remount 시킨다 — 작성 중 사진/메모 잔존 방지(spec Phase 2).
// key 변경 시 ActionForm 만 unmount/remount(blob revoke cleanup 재실행 + draft 재hydrate),
// 형제 MarkActionStartedOnMount 는 영향 없음 → markActionStarted 재발화·429 없음(H1).
export function ActionFormKeyed({
  challengeId,
  verifiedToday,
}: {
  challengeId: string;
  verifiedToday?: boolean;
}) {
  const visitKey = useActionVisitKey();
  return <ActionForm key={visitKey} challengeId={challengeId} verifiedToday={verifiedToday} />;
}
