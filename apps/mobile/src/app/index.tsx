// 앱 진입점 — 00 §1.1 `/`: 세션 복원 후 인증→/home, 미인증→/login (deep link entry + auth gate).
// SecureStore 복원이 끝나기 전에는 어떤 화면도 확정하지 않는다 (flash 금지, EVAL-0012).
import { Redirect } from "expo-router";
import { ActivityIndicator, StyleSheet, View } from "react-native";

import { useSession } from "@/features/auth";

export default function EntryScreen() {
  const { session, isLoading } = useSession();

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  return <Redirect href={session ? "/home" : "/login"} />;
}

const styles = StyleSheet.create({
  center: {
    alignItems: "center",
    backgroundColor: "#F7FAFC",
    flex: 1,
    justifyContent: "center",
  },
});
