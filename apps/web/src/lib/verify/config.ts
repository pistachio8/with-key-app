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

// 운영 이상 알림 임계 — θ(판정)와 별개. AC-owner-load-3. 값은 PO/운영 env.
// θ 스키마와 분리한 이유: θ 는 자동검증 판정 임계(false-flag)이고, 이 노브는
// 운영 알림 트리거(주차 failed/reject 비율)다 — 둘은 서로 다른 결정·다른 주체(spec C3).
const verifyOpsEnvSchema = z
  .object({
    VERIFY_OPS_FAILED_RATE: z.coerce.number().min(0).max(1).default(0.3),
    VERIFY_OPS_REJECT_RATE: z.coerce.number().min(0).max(1).default(0.3),
    // 최소 표본 — 1/1=100% 같은 노이즈 알림 방지.
    VERIFY_OPS_MIN_SAMPLE: z.coerce.number().int().min(1).default(3),
  })
  .transform((env) => ({
    failedRate: env.VERIFY_OPS_FAILED_RATE,
    rejectRate: env.VERIFY_OPS_REJECT_RATE,
    minSample: env.VERIFY_OPS_MIN_SAMPLE,
  }));

export type VerifyOpsConfig = z.output<typeof verifyOpsEnvSchema>;

export function loadVerifyOpsConfig(env: VerifyEnvSource = process.env): VerifyOpsConfig {
  // 빈 문자열은 미설정과 동일하게 default 로 폴백한다(loadVerifyConfig 와 동일 관행).
  return verifyOpsEnvSchema.parse({
    VERIFY_OPS_FAILED_RATE: env.VERIFY_OPS_FAILED_RATE || undefined,
    VERIFY_OPS_REJECT_RATE: env.VERIFY_OPS_REJECT_RATE || undefined,
    VERIFY_OPS_MIN_SAMPLE: env.VERIFY_OPS_MIN_SAMPLE || undefined,
  });
}
