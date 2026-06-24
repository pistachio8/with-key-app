// read-contracts/feed — 챌린지 피드 view-model 계약 (EVAL-0016 · ADR-0036 §1 · ADR-0037).
// feed 계열 read 5개(challenge-feed + admin hydrate 4종)는 RN 에서 BFF `GET /api/feed`(Bearer)
// 단일 endpoint 로만 노출된다 — admin hydrate read 는 mobile 에 직접 노출 금지.
// 본 zod 스키마가 그 HTTP 계약의 응답 SoT 다 (transport-중립: BFF 호스트 이전 시에도 동일 계약).
import { z } from "zod";
import { kudosEmojiSchema, type KudosEmoji } from "../validators/kudos";

export type FeedItemView = {
  id: string;
  authorId: string;
  authorName: string;
  photoSignedUrl: string | null;
  // 영상 인증(media_type='video')일 때만 채워진다(spec §C2 / EVAL-0043). 사진 인증은 null.
  // photoSignedUrl 과 상호배타 — 둘 다 viewer-agnostic pre-signed URL(action-videos RLS).
  videoSignedUrl: string | null;
  summary: string;
  keywords: ReadonlyArray<string>;
  kudosByEmoji: Readonly<Record<KudosEmoji, number>>;
  viewerKudos: ReadonlyArray<KudosEmoji>;
  // 🟨 익명 피어 반려(ADR-0038). 카운트만 — 누가 눌렀는지는 절대 싣지 않는다(익명성).
  // viewerRejected 는 본인 행 존재 여부(본인의 read-your-writes·토글 표시용).
  peerRejectCount: number;
  viewerRejected: boolean;
  // 🟨 과반 반려로 무효 처리됨(action_logs.auto_verify_status='peer_rejected').
  // UI 무효 표시 전용 — status enum 전체가 아니라 boolean 만 노출(외과적, ADR-0038).
  isPeerRejected: boolean;
  createdAt: string;
};

// z.record(enum) 은 키 누락을 런타임에 잡지 못해(타입만 전체 키) 이모지 키를 명시한다.
const kudosByEmojiSchema = z.object({
  "🔥": z.number(),
  "💪": z.number(),
  "👏": z.number(),
});

export const feedItemViewSchema: z.ZodType<FeedItemView> = z.object({
  id: z.string(),
  authorId: z.string(),
  authorName: z.string(),
  photoSignedUrl: z.string().nullable(),
  videoSignedUrl: z.string().nullable(),
  summary: z.string(),
  keywords: z.array(z.string()),
  kudosByEmoji: kudosByEmojiSchema,
  viewerKudos: z.array(kudosEmojiSchema),
  peerRejectCount: z.number(),
  viewerRejected: z.boolean(),
  isPeerRejected: z.boolean(),
  createdAt: z.string(),
});

// BFF `GET /api/feed?challengeId=` 응답 본문 = FeedItemView[].
export const feedResponseSchema: z.ZodType<FeedItemView[]> = z.array(feedItemViewSchema);
