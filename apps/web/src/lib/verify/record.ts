import "server-only";
import { adminClient } from "@/lib/supabase/admin";
import { advisorySignalScore, computeVerifySignals, type VerifySignals } from "./signals";

// 결정론 신호를 EVAL-0020 컬럼(0045)에 서버 기록한다. 본문(사진·일기)은 저장하지 않는다.
//
// 경로: 검증 컬럼군은 service_role write 전용(prevent_ai_column_update 가드, 0045 §B). 따라서
//   viewer 토큰(server client)이 아니라 adminClient(service_role)로 UPDATE 한다. photo_phash 등
//   4개는 본문 immutability 트리거(0045 §C) 대상이 아니므로 갱신이 허용된다.
// auto_verify_status 는 의도적으로 미변경 — θ 판정은 EVAL-0022. 본 함수는 신호 적재만 한다.

export async function recordVerifySignals(args: {
  actionLogId: string;
  userId: string;
  photo: Buffer | Uint8Array;
  submittedAt?: Date;
}): Promise<void> {
  // 신호 계산(sharp 디코딩·EXIF 파싱)은 외부 입력이라 손상·미지원 이미지에 throw 할 수 있다.
  // 그 경우 기록을 비파괴 skip 한다 — 본문은 남기지 않고 errorType·actionLogId 메타만 로깅한다.
  let signals: VerifySignals;
  try {
    signals = await computeVerifySignals(args.photo, { submittedAt: args.submittedAt });
  } catch (e) {
    console.error("[recordVerifySignals] signal computation skipped", {
      actionLogId: args.actionLogId,
      errorType: e instanceof Error ? e.name : "unknown",
    });
    return;
  }

  // user_id 를 AND 조건으로 고정 — actionLogId 가 신뢰 입력이라도 service_role write 가
  // prevent_ai_column_update 가드(0045 §B)를 통과하므로, 소유 범위를 함수 레이어에서도 좁힌다.
  const supabase = adminClient();
  const { error } = await supabase
    .from("action_logs")
    .update({
      photo_phash: signals.phash,
      photo_captured_at: signals.capturedAt ? signals.capturedAt.toISOString() : null,
      auto_verify_score: advisorySignalScore(signals),
      auto_verify_model_version: signals.modelVersion,
    })
    .eq("id", args.actionLogId)
    .eq("user_id", args.userId);

  if (error) throw error;
}
