// expo-notifications / expo-device 네이티브 SDK 격리 (04 §5.1 capability 원칙).
// register/unregister 로직이 SDK 표면 변경에 새지 않도록, native 모듈 import 는 이 파일에만 둔다.
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

// device_push_tokens.platform check (ios|android) 와 정합.
export type PushPlatform = "ios" | "android";

/** RN 앱이 도는 플랫폼. push 미지원 표면(web 등)은 null. */
export function pushPlatform(): PushPlatform | null {
  return Platform.OS === "ios" || Platform.OS === "android" ? Platform.OS : null;
}

/** 시뮬레이터/에뮬레이터는 Expo push token 을 발급받지 못한다 (Device.isDevice=false). */
export function isPhysicalDevice(): boolean {
  return Device.isDevice;
}

/** EAS projectId — getExpoPushTokenAsync 필수 인자. 미설정(EVAL-0053 인프라 선행 전)이면 null. */
export function easProjectId(): string | null {
  const fromExtra = Constants.expoConfig?.extra?.eas?.projectId;
  if (typeof fromExtra === "string" && fromExtra.length > 0) return fromExtra;
  const fromEas = (Constants as { easConfig?: { projectId?: unknown } }).easConfig?.projectId;
  return typeof fromEas === "string" && fromEas.length > 0 ? fromEas : null;
}

/** 앱 버전 — device_push_tokens.app_version 기록용. */
export function appVersion(): string | null {
  return Constants.expoConfig?.version ?? null;
}

/**
 * Android 13+ 는 알림 채널이 최소 1개 있어야 권한 프롬프트가 뜨고 token 을 받을 수 있다.
 * iOS 는 no-op. (Expo: setNotificationChannelAsync 는 getExpoPushTokenAsync 전에 호출해야 한다)
 */
export async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync("default", {
    name: "기본 알림",
    importance: Notifications.AndroidImportance.DEFAULT,
  });
}

/** 권한 요청 — 이미 허용이면 재요청하지 않는다. 최종 허용 여부를 boolean 으로 반환. */
export async function ensurePermissionGranted(): Promise<boolean> {
  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === "granted") return true;
  const { status } = await Notifications.requestPermissionsAsync();
  return status === "granted";
}

/** Expo push token 문자열(ExponentPushToken[...]) 획득. */
export async function acquireExpoPushToken(projectId: string): Promise<string> {
  const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
  return data;
}
