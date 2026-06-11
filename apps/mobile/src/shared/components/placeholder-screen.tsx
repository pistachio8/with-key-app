// G5 route skeleton 공용 placeholder (EVAL-0014) — 실데이터 렌더링은 EVAL-0017,
// mutation 은 EVAL-0018, action log 는 EVAL-0019 에서 이 화면을 대체한다.
import { StatusBar } from "expo-status-bar";
import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

type PlaceholderScreenProps = {
  title: string;
  /** 화면 아래 보조 정보(예: route param) — 후속 task 가 실 콘텐츠로 교체 */
  lines?: string[];
};

export function PlaceholderScreen({ title, lines = [] }: PlaceholderScreenProps) {
  return (
    <View style={styles.screen}>
      <StatusBar style="dark" />
      <SafeAreaView style={styles.container}>
        <Text style={styles.kicker}>fromwith</Text>
        <Text style={styles.title}>{title}</Text>
        {lines.map((line, index) => (
          <Text key={index} style={styles.meta}>
            {line}
          </Text>
        ))}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#F7FAFC",
  },
  container: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  kicker: {
    color: "#0F766E",
    fontSize: 13,
    fontWeight: "700",
    marginBottom: 10,
    textTransform: "uppercase",
  },
  title: {
    color: "#111827",
    fontSize: 30,
    fontWeight: "800",
    marginBottom: 18,
  },
  meta: {
    color: "#4B5563",
    fontSize: 15,
    marginTop: 6,
  },
});
