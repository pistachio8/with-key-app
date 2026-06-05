import type { ZodError } from "zod";

/**
 * Machine error codes. UI maps these to Korean copy via `makeUserMessage()`.
 */
export type ErrorCode =
  | "unauthorized" // 세션 없음 또는 만료
  | "forbidden" // RLS 거부 또는 비소유
  | "invalid_input" // Zod 또는 DB check/FK 실패
  | "not_found" // 대상 row 없음 (PGRST116)
  | "conflict" // unique 위반
  | "rate_limited" // 외부 서비스 429 (예: Supabase OTP 이메일 쿨다운)
  | "upstream_error"; // AI / 외부 서비스 장애 / 알 수 없음

export type ActionSuccess<T> = { ok: true; data: T };
export type ActionFailure = {
  ok: false;
  error: ErrorCode;
  issues?: Record<string, string[] | undefined>;
};
export type ActionResult<T> = ActionSuccess<T> | ActionFailure;

export function success<T>(data: T): ActionSuccess<T> {
  return { ok: true, data };
}

export function failure(error: ErrorCode, issues?: ActionFailure["issues"]): ActionFailure {
  return { ok: false, error, ...(issues ? { issues } : {}) };
}

export function validationFailure<T>(err: ZodError<T>): ActionFailure {
  return {
    ok: false,
    error: "invalid_input",
    issues: err.flatten().fieldErrors as Record<string, string[] | undefined>,
  };
}
