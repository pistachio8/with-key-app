// 00 §1.2 legacy deep link alias — `/pledge` 호환용. pending pledge resolution 은
// read 계약(EVAL-0016/0017) 이후. 지금은 /home 고정, primary route 중복 없음.
import { Redirect } from "expo-router";

export default function LegacyPledgeAlias() {
  return <Redirect href="/home" />;
}
