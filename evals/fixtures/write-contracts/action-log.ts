// D-7 spec · EVAL-0019 보존 eval fixture — submitActionLog BFF 응답 계약 샘플.
// web submitActionLog Server Action · BFF route(POST /api/action-log) · RN service 가
// 같은 봉투를 본다 — domain 계약 테스트 · BFF route 테스트 · RN boundary eval 이 모두
// @withkey/domain submitActionLogResponseSchema 로 parse 해 계약 일치(parity)를 검증한다.

// 성공 봉투 — { ok:true, data:SubmitResult }. 첫 인증·사진 첨부·미달성 케이스.
export const SUBMIT_SUCCESS_ENVELOPE = {
  ok: true,
  data: {
    id: "00000000-0000-4000-8000-0000000000a1",
    summary: "러닝 30분 완료 — 아침 공기가 상쾌했다.",
    photoAttached: true,
    isFirstAction: true,
    currentDay: 1,
    totalDays: 30,
    verifiedDays: [1],
    goalReached: false,
    goalCount: 12,
    alreadyVerifiedToday: false,
  },
};

// 실패 봉투 — { ok:false, error }. RLS/active 게이트 거부(forbidden) 케이스.
export const SUBMIT_FAILURE_ENVELOPE = {
  ok: false,
  error: "forbidden",
};

// 검증 실패 봉투 — issues(fieldErrors) 동반. validationFailure 미러.
export const SUBMIT_VALIDATION_FAILURE_ENVELOPE = {
  ok: false,
  error: "invalid_input",
  issues: { selectedKeywords: ["키워드를 1개 이상 선택하세요"] },
};

// 계약 위반 봉투 — data 누락. 깨진 데이터가 화면에 닿지 않아야 한다(parse throw).
export const SUBMIT_MALFORMED_ENVELOPE = {
  ok: true,
  data: { id: "log-1" },
};
