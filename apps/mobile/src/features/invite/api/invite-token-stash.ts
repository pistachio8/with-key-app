// 미인증 deep link 진입 시 invite token 보관소 (EVAL-0013, 04 §4 invite orchestration).
// magic link 로그인은 앱 밖(메일 → universal link cold start)을 경유하므로 메모리/네비
// param 으로는 token 이 살아남지 못한다 — SecureStore 가 유일한 복귀 경로다.
import * as SecureStore from "expo-secure-store";

// SecureStore 키 허용 문자(영숫자 · "." · "-" · "_") 범위. token 은 32B base64url
// (~43자) 라 chunked adapter 없이 단일 항목으로 충분하다.
const PENDING_INVITE_TOKEN_KEY = "fromwith.pending-invite-token";

export async function stashPendingInviteToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(PENDING_INVITE_TOKEN_KEY, token);
}

// 읽으면서 비운다(1회성) — 수락 실패 token 이 로그인마다 재시도 루프를 만들지 않게.
export async function takePendingInviteToken(): Promise<string | null> {
  try {
    const token = await SecureStore.getItemAsync(PENDING_INVITE_TOKEN_KEY);
    if (token !== null) {
      await SecureStore.deleteItemAsync(PENDING_INVITE_TOKEN_KEY);
    }
    return token;
  } catch (error) {
    // keystore 무효화(백업 복원 등)는 "보관 없음" 으로 흡수 — 사용자는 초대 링크
    // 재탭으로 복구 가능 (auth-session-storage 와 동일한 방어 원칙).
    console.warn(
      "[invite] pending token read failed:",
      error instanceof Error ? error.message : String(error),
    );
    return null;
  }
}
