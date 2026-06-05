import { NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";

// ADR-0017 — kudos_push_log 90일 TTL cleanup. 매주 일요일 04:00 UTC (= KST 13:00).
// row 누적 부담은 미미하지만 운영 데이터 부재 상태 default. 추후 보고 후 조정.
// 가드는 deadline-push 와 동일한 CRON_SECRET Bearer 인증.
const TTL_DAYS = 90;

function isAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = req.headers.get("authorization");
  return auth === `Bearer ${secret}`;
}

export async function POST(req: Request): Promise<Response> {
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const admin = adminClient();
  const cutoff = new Date(Date.now() - TTL_DAYS * 24 * 3_600_000).toISOString();

  const { error, count } = await admin
    .from("kudos_push_log")
    .delete({ count: "exact" })
    .lt("sent_at", cutoff);

  if (error) {
    return NextResponse.json({ ok: false, error: "delete_failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, ttlDays: TTL_DAYS, deleted: count ?? 0 });
}

// Vercel Cron 은 GET 요청으로도 호출. 동일 핸들러에 위임.
export async function GET(req: Request): Promise<Response> {
  return POST(req);
}
