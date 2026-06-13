// BFF(Backend-for-Frontend) fetch — Authorization: Bearer (04 §5 A8 · ADR-0036 §1).
// 인프라 전송 계층만: 도메인 endpoint 호출은 features/<domain>/api 가 이 함수를 사용한다.
// BFF 는 secret(service-role·OpenAI·암호화 키)이 필요한 경로의 유일한 표면 —
// mobile 은 응답만 소비하고 admin client/secret 경로를 갖지 않는다.
import Constants from "expo-constants";

import { getSupabaseClient } from "@/services/supabase/client";

export class BffRequestError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "BffRequestError";
    this.status = status;
  }
}

// 기본값은 universal link 도메인(= apps/web 호스트, web 이 PWA + BFF 겸임).
// BFF 를 별도 백엔드로 이전하면 EXPO_PUBLIC_BFF_BASE_URL 만 교체한다 (ADR-0036 — transport-중립 계약).
function bffBaseUrl(): string {
  const extra = Constants.expoConfig?.extra;
  const explicit = extra?.bffBaseUrl;
  if (typeof explicit === "string" && explicit.length > 0) return explicit;

  const domain = extra?.universalLinkDomain;
  if (typeof domain !== "string" || domain.length === 0) {
    throw new Error("bffBaseUrl/universalLinkDomain missing in expo config extra");
  }
  return `https://${domain}`;
}

/** Bearer 인증 GET. 세션이 없거나 응답이 !ok 면 BffRequestError. 응답 검증(zod)은 호출자 몫. */
export async function bffGetJson(path: string): Promise<unknown> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  if (error || !token) {
    throw new BffRequestError(401, "no active session for BFF request");
  }

  const response = await fetch(`${bffBaseUrl()}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    // 본문/토큰은 로그·에러 메시지에 싣지 않는다 — status 와 path 만.
    throw new BffRequestError(response.status, `BFF GET ${path} failed (${response.status})`);
  }
  return response.json();
}

/**
 * Bearer 인증 multipart POST (D-7 spec C4). GET 용 bffGetJson(!ok 면 throw)과 달리
 * **ActionResult 봉투를 값으로 반환**한다 — 4xx 도 `{ok:false,error,issues}` 봉투를 주므로
 * throw 하지 않고 호출자(service)가 zod 계약으로 parse 한 뒤 `.ok` 분기한다.
 *
 * status → 동작 계약:
 *   - JSON 객체 body(2xx·4xx·봉투 실린 5xx) → 봉투 값 반환(throw 아님)
 *   - body 없음 · JSON parse 실패 · 빈 body 5xx · 네트워크/타임아웃 → BffRequestError(status) throw
 *
 * Content-Type 은 설정하지 않는다 — RN fetch 가 FormData 에 multipart boundary 를 자동 부여한다.
 * 타임아웃은 30s(SUBMIT_TIMEOUT_MS) — AI 최대 4.5s + 사진 업로드 RTT + insert/RPC 직렬 경로보다
 * 넉넉히 잡아, 서버 성공 후 client 가 먼저 abort 해 사용자가 수동 재시도(중복 제출)하는 risk 를 줄인다
 * (D-7 spec C5 — retry 없음 + 넉넉한 타임아웃; 자동 재시도 로직은 두지 않는다).
 */
const SUBMIT_TIMEOUT_MS = 30_000;

export async function bffPostFormData(path: string, body: FormData): Promise<unknown> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  if (error || !token) {
    throw new BffRequestError(401, "no active session for BFF request");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SUBMIT_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(`${bffBaseUrl()}${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body,
      signal: controller.signal,
    });
  } catch {
    // 네트워크 오류·타임아웃(abort) — status 없음(0). 본문/토큰은 로그에 싣지 않는다.
    throw new BffRequestError(0, `BFF POST ${path} network error`);
  } finally {
    clearTimeout(timeout);
  }

  // 봉투를 값으로 읽는다. parse 실패/비객체 body 는 봉투가 없는 것 → status 보존 throw.
  let parsed: unknown;
  try {
    parsed = await response.json();
  } catch {
    throw new BffRequestError(
      response.status,
      `BFF POST ${path} non-JSON body (${response.status})`,
    );
  }
  if (parsed === null || typeof parsed !== "object") {
    throw new BffRequestError(response.status, `BFF POST ${path} empty body (${response.status})`);
  }
  return parsed;
}
