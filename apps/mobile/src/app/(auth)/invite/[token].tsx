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
import { colors } from "@/shared/theme/colors";
import { spacing } from "@/shared/theme/spacing";
import { typography } from "@/shared/theme/typography";
import { Button } from "@/shared/ui/button";
import { EmptyState } from "@/shared/ui/empty-state";
import { ErrorState } from "@/shared/ui/error-state";

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
  // accept_failed 재시도용 — nonce 를 올리면 accept effect 가 다시 돈다(그 외엔 RPC 1회만).
  const [retryNonce, setRetryNonce] = useState(0);
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
  }, [isLoading, session, token, router, retryNonce]);

  // 딥링크 진입 + 앱 루트 headerShown:false → 상태 화면에 뒤로 갈 곳이 없다.
  // 카피는 web invite/[token]/page.tsx 에러 상태와 정렬하고, 토큰화된 EmptyState/ErrorState +
  // 홈/재시도 CTA 로 dead-end 를 없앤다 (spec §B-3 #2·#3·#4).
  const goHome = () => router.replace("/home");
  const retryAccept = () => {
    acceptStartedRef.current = false;
    setError(null);
    setRetryNonce((n) => n + 1);
  };

  if (token === null) {
    return (
      <View style={styles.center}>
        <EmptyState
          title="유효하지 않은 초대"
          description="링크를 다시 확인해 주세요."
          action={<Button onPress={goHome}>홈으로</Button>}
        />
      </View>
    );
  }

  if (error === "accept_failed") {
    // 일시 실패 — 링크 재탭 대신 인앱 재시도로 accept RPC 를 다시 호출.
    return (
      <View style={styles.center}>
        <ErrorState
          title="참여에 실패했어요"
          description="네트워크 상태를 확인하고 다시 시도해 주세요."
          onRetry={retryAccept}
        />
      </View>
    );
  }

  if (error === "group_full") {
    // 정원 초과 — 재시도 무의미. 이미 멤버면 홈에서 서약서 확인 가능(web full 안내 정합).
    return (
      <View style={styles.center}>
        <EmptyState
          title="그룹이 가득 찼어요"
          description="이 그룹은 이미 4명이 참여 중이에요 (최대 인원). 이미 이 그룹 멤버라면 홈에서 새 서약서를 확인하고 서명할 수 있어요."
          action={<Button onPress={goHome}>홈으로 가기</Button>}
        />
      </View>
    );
  }

  if (error === "invalid_or_expired") {
    // 만료/없음 — 재시도 무의미하므로 홈 CTA 만.
    return (
      <View style={styles.center}>
        <EmptyState
          title="유효하지 않은 초대"
          description="만료되었거나 존재하지 않는 초대 링크예요. 그룹장에게 새 링크를 요청해 주세요."
          action={<Button onPress={goHome}>홈으로</Button>}
        />
      </View>
    );
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
      <Text style={[typography.body, styles.label]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    alignItems: "center",
    backgroundColor: colors.background,
    flex: 1,
    justifyContent: "center",
  },
  label: {
    color: colors.mutedForeground,
    marginTop: spacing.md,
  },
});
