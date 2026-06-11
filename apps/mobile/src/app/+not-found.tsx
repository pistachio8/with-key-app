// 미존재 라우트 회수 (03 §1) — 제거된 legacy 경로(/group/new·/settings 등) 포함
// 모든 unmatched deep link 를 진입점으로 되돌린다. 진입점이 세션에 따라 home/login 분기.
import { Redirect } from "expo-router";

export default function NotFoundScreen() {
  return <Redirect href="/" />;
}
