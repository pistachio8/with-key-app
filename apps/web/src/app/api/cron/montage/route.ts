import { NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { triggerMontage } from "@/lib/media/montage/trigger";
import { MONTAGE_BUCKET } from "@/lib/media/montage/types";

// 합본 몽타주 fast-follow 트리거 cron(spec §C6-B / EVAL-0046 · ADR-0040).
// deadline-push 와 동일 패턴 — Vercel Cron 이 Authorization: Bearer $CRON_SECRET 로 호출.
// 종료(closed) 또는 만기(active+end_at<=now)된 영상 챌린지를 스캔해, 결과 mp4 가 아직 없으면
// 외부 Oracle A1 워커에 인코딩을 트리거한다. 인코딩 런타임은 repo 밖(VPS).
//
// 멱등: triggerMontage 가 결과 mp4 존재 시 skip. 일 1회 cron + 워커 자체 존재 검사로 in-flight
// 중복 트리거를 흡수한다(montage_jobs 테이블 미도입 — POC 볼륨에서 과한 상태관리).

const MONTAGE_LOOKBACK_DAYS = 3;

function isAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

// 멱등 키 — challenge-montages 에 결과 mp4 가 이미 있는가. createSignedUrl 은 객체 부재 시 error.
async function montageExists(path: string): Promise<boolean> {
  const admin = adminClient();
  const { data, error } = await admin.storage.from(MONTAGE_BUCKET).createSignedUrl(path, 60);
  return !error && !!data?.signedUrl;
}

// 인코딩 대상 클립 경로(action-videos, 시간순). peer_rejected 클립은 스토리와 동일하게 제외.
async function listClipPaths(challengeId: string): Promise<string[]> {
  const admin = adminClient();
  const { data, error } = await admin
    .from("action_logs")
    .select("video_path, created_at")
    .eq("challenge_id", challengeId)
    .eq("media_type", "video")
    .not("video_path", "is", null)
    .neq("auto_verify_status", "peer_rejected")
    .order("created_at", { ascending: true });
  // 쿼리 에러를 조용히 삼키면 빈 배열 → no_clips skip 으로 인코딩이 영구 누락된다. 로깅 후 빈 배열
  // 반환(throw 하면 cron 루프 전체 중단) — 다음 cron 실행이 재시도(멱등). 침묵 실패 금지.
  if (error) {
    console.error("[cron/montage] listClipPaths 쿼리 실패", { challengeId, error });
    return [];
  }
  return (data ?? []).map((r) => r.video_path as string).filter(Boolean);
}

export async function POST(req: Request): Promise<Response> {
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const workerUrl = process.env.MONTAGE_WORKER_URL;
  const workerSecret = process.env.MONTAGE_WORKER_SECRET;

  const admin = adminClient();
  const now = Date.now();
  // 최근 종료 창만 스캔 — 매 실행 전체 영상 챌린지를 재probe 하지 않게 bound(deadline-push window 패턴).
  const lookback = new Date(now - MONTAGE_LOOKBACK_DAYS * 86_400_000).toISOString();
  const nowIso = new Date(now).toISOString();

  // recap 진입 대상과 동일 판정 — closed 또는 active+만기. 영상 챌린지만(feed_type='video').
  const { data: challenges, error } = await admin
    .from("challenges")
    .select("id")
    .eq("feed_type", "video")
    .gte("end_at", lookback)
    .or(`status.eq.closed,and(status.eq.active,end_at.lte.${nowIso})`);

  if (error) {
    return NextResponse.json({ ok: false, error: "query_failed" }, { status: 500 });
  }

  let triggered = 0;
  let skipped = 0;
  let failed = 0;
  for (const c of challenges ?? []) {
    const result = await triggerMontage(c.id as string, {
      workerUrl,
      workerSecret,
      montageExists,
      listClipPaths,
    });
    if (!result.ok) failed += 1;
    else if (result.status === "triggered") triggered += 1;
    else skipped += 1;
  }

  return NextResponse.json({
    ok: true,
    scanned: (challenges ?? []).length,
    triggered,
    skipped,
    failed,
  });
}

// Vercel Cron 은 GET 으로도 호출한다(deadline-push 와 동일). 동일 핸들러에 위임.
export async function GET(req: Request): Promise<Response> {
  return POST(req);
}
