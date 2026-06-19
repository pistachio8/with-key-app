import { adminClient } from "@/lib/supabase/admin";

// 디버깅용 개발자 로그인 모드의 서버 코어 (spec §5.1).
// 게이트 + allowlist + admin 발급을 단일 모듈에서 담당하고, 라우트는 전송만 한다.
// Production 에 DEV_LOGIN_ENABLED 를 넣지 않는 것이 1차 방어(생략 규율)이고,
// VERCEL_ENV hard-deny 가 prod env 오등록까지 막는 2차 방어다 (defense in depth).

/**
 * dev-login 서버 게이트. 아래 두 조건을 모두 만족해야 켜진다.
 * 1) DEV_LOGIN_ENABLED === 'true' — Preview env scope 에만 등록 (spec §4·D7).
 * 2) VERCEL_ENV !== 'production' — prod 에 플래그가 실수로 등록돼도 hard-deny.
 *
 * VERCEL_ENV 는 preview/production 을 구분한다(NODE_ENV 는 Vercel 에서 둘 다
 * 'production' 이라 불가 — diary.ts currentScope 와 동일 근거). 로컬은 VERCEL_ENV
 * 가 undefined 라 통과하므로 `pnpm dev` 디버깅에는 영향이 없다.
 */
export function isDevLoginEnabled(): boolean {
  return process.env.DEV_LOGIN_ENABLED === "true" && process.env.VERCEL_ENV !== "production";
}

/**
 * 토큰 발급이 허용된 이메일 목록. seed 된 dev 계정과 정확히 일치해야 한다.
 *
 * auth-js 에는 이메일 기반 존재 확인 API 가 없고 generateLink 는 미존재 이메일을
 * 새로 생성하므로, "임의/실유저 이메일 차단"의 실질 방어선은 이 정확 일치 allowlist 다
 * (spec §5.1 reviewer 교정). 통과 가능한 이메일이 seed 된 N 개뿐이라 generateLink 가
 * 만들 수 있는 계정도 그 dev 계정으로 한정된다.
 */
function devEmails(): string[] {
  return (process.env.DEV_LOGIN_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** 라우트가 HTTP 상태로 변환할 수 있도록 status 를 실어 던지는 에러. */
export class DevLoginError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "DevLoginError";
    this.status = status;
  }
}

/**
 * dev 전용 magic-link hashed token 을 발급한다.
 *
 * 1) 게이트 꺼짐 → 404 (라우트가 Not found 로 변환)
 * 2) allowlist 불일치 → 400 (admin 호출 전에 차단)
 * 3) adminClient.generateLink → data.properties.hashed_token 반환
 *
 * 반환 필드는 `hashed_token` 이다 (token_hash 아님 — generateLink 응답 스키마,
 * dev-login-link.mjs 와 동일). 호출자는 이 값을 verifyOtp 의 token_hash 인자로 넘긴다.
 * 발급된 토큰 값은 로그에 남기지 않는다 (AI 일기 가드레일과 동일 원칙).
 */
export async function mintDevToken(email: string): Promise<string> {
  if (!isDevLoginEnabled()) {
    throw new DevLoginError(404, "dev login disabled");
  }
  if (!devEmails().includes(email)) {
    throw new DevLoginError(400, "email not in allowlist");
  }

  const { data, error } = await adminClient().auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  if (error) {
    throw new DevLoginError(502, `generateLink failed: ${error.message}`);
  }

  const hashedToken = data?.properties?.hashed_token;
  if (!hashedToken) {
    throw new DevLoginError(502, "no hashed_token returned");
  }
  return hashedToken;
}
