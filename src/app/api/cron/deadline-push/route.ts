import { NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { dispatchDeadlineNotification } from "@/lib/push/dispatch";

// Vercel hobby plan 은 cron 을 하루 1 회까지만 허용해 `vercel.json` 의 스케줄이
// `0 0 * * *` (UTC 자정 = KST 09 시) 로 잡혀 있다. "마감 24 시간 전" 의도를
// ±12 시간 허용 창으로 넓혀 24 시간 주기에서도 누락이 생기지 않게 한다.
// 중복 dispatch 는 events 조회(name='notification_sent', props.type='deadline',
// props.challengeId) 가 이미 막는다. pro 로 올라가면 주기와 창을 같이 좁힌다.
const DEADLINE_WINDOW_START_HOURS = 12;
const DEADLINE_WINDOW_END_HOURS = 36;

function isAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = req.headers.get("authorization");
  return auth === `Bearer ${secret}`;
}

async function alreadyDispatched(challengeId: string): Promise<boolean> {
  const admin = adminClient();
  const { data } = await admin
    .from("events")
    .select("id")
    .eq("name", "notification_sent")
    .contains("props", { type: "deadline", challengeId })
    .limit(1);
  return (data ?? []).length > 0;
}

export async function POST(req: Request): Promise<Response> {
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const admin = adminClient();
  const now = Date.now();
  const windowStart = new Date(now + DEADLINE_WINDOW_START_HOURS * 3_600_000).toISOString();
  const windowEnd = new Date(now + DEADLINE_WINDOW_END_HOURS * 3_600_000).toISOString();

  const { data: challenges, error } = await admin
    .from("challenges")
    .select("id")
    .eq("status", "active")
    .gte("end_at", windowStart)
    .lte("end_at", windowEnd);

  if (error) {
    return NextResponse.json({ ok: false, error: "query_failed" }, { status: 500 });
  }

  const ids = (challenges ?? []).map((c) => c.id as string);
  let dispatched = 0;
  for (const id of ids) {
    if (await alreadyDispatched(id)) continue;
    await dispatchDeadlineNotification(id);
    dispatched += 1;
  }

  // ADR-0027 — 만기 도달(active + end_at <= now) 챌린지를 closed 로 전이(auto-close).
  // 마감 push 스캔(미래 end_at)과 대상 창이 달라 충돌 없음. adminClient 가 RLS 를 우회한다.
  // 표시는 challengePhase 가 이미 정확하지만, 이 전이가 0029 슬롯을 풀고 status 를 truthful 하게 만든다.
  let closed = 0;
  // ADR-0030 — 자연 종료(만기)도 closed_at 기록. closed_at >= end_at 이라 cutoff=duration 으로 수렴.
  const { data: closedRows, error: closeErr } = await admin
    .from("challenges")
    .update({ status: "closed", closed_at: new Date(now).toISOString() })
    .eq("status", "active")
    .lte("end_at", new Date(now).toISOString())
    .select("id");
  if (closeErr) {
    // deadline-push 는 성공했으므로 cron 전체를 실패 처리하지 않는다. idempotent 라 다음 실행이 재시도.
    console.error("[deadline-push] auto-close failed", closeErr);
  } else {
    closed = (closedRows ?? []).length;
  }

  return NextResponse.json({ ok: true, scanned: ids.length, dispatched, closed });
}

// Vercel Cron 은 GET 요청으로도 호출한다. 동일 핸들러에 위임한다.
export async function GET(req: Request): Promise<Response> {
  return POST(req);
}
