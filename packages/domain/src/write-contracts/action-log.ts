// write-contracts/action-log — submitActionLog BFF 쓰기 계약 (D-7 spec · EVAL-0019).
// web Server Action(submitActionLog) · BFF route(POST /api/action-log) · RN service 가
// 공유하는 응답 SoT. ActionResult 봉투 passthrough — RN 이 web client 와 동일 shape 을 parse 한다.
// domain 순수성(04 A2): 네트워크/supabase/openai 코드 미포함, zod 계약만.
import { z } from "zod";

// _actions.ts 의 SubmitResult 를 verbatim 승격. 성공 모달/슬라이더/컨페티 분기에 쓰인다.
export const submitResultSchema = z.object({
  id: z.string(),
  summary: z.string(),
  photoAttached: z.boolean(),
  // 첫 인증 성공 모달(§10-C) 분기.
  isFirstAction: z.boolean(),
  // 슬라이드 day 카운터(§10-B) — KST 캘린더 기준 오늘 일차 (1-indexed, clamp 1..totalDays).
  currentDay: z.number(),
  // 총 챌린지 일수 (DaySlider 1..N).
  totalDays: z.number(),
  // 인증한 challenge 일차 인덱스(1..totalDays, 정렬) — streak 채도용.
  verifiedDays: z.array(z.number()),
  // 이번 제출이 누적 인증일수를 goalCount 에 처음 도달시켰는지(컨페티 트리거).
  goalReached: z.boolean(),
  // 목표 횟수(주 N회 빈도값, POC 정산은 전체 distinct 일수와 비교).
  goalCount: z.number(),
  // EVAL-0049 안 A — 이번 제출 이전에 오늘 이미 인증이 있었는지(추가 피드 여부).
  // true 면 인증 횟수가 늘지 않는 반복 업로드라 클라이언트가 축하 모달 대신 toast 로 피드백한다.
  alreadyVerifiedToday: z.boolean(),
});
export type SubmitResult = z.infer<typeof submitResultSchema>;

// lib/actions/response.ts 의 ErrorCode 7 리터럴을 domain 으로 verbatim 승격(SoT 단일화).
// response.ts 는 이 타입을 re-export 해 web 의 기존 import 를 깨지 않는다(C3 surgical).
export const errorCodeSchema = z.enum([
  "unauthorized", // 세션 없음 또는 만료
  "forbidden", // RLS 거부 또는 비소유
  "invalid_input", // Zod 또는 DB check/FK 실패
  "not_found", // 대상 row 없음 (PGRST116)
  "conflict", // unique 위반
  "rate_limited", // 외부 서비스 429
  "upstream_error", // AI / 외부 서비스 장애 / 알 수 없음
]);
export type ErrorCode = z.infer<typeof errorCodeSchema>;

// ActionFailure.issues 미러 — zod fieldErrors shape (필드명 → 메시지 배열).
const issuesSchema = z.record(z.string(), z.array(z.string()).optional()).optional();

// ActionResult<SubmitResult> 봉투 discriminated union (feedResponseSchema 패턴 동일).
// BFF 응답 본문 = 이 스키마. RN 이 .ok 분기 + field issues 를 web client 와 동일 처리.
export const submitActionLogResponseSchema = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), data: submitResultSchema }),
  z.object({ ok: z.literal(false), error: errorCodeSchema, issues: issuesSchema }),
]);
export type SubmitActionLogResponse = z.infer<typeof submitActionLogResponseSchema>;
