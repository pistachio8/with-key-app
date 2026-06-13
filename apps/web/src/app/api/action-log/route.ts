// RN BFF — 사진 인증 쓰기 단일 endpoint (D-7 spec C2 · ADR-0036 §1).
// `POST /api/action-log` + `Authorization: Bearer <Supabase access token>` + multipart/form-data
// → ActionResult<SubmitResult> 봉투 passthrough + 파생 HTTP status.
//
// 가드레일: Route Handler 는 외부 콜백 + RN BFF(Bearer) 전용 — PWA(web) 클라이언트는 이 endpoint 를
// 호출하지 않는다(web 은 RSC + submitActionLog Server Action 유지, ADR-0036 §5).
// web action 과 같은 submitActionLogCore 를 호출해 web↔RN 패리티를 by construction 으로 보장한다.
import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import type { ErrorCode } from "@/lib/actions/response";
import { bearerTokenFrom, createBearerClient } from "@/lib/supabase/bearer";
import { submitActionLogCore } from "@/lib/action-log/submit-core";

// ErrorCode → HTTP status. 봉투는 body 에 그대로 실리고 status code 도 정상 세팅돼
// 모니터링·미들웨어가 올바른 코드를 본다.
function statusFor(error: ErrorCode): number {
  switch (error) {
    case "unauthorized":
      return 401;
    case "forbidden":
      return 403;
    case "invalid_input":
      return 422;
    case "not_found":
      return 404;
    case "conflict":
      return 409;
    case "rate_limited":
      return 429;
    case "upstream_error":
      return 502;
  }
}

export async function POST(request: Request) {
  const token = bearerTokenFrom(request);
  if (!token) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const supabase = createBearerClient(token);
  // getUser(token) — 세션 없는 client 라 명시 token 으로 auth 서버 검증.
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token);
  if (error || !user) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const result = await submitActionLogCore(supabase, user, await request.formData());

  // updateTag 는 Route Handler 금지(Server Action 전용) → 동일 무효화를 revalidateTag 로.
  // Next 16 revalidateTag 는 (tag, profile) 2-인자 — "max" 는 stale-while-revalidate(next-visit
  // 재검증) 권장값. RN 제출자는 같은 요청에서 PWA home-feed 를 읽지 않으므로 RYOW 불필요(spec §C2).
  // 실패 응답에는 새 row 가 없으므로 무효화하지 않는다(web wrapper 와 동일 동작).
  if (result.ok) {
    revalidateTag(`user-${user.id}-home-feed`, "max");
  }

  return NextResponse.json(result, { status: result.ok ? 200 : statusFor(result.error) });
}
