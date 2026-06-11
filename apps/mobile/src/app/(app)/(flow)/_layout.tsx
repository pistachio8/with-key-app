// (flow) — AppHeader 없는 풀스크린 플로우 group (00 §10 · 04 §3).
// (app)/_layout 에서 presentation: 'modal' 로 표시된다.
import { Stack } from "expo-router";

export default function FlowLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
