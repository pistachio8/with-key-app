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
