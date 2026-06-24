import { z } from "zod";
import { ACTIVITY_TYPES, KEYWORD_POOL } from "../keywords/pool";

const activityType = z.enum(ACTIVITY_TYPES);
export const ALLOWED_PHOTO_MIME = ["image/jpeg", "image/png", "image/webp"] as const;
export type AllowedPhotoMime = (typeof ALLOWED_PHOTO_MIME)[number];
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

// 영상 인증(spec §C2 / EVAL-0043). 실시간 캡처 3초 클립 — action-videos 버킷 정책과 정합.
export const ALLOWED_VIDEO_MIME = ["video/mp4", "video/webm"] as const;
export type AllowedVideoMime = (typeof ALLOWED_VIDEO_MIME)[number];
// 버킷 file_size_limit(0054) 과 동일 상한. 3초 클립 + 헤드룸.
export const MAX_VIDEO_BYTES = 20 * 1024 * 1024;
// 3초 캡처 + 버퍼(타이머·인코딩 오차). 초과분은 위조·갤러리 우회 신호로 거절.
export const MAX_VIDEO_DURATION_SECONDS = 3.5;

// 영상 인증의 기본 검증 상태(spec §C2 "검증 상태(영상)").
// 영상엔 AI 검증이 없다(Phase 1 — 3초 클립 판정 모델 없음). 'passed' 는 'AI 통과'가 아니라
// **'캡처 수용'**(실시간 캡처가 갤러리 위조를 1차 차단) 을 뜻한다. 사후 게이트는 peer-reject 가 유일.
// enum 미신설 이유: capture_verified 같은 값을 추가하면 doneByWeek·feed read 등 모든 소비처를 건드려야
// 한다(passed=done, peer_rejected=제외 산정이 사진과 완전히 동일하게 동작).
export const VIDEO_AUTO_VERIFY_STATUS = "passed" as const;

// 영상 메타 검증(pure) — MIME·크기·길이. 실제 업로드 경계(storage 헬퍼 + 버킷 정책)와 함께 쓴다.
export const actionVideoMetaSchema = z
  .object({
    mime: z.enum(ALLOWED_VIDEO_MIME),
    sizeBytes: z.number().int().positive().max(MAX_VIDEO_BYTES),
    durationSeconds: z.number().positive().max(MAX_VIDEO_DURATION_SECONDS),
  })
  .strict();

export type ActionVideoMeta = z.infer<typeof actionVideoMetaSchema>;

// PRD §4.3 AC-2/9/10: 키워드 최대 3개 · 풀 내 값만 허용.
// 직접 입력 일기(memo 가 채워진 경우, spec 2026-05-28-action-manual-diary)에는
// 키워드가 AI 생성용 입력이 아니라 무시되므로 0개를 허용한다. memo 가 없으면
// (= AI 모드) 최소 1개를 강제한다 — 검증은 아래 superRefine 에서 조건부로 처리.
export const actionLogInputSchema = z
  .object({
    challengeId: z.string().uuid(),
    activityType,
    selectedKeywords: z.array(z.string()).max(3),
    shownKeywords: z.array(z.string()).min(1),
    rerollCount: z.number().int().min(0).max(5),
    // 직접 입력 일기 본문. ai_summary(char_length <= 150)에 저장되므로 150자.
    memo: z.string().max(150).optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    const hasMemo = typeof data.memo === "string" && data.memo.trim().length > 0;
    // AI 모드(직접 입력 없음)에서는 키워드 1개 이상 필수.
    if (!hasMemo && data.selectedKeywords.length < 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["selectedKeywords"],
        message: "키워드를 1개 이상 선택하거나 일기를 직접 입력하세요.",
      });
    }
    const pool = KEYWORD_POOL[data.activityType];
    data.selectedKeywords.forEach((kw, idx) => {
      if (!pool.includes(kw)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["selectedKeywords", idx],
          message: `'${kw}' is not in the ${data.activityType} pool`,
        });
      }
    });
  });

export type ActionLogInput = z.infer<typeof actionLogInputSchema>;

// Photo validation intentionally lives in uploadPhoto (size + extFromFile) +
// the Storage bucket policy (mime/size). A third Zod layer on FormData would
// reject iOS Safari HEIC uploads with empty Content-Type headers, so we rely
// on the upload/bucket pair as the runtime boundary.
