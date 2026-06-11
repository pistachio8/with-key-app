// Kakao 네이티브 SDK 격리 capability (04 §5.1). feature 는 이 인터페이스만 보고,
// @react-native-kakao 구현 교체가 feature 에 새지 않게 한다.
import { initializeKakaoSDK } from "@react-native-kakao/core";
import { login as kakaoLogin, logout as kakaoLogout } from "@react-native-kakao/user";

export type KakaoLoginResult = {
  /** OIDC id token — Kakao 콘솔에서 OpenID Connect 활성화 시에만 존재 */
  idToken: string | null;
  accessToken: string;
};

export interface KakaoAuth {
  init(nativeAppKey: string): void;
  login(): Promise<KakaoLoginResult>;
  logout(): Promise<void>;
}

export const kakaoAuth: KakaoAuth = {
  init(nativeAppKey) {
    initializeKakaoSDK(nativeAppKey);
  },

  async login() {
    const token = await kakaoLogin();
    return {
      idToken: token.idToken ?? null,
      accessToken: token.accessToken,
    };
  },

  async logout() {
    await kakaoLogout();
  },
};
