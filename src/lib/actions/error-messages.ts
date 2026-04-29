// ActionResult 의 error code (`unauthorized` 등) 를 사용자용 한국어 copy 로 변환.
// page 별 도메인 특정 copy 는 `makeUserMessage(overrides)` 로 재정의.

export const FALLBACK_ERROR_MESSAGE = "요청을 처리하지 못했어요. 잠시 후 다시 시도해 주세요.";

const DEFAULT_ERROR_MESSAGES: Record<string, string> = {
  unauthorized: "로그인이 필요해요. 로그인 화면으로 이동할게요.",
  invalid_input: "입력값을 다시 확인해 주세요.",
};

export function makeUserMessage(overrides: Record<string, string> = {}): (code: string) => string {
  const merged = { ...DEFAULT_ERROR_MESSAGES, ...overrides };
  return (code) => merged[code] ?? FALLBACK_ERROR_MESSAGE;
}
