"use client";

import { useFeedbackVisitKey } from "@/components/app-shell/feedback-visit-key";
import { FeedbackForm } from "./feedback-form";

// FeedbackForm 을 visitKey 로 keying 해, /me/feedback 재진입(cacheComponents 가 subtree 를
// 보존해도)마다 fresh remount 시킨다 — 제출 완료(done) 화면 잔존 방지(EVAL-0048).
// key 변경 시 FeedbackForm 만 unmount/remount(blob revoke cleanup 재실행 + 로컬 state 초기화).
export function FeedbackFormKeyed() {
  const visitKey = useFeedbackVisitKey();
  return <FeedbackForm key={visitKey} />;
}
