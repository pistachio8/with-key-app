// /invite/[token] — 초대 deep link 착지점이자 수락 orchestration SoT (00 §10 · 04 §4 A7, EVAL-0013).
// 미인증: token stash → /login (세션 성립 후 PostAuthRedirect 가 이 화면으로 복귀).
// 인증: accept_invite RPC → pending 서약서 서명 화면으로 이동.
// 초대 preview read(그룹명·서약 조건 표시)는 EVAL-0016 — 이 화면은 수락 흐름만 담당.
import { inviteTokenSchema } from "@withkey/domain";
import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import { useSession } from "@/features/auth";
import { acceptInvite, stashPendingInviteToken, type InviteErrorCode } from "@/features/invite";
import { PlaceholderScreen } from "@/shared/components/placeholder-screen";

// 카피는 web invite/[token]/page.tsx 의 에러 상태와 정렬 — 두 플랫폼이 같은 말을 한다.
const ERROR_SCREENS: Record<InviteErrorCode, { title: string; lines: string[] }> = {
  invalid_or_expired: {
    title: "유효하지 않은 초대",
    lines: ["만료되었거나 존재하지 않는 초대 링크예요.", "그룹장에게 새 링크를 요청해 주세요."],
  },
  group_full: {
    title: "그룹이 가득 찼어요",
    lines: ["이 그룹은 이미 4명이 참여 중이에요 (최대 인원)."],
  },
  accept_failed: {
    title: "참여에 실패했어요",
    lines: ["네트워크 상태를 확인하고", "초대 링크를 다시 눌러 주세요."],
  },
};

export default function InviteScreen() {
  const router = useRouter();
  const { session, isLoading } = useSession();
  const params = useLocalSearchParams<{ token?: string | string[] }>();
  // 중복 쿼리/세그먼트 파라미터는 string[] 로 도착할 수 있다 — 첫 값만 사용
  const rawToken = Array.isArray(params.token) ? params.token[0] : params.token;
  const parsed = inviteTokenSchema.safeParse(rawToken);
  const token = parsed.success ? parsed.data : null;

  const [stashed, setStashed] = useState(false);
  const [error, setError] = useState<InviteErrorCode | null>(null);
  // 세션 객체 identity 변동(token refresh)으로 effect 가 재실행돼도 RPC 는 1회만.
  const acceptStartedRef = useRef(false);

  // 미인증 — 세션 성립 후 복귀를 위해 token 을 SecureStore 에 보관한 뒤 로그인으로.
  useEffect(() => {
    if (isLoading || session !== null || token === null) return;
    let active = true;
    stashPendingInviteToken(token)
      // 보관 실패해도 로그인은 진행 — 복귀만 수동(초대 링크 재탭)이 된다.
      .catch(() => undefined)
      .then(() => {
        if (active) setStashed(true);
      });
    return () => {
      active = false;
    };
  }, [isLoading, session, token]);

  // 인증 — accept_invite 호출 후 착지로 이동 (already-joined 도 RPC 가 성공으로 수렴).
  useEffect(() => {
    if (isLoading || session === null || token === null) return;
    if (acceptStartedRef.current) return;
    acceptStartedRef.current = true;
    let active = true;

    acceptInvite(token).then((result) => {
      if (!active) return;
      if (!result.ok) {
        setError(result.error);
        return;
      }
      const { redirect } = result;
      if (redirect.kind === "pledge") {
        router.replace({
          pathname: "/challenge/[id]/pledge",
          params: { id: redirect.challengeId },
        });
      } else if (redirect.kind === "challenge") {
        router.replace({ pathname: "/challenge/[id]", params: { id: redirect.challengeId } });
      } else {
        router.replace("/home");
      }
    });
    return () => {
      active = false;
    };
  }, [isLoading, session, token, router]);

  if (token === null) {
    return <PlaceholderScreen title="유효하지 않은 초대" lines={["링크를 다시 확인해 주세요."]} />;
  }

  if (error !== null) {
    const screen = ERROR_SCREENS[error];
    return <PlaceholderScreen title={screen.title} lines={screen.lines} />;
  }

  if (!isLoading && session === null) {
    // stash 완료 전 이동 금지 — 로그인 후 복귀 주소가 유실되는 race 방지.
    if (!stashed) return <PendingScreen label="초대 확인 중…" />;
    return <Redirect href="/login" />;
  }

  return <PendingScreen label={isLoading ? "초대 확인 중…" : "초대 수락 중…"} />;
}

function PendingScreen({ label }: { label: string }) {
  return (
    <View style={styles.center}>
      <ActivityIndicator />
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    alignItems: "center",
    backgroundColor: "#F7FAFC",
    flex: 1,
    justifyContent: "center",
  },
  label: {
    color: "#4B5563",
    fontSize: 15,
    marginTop: 12,
  },
});
