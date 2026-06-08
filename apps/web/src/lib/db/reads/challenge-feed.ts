import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getKudosCountsForLog } from "@/lib/db/reads/kudos-counts";
import { getViewerKudosForLog } from "@/lib/db/reads/kudos-viewer";
import { getActionLogHydrate } from "@/lib/db/reads/action-log-hydrate";
import { getActionLogPhotoSignedUrl } from "@/lib/db/reads/photo-signed-url";
import { listVisibleActionLogIds } from "@/lib/db/reads/list-visible-action-log-ids";
import { KUDOS_EMOJIS, type KudosEmoji } from "@withkey/domain";

export type FeedItemView = {
  id: string;
  authorId: string;
  authorName: string;
  photoSignedUrl: string | null;
  summary: string;
  keywords: ReadonlyArray<string>;
  kudosByEmoji: Readonly<Record<KudosEmoji, number>>;
  viewerKudos: ReadonlyArray<KudosEmoji>;
  createdAt: string;
};

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
    if (ids.length === 0) return [];

    // 각 id 별로 hydrate + photo + counts + viewer kudos 병렬 fetch.
    const items = await Promise.all(
      ids.map(async (id) => {
        const hydrate = await getActionLogHydrate(id, viewerId);
        if (!hydrate) return null;

        const [photoSignedUrl, counts, viewerKudos] = await Promise.all([
          getActionLogPhotoSignedUrl(hydrate.photoPath, viewerId),
          getKudosCountsForLog(id),
          getViewerKudosForLog(id, viewerId),
        ]);

        return {
          id: hydrate.id,
          authorId: hydrate.authorId,
          authorName: hydrate.authorName,
          photoSignedUrl,
          summary: hydrate.summary,
          keywords: hydrate.keywords,
          kudosByEmoji: counts ?? emptyKudosByEmoji(),
          viewerKudos,
          createdAt: hydrate.createdAt,
        } satisfies FeedItemView;
      }),
    );

    return items.filter((item): item is FeedItemView => item !== null);
  },
);
