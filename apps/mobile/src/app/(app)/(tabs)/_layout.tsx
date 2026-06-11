// 인증 후 Bottom Tabs — 04 §3 새 IA. G5 범위는 home·me 두 탭만 두고,
// challenges·notifications 탭은 해당 기능 이전 시 lazy 추가한다 (04 §5.1 lazy 생성 리듬).
import { Tabs } from "expo-router";

export default function TabsLayout() {
  return (
    <Tabs screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="home" options={{ title: "홈" }} />
      <Tabs.Screen name="me" options={{ title: "내 정보" }} />
    </Tabs>
  );
}
