// RN BFF — 챌린지 피드 단일 read endpoint (ADR-0036 §1 · ADR-0037 · EVAL-0016).
// `GET /api/feed?challengeId=` + `Authorization: Bearer <Supabase access token>`
// → FeedItemView[] (zod 계약: @withkey/domain feedResponseSchema).
//
// 가드레일: Route Handler 는 외부 콜백 + RN BFF(Bearer) 전용 — PWA(web) 클라이언트는
// 이 endpoint 를 호출하지 않는다(web 은 RSC + fetchChallengeFeed 유지).
// Layer 1 visibility 는 Bearer token 기반 RLS user client 로 실행된다(admin 대체 금지).
import { NextResponse } from "next/server";
import { challengeSchema } from "@withkey/domain";
import { fetchChallengeFeedForViewerClient } from "@/lib/db/reads/challenge-feed";
import { bearerTokenFrom, createBearerClient } from "@/lib/supabase/bearer";

// challengeId 형식은 zod SoT(challengeSchema.shape.id, uuid) 재사용 — mobile 라우트
// param 검증(challenge/[id]/_layout)과 동일 기준.
const challengeIdSchema = challengeSchema.shape.id;

export async function GET(request: Request) {
  const token = bearerTokenFrom(request);
  if (!token) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createBearerClient(token);
  // getUser(token) — 세션 없는 client 라 명시 token 으로 auth 서버 검증.
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token);
  if (error || !user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const parsed = challengeIdSchema.safeParse(new URL(request.url).searchParams.get("challengeId"));
  if (!parsed.success) {
    return NextResponse.json({ error: "challengeId must be a uuid" }, { status: 400 });
  }
  const challengeId = parsed.data;

  try {
    const items = await fetchChallengeFeedForViewerClient(supabase, challengeId, user.id);
    return NextResponse.json(items);
  } catch (cause) {
    // 본문/토큰은 로그 금지 — 컨텍스트 식별자만.
    console.error("[api/feed] failed", { challengeId, cause });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
