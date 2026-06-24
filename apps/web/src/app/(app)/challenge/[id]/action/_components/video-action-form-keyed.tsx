"use client";

import { useActionVisitKey } from "@/components/app-shell/action-visit-key";
import { VideoActionForm } from "./video-action-form";

// VideoActionForm 을 visitKey 로 keying 해, /action 재진입(cacheComponents 가 subtree 를 보존해도)마다
// fresh remount 시킨다 — 녹화한 클립·카메라 스트림 잔존 방지(ActionFormKeyed 와 동일 패턴).
export function VideoActionFormKeyed({
  challengeId,
  verifiedToday,
}: {
  challengeId: string;
  verifiedToday?: boolean;
}) {
  const visitKey = useActionVisitKey();
  return <VideoActionForm key={visitKey} challengeId={challengeId} verifiedToday={verifiedToday} />;
}
