// src/lib/media/montage/types.ts
import "server-only";
// 합본 몽타주 워커 계약(spec §C6-B / EVAL-0046 · ADR-0040).
// crypto/network 비의존 — 경로·요청 shape 만. trigger.ts(서명·POST)와 read(challenge-montage.ts) 양쪽이 공유.
// server-only: 버킷명·경로 헬퍼가 워커 인프라 detail 이라 클라이언트 번들 유입을 차단(현재 client importer 없음).

// 결과 mp4 의 private 저장 버킷(migration 0057). action-videos 와 분리.
export const MONTAGE_BUCKET = "challenge-montages";

// 결과 mp4 경로. concat -c copy 출력은 mp4 고정(ADR-0040 — 캡처 동일 코덱·해상도·fps 표준화 전제).
// 멱등 키 — 이 경로의 객체 존재 = "이미 인코딩됨".
export function montageOutputPath(challengeId: string): string {
  return `${challengeId}/montage.mp4`;
}

// 워커(Oracle A1)에 보내는 인코딩 요청. 워커는 자체 service 키로 clipPaths(action-videos)를 pull,
// concat → outputPath(challenge-montages)로 push 한다. PWA 미관여.
export type MontageEncodeRequest = {
  challengeId: string;
  clipPaths: string[];
  outputPath: string;
};

export type MontageTriggerResult =
  | { ok: true; status: "triggered" }
  | { ok: true; status: "skipped"; reason: "exists" | "no_clips" | "not_configured" }
  | { ok: false; reason: "worker_error" };

export function buildMontageRequest(
  challengeId: string,
  clipPaths: ReadonlyArray<string>,
): MontageEncodeRequest {
  return {
    challengeId,
    clipPaths: [...clipPaths],
    outputPath: montageOutputPath(challengeId),
  };
}
