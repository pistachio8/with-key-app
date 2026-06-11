// 00 §1.2 legacy deep link alias — `/recap` 호환용. 최신 recap resolution 은
// read 계약(EVAL-0016/0017) 이후. 지금은 /home 고정, primary route 중복 없음.
// `/group/new`·`/settings` 는 00 §1.2 "RN에서는 제거" — alias 없이 +not-found 가 회수한다.
import { Redirect } from "expo-router";

export default function LegacyRecapAlias() {
  return <Redirect href="/home" />;
}
