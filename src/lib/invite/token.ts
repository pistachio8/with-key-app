import "server-only";
import { randomBytes } from "node:crypto";

// PRD §3.3 AC-2: 72h 만료 토큰. 엔트로피는 32B(256bit) base64url.
// 충돌 가능성: 2^-128 per pair, invites.token UNIQUE 가 2차 방어.
export function generateInviteToken(): string {
  return randomBytes(32).toString("base64url");
}
