// 세션 성립 직후 착지 분기 (EVAL-0013, 04 §4) — stash 된 invite token 이 있으면
// /invite/<token> 으로 복귀시켜 수락을 이어가고, 없으면 /home. stash 는 1회성으로
// 비워지고 token 은 route param 으로 넘어간다 (수락 SoT 는 invite 화면 하나).
import { Redirect, type Href } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";

import { takePendingInviteToken } from "../api/invite-token-stash";

export function PostAuthRedirect() {
  const [href, setHref] = useState<Href | null>(null);

  useEffect(() => {
    let active = true;
    takePendingInviteToken().then((token) => {
      if (!active) return;
      setHref(token ? { pathname: "/invite/[token]", params: { token } } : "/home");
    });
    return () => {
      active = false;
    };
  }, []);

  if (href === null) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  return <Redirect href={href} />;
}

const styles = StyleSheet.create({
  center: {
    alignItems: "center",
    backgroundColor: "#F7FAFC",
    flex: 1,
    justifyContent: "center",
  },
});
