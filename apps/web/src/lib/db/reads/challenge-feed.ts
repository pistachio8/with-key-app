import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getKudosCountsForLog } from "@/lib/db/reads/kudos-counts";
import { getViewerKudosForLog } from "@/lib/db/reads/kudos-viewer";
import { getPeerRejectCountForLog } from "@/lib/db/reads/peer-rejection-counts";
import { getViewerPeerRejectionForLog } from "@/lib/db/reads/peer-rejection-viewer";
import { getActionLogHydrate } from "@/lib/db/reads/action-log-hydrate";
import { getActionLogPhotoSignedUrl } from "@/lib/db/reads/photo-signed-url";
import { getActionLogVideoSignedUrl } from "@/lib/db/reads/video-signed-url";
import {
  listVisibleActionLogIds,
  readVisibleActionLogIds,
} from "@/lib/db/reads/list-visible-action-log-ids";
import { KUDOS_EMOJIS, type KudosEmoji, type FeedItemView } from "@withkey/domain";

// view-model 계약 SoT 는 @withkey/domain read-contracts — BFF `GET /api/feed` 응답 스키마와
// 동일 타입 (EVAL-0016 · ADR-0036 §1 · ADR-0037). 기존 호출처 호환을 위해 re-export 유지.
export type { FeedItemView };

// Phase 4 분해 후 deprecated: 자식 read 함수들은 자체적으로 supabase client 를 생성한다.
// Layer 1 은 user client(RLS), hydrate 단계(Layer 2/3)는 adminClient (ADR-0024).
// caller 호환 위해 시그니처는 유지하지만 무시된다.
// (호출처: integration test 의 asUser-client 시뮬레이션 등.)
type Options = {
  client?: SupabaseClient;
};

function emptyKudosByEmoji(): Record<KudosEmoji, number> {
  return Object.fromEntries(KUDOS_EMOJIS.map((emoji) => [emoji, 0])) as Record<KudosEmoji, number>;
}

// PRD §7 · BE_SCHEMA §5.7 — 챌린지 피드.
// Phase 4 (SNS cache plan v4): list-visible-action-log-ids + action-log-hydrate +
// photo-signed-url + kudos-counts + kudos-viewer 다섯 함수의 합성.
//
// - Layer 1 (Visibility Decision): listVisibleActionLogIds — viewer-keyed, RLS user client (gate)
// - Layer 2 (Content Hydration): getActionLogHydrate — actionlog-keyed, adminClient + public cache
// - Layer 2 (Photo Signed URL): getActionLogPhotoSignedUrl — path-keyed, adminClient, 10분 stale
// - Layer 3 (Viewer State): getKudosCountsForLog (viewer-agnostic) · getViewerKudosForLog (viewer-specific)
//
// 외부 shape (FeedItemView) 는 그대로 유지 — 호출처 (ChallengeFeed · feed-tab) 무영향.
// 접근 제어: Layer 1 (RLS) 이 비멤버에게 빈 ID 리스트를 반환 → hydrate 단계는 그 ID 안에서만
// adminClient 로 호출된다 (ADR-0024). 즉 이 함수가 admin hydrate read 의 유일한 production callsite.
export const fetchChallengeFeed = cache(
  async (
    challengeId: string,
    viewerId: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _options: Options = {},
  ): Promise<FeedItemView[]> => {
    const ids = await listVisibleActionLogIds(challengeId, viewerId);
    return hydrateFeedItems(ids, viewerId);
  },
);

// Bearer(BFF /api/feed) 경로 — RN 전용 (ADR-0036 §1·§2, EVAL-0016 에서 모양 확정).
// Layer 1 을 호출자가 주입한 token 기반 RLS user client 로 실행한다(admin 대체 금지).
// cookie 전제의 `use cache: private`(listVisibleActionLogIds inner)는 Route Handler 에서
// 불가하므로 비캐시 Layer 1 — RN 측 캐싱은 TanStack Query 담당. hydrate 단계의
// public cache 는 web 과 그대로 공유된다.
export async function fetchChallengeFeedForViewerClient(
  viewerClient: SupabaseClient,
  challengeId: string,
  viewerId: string,
): Promise<FeedItemView[]> {
  const ids = await readVisibleActionLogIds(viewerClient, challengeId);
  return hydrateFeedItems(ids, viewerId);
}

// Layer 2/3 합성 — Layer 1 이 거른 ID 안에서만 admin hydrate 를 호출한다 (ADR-0024 contract).
async function hydrateFeedItems(
  ids: ReadonlyArray<string>,
  viewerId: string,
): Promise<FeedItemView[]> {
  if (ids.length === 0) return [];

  // 각 id 별로 hydrate + photo + counts + viewer kudos 병렬 fetch.
  const items = await Promise.all(
    ids.map(async (id) => {
      const hydrate = await getActionLogHydrate(id, viewerId);
      if (!hydrate) return null;

      const [photoSignedUrl, videoSignedUrl, counts, viewerKudos, peerRejectCount, viewerRejected] =
        await Promise.all([
          getActionLogPhotoSignedUrl(hydrate.photoPath, viewerId),
          // 영상 인증만 video signed URL(media_type='video'). 사진 인증은 null (상호배타).
          getActionLogVideoSignedUrl(
            hydrate.mediaType === "video" ? hydrate.videoPath : null,
            viewerId,
          ),
          getKudosCountsForLog(id),
          getViewerKudosForLog(id, viewerId),
          getPeerRejectCountForLog(id),
          getViewerPeerRejectionForLog(id, viewerId),
        ]);

      return {
        id: hydrate.id,
        authorId: hydrate.authorId,
        authorName: hydrate.authorName,
        photoSignedUrl,
        videoSignedUrl,
        summary: hydrate.summary,
        keywords: hydrate.keywords,
        kudosByEmoji: counts ?? emptyKudosByEmoji(),
        viewerKudos,
        peerRejectCount,
        viewerRejected,
        isPeerRejected: hydrate.isPeerRejected,
        createdAt: hydrate.createdAt,
      } satisfies FeedItemView;
    }),
  );

  return items.filter((item): item is FeedItemView => item !== null);
}
