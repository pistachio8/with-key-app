// src/lib/media/montage/trigger.ts
import "server-only";
import { createHmac } from "node:crypto";
import { buildMontageRequest, montageOutputPath, type MontageTriggerResult } from "./types";

// 합본 몽타주 워커 트리거(spec §C6-B / EVAL-0046 · ADR-0040).
// Oracle A1 self-host ffmpeg 워커에 인코딩을 비동기 트리거한다. 인코딩 런타임은 repo 밖(VPS).
// 이 모듈은 *트리거 경로*만 담당: 멱등 검사 → HMAC 서명 → POST. 결과 mp4 push 는 워커 책임.

// HMAC-SHA256(rawBody) hex. 워커가 동일 시크릿으로 재계산해 timingSafeEqual 검증하면
// 우리 앱이 보낸 요청임이 증명된다(TLS 는 https worker URL 로 별도 보장). PWA 미관여.
export function signMontageRequest(rawBody: string, secret: string): string {
  return createHmac("sha256", secret).update(rawBody).digest("hex");
}

export type TriggerDeps = {
  workerUrl: string | undefined;
  workerSecret: string | undefined;
  // 결과 mp4 가 이미 존재하는가(멱등 키). route 는 adminClient storage 로 주입.
  montageExists: (path: string) => Promise<boolean>;
  // 인코딩 대상 클립 경로(action-videos, 시간순). route 는 adminClient action_logs 로 주입.
  listClipPaths: (challengeId: string) => Promise<string[]>;
  // 테스트 주입용. 미지정 시 전역 fetch.
  fetchImpl?: typeof fetch;
  // 워커 응답 타임아웃(ms). 미지정 시 TRIGGER_TIMEOUT_MS. 워커 행이 serverless 함수와 후속 챌린지 처리를 막지 않게.
  timeoutMs?: number;
};

// 워커 POST 타임아웃 — 외부 VPS(free tier, SLA 없음)가 응답을 지연/유지하면 Vercel 함수 전체가
// 블록되고 cron 루프의 다음 챌린지 처리가 막힌다. AbortController 로 끊는다.
const TRIGGER_TIMEOUT_MS = 10_000;

// 한 챌린지의 합본 몽타주를 트리거한다. 멱등·graceful:
//  - env 미설정 → skipped/not_configured (영상 챌린지는 recap 스토리 fallback 으로 정상 동작)
//  - 결과 mp4 이미 존재 → skipped/exists (재인코딩 안 함 — 멱등의 핵심)
//  - 클립 0개 → skipped/no_clips
//  - 그 외 → 서명 POST → triggered (worker 응답 not-ok/throw 면 worker_error)
export async function triggerMontage(
  challengeId: string,
  deps: TriggerDeps,
): Promise<MontageTriggerResult> {
  const { workerUrl, workerSecret } = deps;
  if (!workerUrl || !workerSecret) {
    return { ok: true, status: "skipped", reason: "not_configured" };
  }

  // 멱등: 같은 챌린지 재트리거 시 결과 mp4 가 있으면 인코딩하지 않는다.
  if (await deps.montageExists(montageOutputPath(challengeId))) {
    return { ok: true, status: "skipped", reason: "exists" };
  }

  const clipPaths = await deps.listClipPaths(challengeId);
  if (clipPaths.length === 0) {
    return { ok: true, status: "skipped", reason: "no_clips" };
  }

  const body = JSON.stringify(buildMontageRequest(challengeId, clipPaths));
  const signature = signMontageRequest(body, workerSecret);
  const doFetch = deps.fetchImpl ?? fetch;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), deps.timeoutMs ?? TRIGGER_TIMEOUT_MS);
  try {
    const res = await doFetch(workerUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-montage-signature": signature,
      },
      body,
      signal: controller.signal,
    });
    if (!res.ok) return { ok: false, reason: "worker_error" };
    return { ok: true, status: "triggered" };
  } catch {
    // abort(타임아웃) 포함 — 네트워크 실패를 worker_error 로 흡수(cron 은 다음 챌린지로 진행).
    return { ok: false, reason: "worker_error" };
  } finally {
    clearTimeout(timer);
  }
}
