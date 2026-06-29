// RN BFF — 벌칙 창2 상태 단일 read endpoint (spec 2026-06-29 §C2 · ADR-0036 §1 · feed 선례).
// `GET /api/penalty-status?challengeId=` + `Authorization: Bearer <token>` → PenaltyStatusView (JSON).
// 가드레일: Route Handler 는 RN BFF(Bearer) 전용 — PWA(web)는 호출 금지(web 은 RSC + fetchPenaltyStatus).
// Layer 1 visibility 는 Bearer token RLS user client 로 실행(admin 대체 금지) — fetchPenaltyStatusForViewerClient.
import { NextResponse } from "next/server";
import { challengeSchema } from "@withkey/domain";
import { fetchPenaltyStatusForViewerClient } from "@/lib/db/reads/penalty-status";
import { bearerTokenFrom, createBearerClient } from "@/lib/supabase/bearer";

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

  try {
    const view = await fetchPenaltyStatusForViewerClient(supabase, parsed.data, user.id);
    // null(접근 불가/미존재) 또는 벌칙 미션 없는 챌린지(redemption 비활성)는 404 — web page notFound() 정합.
    if (!view || !view.penaltyMission) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    return NextResponse.json(view);
  } catch (cause) {
    // 본문/토큰 미로그 — 식별자만.
    console.error("[api/penalty-status] failed", { challengeId: parsed.data, cause });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
