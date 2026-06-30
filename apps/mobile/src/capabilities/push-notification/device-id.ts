// 기기 식별자 — device_push_tokens 의 (user_id, device_id) upsert 키 중 device_id (ADR-0041).
// ADR 은 "expo-device installation id" 를 적었지만 Device.osBuildId 는 동일 OS 빌드 기기끼리
// 충돌해 기기 고유성이 없다. 그래서 task §Requirements 가 허용한 대안 — SecureStore 에 1회
// 생성·영속하는 UUID 를 쓴다. 재로그인은 같은 device_id 를 재사용해 같은 row 를 갱신/재활성한다.
import * as Crypto from "expo-crypto";
import * as SecureStore from "expo-secure-store";

const DEVICE_ID_KEY = "withkey.push.device_id";

/** 저장된 device_id 를 반환. 없으면 null (생성하지 않음 — 무효화 경로 전용). */
export async function getExistingDeviceId(): Promise<string | null> {
  return SecureStore.getItemAsync(DEVICE_ID_KEY);
}

/** 저장된 device_id 를 반환하거나, 없으면 새 UUID 를 생성·영속해 반환 (등록 경로 전용). */
export async function getOrCreateDeviceId(): Promise<string> {
  const existing = await SecureStore.getItemAsync(DEVICE_ID_KEY);
  if (existing) return existing;
  const created = Crypto.randomUUID();
  await SecureStore.setItemAsync(DEVICE_ID_KEY, created);
  return created;
}
