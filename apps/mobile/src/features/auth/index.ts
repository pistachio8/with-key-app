// features/auth 공개 API — cross-feature/route 접근은 이 파일 경유 (04 §5.1).
export {
  requestMagicLink,
  signInWithKakao,
  signOut,
  verifyMagicLinkToken,
  type AuthErrorCode,
  type AuthResult,
} from "./api/auth-service";
export { SessionProvider, useSession } from "./hooks/use-session";
