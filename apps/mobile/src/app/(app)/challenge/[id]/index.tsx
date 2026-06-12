// /challenge/[id] — 피드 탭 (EVAL-0017). id uuid 검증은 상위 _layout 에서 완료.
// detail 은 RN-safe(RLS) 직접 read, 피드는 BFF GET /api/feed(Bearer) 단일 표면 (ADR-0037).
// RLS 경계: 비멤버는 detail 이 null(또는 BFF 401/403) — 접근 안내만 보이고 크래시 없음.
import {
  challengePhase,
  formatFeedTimestamp,
  type ChallengeDetailView,
  type FeedItemView,
} from "@withkey/domain";
import { useLocalSearchParams } from "expo-router";
import { useCallback } from "react";
import { FlatList, RefreshControl, StyleSheet, Text, View } from "react-native";

import { useSession } from "@/features/auth";
import { ChallengeScaffold, fetchChallengeDetail, StartChallengeCard } from "@/features/challenge";
import { fetchChallengeFeed, FeedCard } from "@/features/feed";
import { BffRequestError } from "@/services/api/bff-client";
import { PlaceholderScreen } from "@/shared/components/placeholder-screen";
import { LoadingScreen, ReadErrorScreen } from "@/shared/components/screen-states";
import { useAsyncRead } from "@/shared/hooks/use-async-read";
import { colors } from "@/shared/theme/colors";

type FeedScreenData = {
  detail: ChallengeDetailView | null;
  feed: FeedItemView[];
  feedError: unknown;
};

export default function ChallengeFeedScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const id = Array.isArray(params.id) ? params.id[0]! : params.id;
  const { session } = useSession();
  const viewerId = session?.user.id ?? null;

  const read = useCallback(async (): Promise<FeedScreenData> => {
    const detail = await fetchChallengeDetail(id);
    if (detail === null) return { detail: null, feed: [], feedError: null };
    const phase = challengePhase(detail.status, detail.endAt);
    // 시작 전(pending/accepted)에는 인증 로그가 존재할 수 없으므로 피드를 조회하지 않는다.
    if (phase === "pending" || phase === "accepted") {
      return { detail, feed: [], feedError: null };
    }
    // 피드 실패는 detail 까지 버리지 않는다 — 헤더는 유지하고 피드 영역만 에러 표시.
    try {
      const feed = await fetchChallengeFeed(id);
      return { detail, feed, feedError: null };
    } catch (feedError) {
      return { detail, feed: [], feedError };
    }
  }, [id]);

  const { state, refreshing, reload, refresh } = useAsyncRead(read);

  if (state.status === "loading") return <LoadingScreen />;
  if (state.status === "error") return <ReadErrorScreen onRetry={reload} />;
  if (state.data.detail === null) {
    // RLS 가 비멤버를 차단하면 row 없음과 동일하게 null — 존재 여부를 구분해 노출하지 않는다.
    return (
      <PlaceholderScreen
        title="챌린지를 찾을 수 없어요"
        lines={["참여 중인 챌린지가 아니거나 삭제된 챌린지예요."]}
      />
    );
  }

  const { detail, feed, feedError } = state.data;
  const phase = challengePhase(detail.status, detail.endAt);
  const showFeedSection = phase === "running" || phase === "over" || phase === "closed";

  // 운영자 시작 카드 (EVAL-0018 · web (tabs)/layout.tsx 와 동일 조건):
  // owner && status==='pending' && 본인 서명 완료. 강제는 RPC(0039)가 담당.
  const me = detail.members.find((m) => m.id === viewerId);
  const signedCount = detail.members.filter((m) => m.signed).length;
  const showStartCard =
    viewerId === detail.group.ownerId && detail.status === "pending" && (me?.signed ?? false);

  // 상대 시간 label 은 시점 의존 — render 시점 now 1회로 계산해 카드에 주입 (web 동일).
  const now = new Date();

  return (
    <ChallengeScaffold active="feed" challengeId={id} detail={detail}>
      {!showFeedSection ? (
        <View style={styles.preStart}>
          {showStartCard && (
            <StartChallengeCard
              challengeId={id}
              onStarted={reload}
              signedCount={signedCount}
              unsignedCount={detail.members.length - signedCount}
            />
          )}
          <View style={styles.notice}>
            <Text style={styles.noticeText}>
              아직 시작 전이에요. 모두 서명하면 챌린지가 시작돼요.
            </Text>
          </View>
        </View>
      ) : feedError != null ? (
        <View style={styles.notice}>
          <Text style={styles.noticeText}>
            {feedError instanceof BffRequestError &&
            (feedError.status === 401 || feedError.status === 403)
              ? "피드를 볼 수 있는 권한이 없어요."
              : "피드를 불러오지 못했어요. 아래로 당겨 새로고침해 주세요."}
          </Text>
        </View>
      ) : (
        <FlatList
          contentContainerStyle={styles.listContent}
          data={feed}
          keyExtractor={(item) => item.id}
          ItemSeparatorComponent={Separator}
          ListEmptyComponent={
            <Text style={styles.emptyText}>아직 인증이 없어요. 첫 번째 인증을 올려보세요.</Text>
          }
          ListHeaderComponent={
            phase === "running" ? <TodaySummary detail={detail} feed={feed} now={now} /> : null
          }
          refreshControl={
            <RefreshControl onRefresh={() => void refresh()} refreshing={refreshing} />
          }
          renderItem={({ item }) => (
            <FeedCard
              item={item}
              participantCount={detail.participantCount}
              timestampLabel={formatFeedTimestamp(item.createdAt, now)}
              viewerId={viewerId}
            />
          )}
        />
      )}
    </ChallengeScaffold>
  );
}

// 오늘 인증 현황 한 줄 — web TodayBanner 의 단순화 (KST 가 아닌 기기 로컬 일자 기준은
// web FeedSection isSameLocalDay 와 동일 기준).
function TodaySummary({
  detail,
  feed,
  now,
}: {
  detail: ChallengeDetailView;
  feed: readonly FeedItemView[];
  now: Date;
}) {
  const todayAuthorIds = new Set(
    feed.filter((f) => isSameLocalDay(f.createdAt, now)).map((f) => f.authorId),
  );
  return (
    <Text style={styles.todaySummary}>
      오늘 {todayAuthorIds.size}/{detail.participantCount}명 인증 완료
    </Text>
  );
}

function isSameLocalDay(iso: string, now: Date): boolean {
  const d = new Date(iso);
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

function Separator() {
  return <View style={styles.separator} />;
}

const styles = StyleSheet.create({
  listContent: {
    paddingBottom: 32,
    paddingHorizontal: 16,
  },
  separator: {
    height: 10,
  },
  todaySummary: {
    color: colors.textSubtle,
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 10,
  },
  emptyText: {
    color: colors.textMuted,
    fontSize: 14,
    paddingVertical: 24,
    textAlign: "center",
  },
  preStart: {
    gap: 12,
  },
  notice: {
    marginHorizontal: 16,
  },
  noticeText: {
    backgroundColor: colors.muted,
    borderRadius: 12,
    color: colors.textSubtle,
    fontSize: 14,
    overflow: "hidden",
    padding: 16,
  },
});
