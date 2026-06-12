// 인증 피드 카드 (EVAL-0017 · web feed-card.tsx 패리티, read-only) —
// author/사진/키워드/AI 일기 요약/시간 + kudos 카운트 표시.
// kudos 토글·편집은 mutation(EVAL-0018+) — 여기서는 어떤 write 도 하지 않는다.
// 사진은 signed URL 만 소비(범위 외 private URL 없음), 로드 실패 시 placeholder 폴백.
import { KUDOS_EMOJIS, type FeedItemView } from "@withkey/domain";
import { useState } from "react";
import { Image, StyleSheet, Text, View } from "react-native";

import { colors } from "@/shared/theme/colors";

type Props = {
  item: FeedItemView;
  /** 시간 label 은 시점 의존이라 화면이 render 시점 now 로 계산해 주입 (web 동일 패턴). */
  timestampLabel: string;
  viewerId: string | null;
  /** 솔로(1명)면 kudos 카운트 줄 미렌더 — 본인 인증 셀프 kudos 없음 (PRD §7.3 AC-4 호응). */
  participantCount: number;
};

export function FeedCard({ item, timestampLabel, viewerId, participantCount }: Props) {
  const [imageFailed, setImageFailed] = useState(false);
  const isSelfAuthor = viewerId != null && item.authorId === viewerId;
  const kudosTotal = KUDOS_EMOJIS.reduce((sum, e) => sum + (item.kudosByEmoji[e] ?? 0), 0);
  const showKudos = participantCount >= 2 && kudosTotal > 0;

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.avatar}>
          <Text style={styles.avatarLabel}>{item.authorName.slice(0, 1)}</Text>
        </View>
        <Text style={styles.authorName}>
          {item.authorName}
          {isSelfAuthor && " (나)"}
        </Text>
        <Text style={styles.timestamp}>{timestampLabel}</Text>
      </View>

      {item.photoSignedUrl != null &&
        (imageFailed ? (
          <View
            accessibilityLabel={`${item.authorName}의 인증 사진을 불러오지 못했어요`}
            accessibilityRole="image"
            style={[styles.photo, styles.photoFallback]}
          >
            <Text style={styles.photoFallbackLabel}>사진을 불러오지 못했어요</Text>
          </View>
        ) : (
          <Image
            accessibilityLabel={`${item.authorName}의 인증 사진`}
            onError={() => setImageFailed(true)}
            resizeMode="cover"
            source={{ uri: item.photoSignedUrl }}
            style={styles.photo}
            testID={`feed-card-photo-${item.id}`}
          />
        ))}

      {item.keywords.length > 0 && (
        <View style={styles.keywordRow}>
          {item.keywords.map((k) => (
            <Text key={k} style={styles.keywordChip}>
              #{k}
            </Text>
          ))}
        </View>
      )}

      <Text style={styles.summary}>{item.summary}</Text>

      {showKudos && (
        <View style={styles.kudosRow}>
          {KUDOS_EMOJIS.filter((e) => (item.kudosByEmoji[e] ?? 0) > 0).map((e) => (
            <Text
              key={e}
              style={[styles.kudosChip, item.viewerKudos.includes(e) && styles.kudosChipMine]}
            >
              {e} {item.kudosByEmoji[e]}
            </Text>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: 14,
    borderWidth: 1,
    gap: 8,
    padding: 12,
  },
  header: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
  },
  avatar: {
    alignItems: "center",
    backgroundColor: colors.primarySoft,
    borderRadius: 999,
    height: 24,
    justifyContent: "center",
    width: 24,
  },
  avatarLabel: {
    color: colors.primary,
    fontSize: 11,
    fontWeight: "700",
  },
  authorName: {
    color: colors.textStrong,
    flex: 1,
    fontSize: 13,
    fontWeight: "600",
  },
  timestamp: {
    color: colors.textMuted,
    fontSize: 11,
  },
  photo: {
    aspectRatio: 16 / 9,
    borderRadius: 10,
    width: "100%",
  },
  photoFallback: {
    alignItems: "center",
    backgroundColor: colors.muted,
    justifyContent: "center",
  },
  photoFallbackLabel: {
    color: colors.textMuted,
    fontSize: 12,
  },
  keywordRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  keywordChip: {
    backgroundColor: colors.muted,
    borderRadius: 999,
    color: colors.textSubtle,
    fontSize: 11,
    overflow: "hidden",
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  summary: {
    color: colors.text,
    fontSize: 14,
    lineHeight: 20,
  },
  kudosRow: {
    flexDirection: "row",
    gap: 8,
  },
  kudosChip: {
    backgroundColor: colors.muted,
    borderRadius: 999,
    color: colors.textSubtle,
    fontSize: 12,
    overflow: "hidden",
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  kudosChipMine: {
    backgroundColor: colors.primarySoft,
    color: colors.primary,
  },
});
