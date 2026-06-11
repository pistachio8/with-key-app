import "server-only";
import { z } from "zod";

// θ(판정 임계) 주입 지점 — EVAL-0022 / false-flag-threshold-theta spec §주입 지점.
// θ는 PO 정책값이라 코드에 하드코딩하지 않고 server-only env 로 읽는다(실측 PoC 가
// 코드 변경 없이 값만 교체해 튜닝). 기본값은 spec 의 잠정(provisional) θ 와 동일하다.
// NEXT_PUBLIC_ 금지 — 임계가 클라 번들에 노출되면 치터가 우회 튜닝 가능(서버 판단).

const verifyEnvSchema = z
  .object({
    // 동일-user/group 해밍거리 d ≤ failMax → failed (64-bit DCT pHash 기준).
    VERIFY_PHASH_FAIL_MAX: z.coerce.number().int().min(0).max(64).default(6),
    // failMax < d ≤ reviewMax → manual_review (경계 near-dup).
    VERIFY_PHASH_REVIEW_MAX: z.coerce.number().int().min(0).max(64).default(10),
    // false = shadow(would-be 기록만, 차단 0) / true = failed 실제 카운트 제외(PoC 통과 후).
    VERIFY_ENFORCE: z
      .enum(["true", "false"])
      .default("false")
      .transform((v) => v === "true"),
  })
  .refine((env) => env.VERIFY_PHASH_FAIL_MAX <= env.VERIFY_PHASH_REVIEW_MAX, {
    message: "VERIFY_PHASH_FAIL_MAX must be <= VERIFY_PHASH_REVIEW_MAX",
  })
  .transform((env) => ({
    phashFailMax: env.VERIFY_PHASH_FAIL_MAX,
    phashReviewMax: env.VERIFY_PHASH_REVIEW_MAX,
    enforce: env.VERIFY_ENFORCE,
  }));

// zod SoT — 도메인 타입은 스키마에서 도출(수동 인터페이스 동기 누락 방지).
export type VerifyConfig = z.output<typeof verifyEnvSchema>;

type VerifyEnvSource = Record<string, string | undefined>;

/** server env 에서 θ 를 zod 검증 + 기본값으로 읽는다. 잘못된 값은 빠르게 throw(경계 검증). */
export function loadVerifyConfig(env: VerifyEnvSource = process.env): VerifyConfig {
  // 빈 문자열은 미설정과 동일하게 default 로 폴백한다(.env 빈 값 관행).
  return verifyEnvSchema.parse({
    VERIFY_PHASH_FAIL_MAX: env.VERIFY_PHASH_FAIL_MAX || undefined,
    VERIFY_PHASH_REVIEW_MAX: env.VERIFY_PHASH_REVIEW_MAX || undefined,
    VERIFY_ENFORCE: env.VERIFY_ENFORCE || undefined,
  });
}
