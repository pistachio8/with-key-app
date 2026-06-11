// 00 §1.2 legacy deep link alias — push targetUrl·기존 공유 URL 의 `/action` 호환용.
// PWA 는 active challenge 가 있으면 `/challenge/[id]/action` 으로 보낸다 — 그 컨텍스트
// resolution 은 read 계약(EVAL-0016/0017) 이후. 지금은 /home 고정, primary route 중복 없음.
import { Redirect } from "expo-router";

export default function LegacyActionAlias() {
  return <Redirect href="/home" />;
}
