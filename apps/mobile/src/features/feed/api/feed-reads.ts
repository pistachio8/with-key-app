// 피드 read service — BFF `GET /api/feed` 단일 endpoint (ADR-0036 §1 · ADR-0037).
// admin hydrate read 4종(action-log-hydrate · photo-signed-url · kudos-counts · kudos-viewer)은
// mobile 에서 직접 호출 금지 — Layer 1(RLS visibility) 을 내장한 서버 합성만 소비한다.
import { feedResponseSchema, type FeedItemView } from "@withkey/domain";

import { bffGetJson } from "@/services/api/bff-client";

/** 챌린지 피드. 응답은 feedResponseSchema(zod 계약)로 검증 — 계약 위반은 즉시 throw. */
export async function fetchChallengeFeed(challengeId: string): Promise<FeedItemView[]> {
  const json = await bffGetJson(`/api/feed?challengeId=${encodeURIComponent(challengeId)}`);
  return feedResponseSchema.parse(json);
}
