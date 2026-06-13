import type { ZodError } from "zod";
import type { ErrorCode } from "@withkey/domain";

/**
 * Machine error codes. UI maps these to Korean copy via `makeUserMessage()`.
 * SoT 는 @withkey/domain write-contracts/action-log (D-7) — BFF·RN 과 단일 계약을 위해
 * 승격했고, 여기선 re-export 해 web 의 기존 `@/lib/actions/response` import 를 보존한다.
 */
export type { ErrorCode };

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
