import type { ErrorCode } from "./response";

// ActionResult.error 를 사용자용 한국어 copy 로 변환. page 별 overrides 가능.

export const FALLBACK_ERROR_MESSAGE = "요청을 처리하지 못했어요. 잠시 후 다시 시도해 주세요.";

const DEFAULT_ERROR_MESSAGES: Record<ErrorCode, string> = {
  unauthorized: "로그인이 필요해요. 로그인 화면으로 이동할게요.",
  forbidden: "접근 권한이 없어요.",
  invalid_input: "입력값을 다시 확인해 주세요.",
  not_found: "대상을 찾을 수 없어요.",
  conflict: "이미 처리된 요청이에요.",
  upstream_error: FALLBACK_ERROR_MESSAGE,
};

export function makeUserMessage(
  overrides: Partial<Record<ErrorCode, string>> = {},
): (code: ErrorCode) => string {
  const merged: Record<ErrorCode, string> = { ...DEFAULT_ERROR_MESSAGES, ...overrides };
  return (code) => merged[code] ?? FALLBACK_ERROR_MESSAGE;
}
