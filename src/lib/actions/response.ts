import type { ZodError } from "zod";

export type ActionSuccess<T> = { ok: true; data: T };
export type ActionFailure = {
  ok: false;
  error: string;
  issues?: Record<string, string[] | undefined>;
};
export type ActionResult<T> = ActionSuccess<T> | ActionFailure;

export function success<T>(data: T): ActionSuccess<T> {
  return { ok: true, data };
}

export function failure(error: string, issues?: ActionFailure["issues"]): ActionFailure {
  return { ok: false, error, ...(issues ? { issues } : {}) };
}

export function validationFailure<T>(err: ZodError<T>): ActionFailure {
  return {
    ok: false,
    error: "invalid_input",
    issues: err.flatten().fieldErrors as Record<string, string[] | undefined>,
  };
}
