import { NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { dispatchDeadlineNotification } from "@/lib/push/dispatch";

export const runtime = "nodejs";

const DEADLINE_WINDOW_START_HOURS = 23;
const DEADLINE_WINDOW_END_HOURS = 25;

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

  return NextResponse.json({ ok: true, scanned: ids.length, dispatched });
}

// Vercel Cron 은 GET 요청으로도 호출한다. 동일 핸들러에 위임한다.
export async function GET(req: Request): Promise<Response> {
  return POST(req);
}
