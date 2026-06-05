import "@withkey/domain";

import Constants from "expo-constants";
import { StatusBar } from "expo-status-bar";
import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

type MobileExpoExtra = {
  appVariant?: string;
  universalLinkDomain?: string;
};

export default function HomeScreen() {
  const extra = Constants.expoConfig?.extra as MobileExpoExtra | undefined;
  const appVariant = extra?.appVariant ?? "dev";
  const universalLinkDomain = extra?.universalLinkDomain ?? "dev.fromwith.app";

  return (
    <View style={styles.screen}>
      <StatusBar style="dark" />
      <SafeAreaView style={styles.container}>
        <Text style={styles.kicker}>fromwith</Text>
        <Text style={styles.title}>Expo dev-build shell</Text>
        <Text style={styles.meta}>variant: {appVariant}</Text>
        <Text style={styles.meta}>links: {universalLinkDomain}</Text>
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
    letterSpacing: 0,
    marginBottom: 10,
    textTransform: "uppercase",
  },
  title: {
    color: "#111827",
    fontSize: 30,
    fontWeight: "800",
    letterSpacing: 0,
    marginBottom: 18,
  },
  meta: {
    color: "#4B5563",
    fontSize: 15,
    letterSpacing: 0,
    marginTop: 6,
  },
});
