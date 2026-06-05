import type { ErrorCode } from "./response";

type PgErrorLike = { code?: string | null; message?: string | null };

/**
 * PostgREST / Postgres error code → machine ErrorCode.
 * Reference: https://www.postgresql.org/docs/current/errcodes-appendix.html
 * PostgREST specific: PGRST116 (no rows).
 */
export function mapSupabaseError(err: PgErrorLike | null | undefined): ErrorCode {
  if (!err?.code) return "upstream_error";
  switch (err.code) {
    case "42501":
      return "forbidden";
    case "PGRST116":
      return "not_found";
    case "23505":
      return "conflict";
    case "23503":
    case "23514":
    case "23502":
      return "invalid_input";
    default:
      return "upstream_error";
  }
}
