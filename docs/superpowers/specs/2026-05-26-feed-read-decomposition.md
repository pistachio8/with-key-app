---
spec: 2026-05-26-feed-read-decomposition
title: Feed read 분해 (Phase 4) — Layer 1·2 cache tag 컨벤션
author: pistachio8
date: 2026-05-26
status: draft
---

## 목표

SNS cache plan v4 §Phase 4 — `fetchChallengeFeed` 단일 함수의 fetch 책임을 다섯 read 함수의 합성으로 분해하고, 각 layer 별 cacheTag 와 cacheLife 를 분리해 적용한다.

## 함수 그래프

```
fetchChallengeFeed(challengeId, viewerId)
  │
  ├─► listVisibleActionLogIds(challengeId, viewerId)
  │     └─► getVisibilityVersion(challengeId)  // Phase 2 read
  │
  └─► for each id (병렬):
        ├─► getActionLogHydrate(id, viewerId)
        ├─► getActionLogPhotoSignedUrl(photoPath, viewerId)
        ├─► getKudosCountsForLog(id)            // Phase 3 read
        └─► getViewerKudosForLog(id, viewerId)  // Phase 3 read
```

## 태그 컨벤션

| Layer           | 함수                         | 디렉티브               | 태그                                                                     | 라이프                                    |
| --------------- | ---------------------------- | ---------------------- | ------------------------------------------------------------------------ | ----------------------------------------- |
| 1. Visibility   | `listVisibleActionLogIds`    | `'use cache: private'` | `user-${viewerId}-feed-${challengeId}-v${visibilityVersion}`             | `minutes`                                 |
| 2. Hydration    | `getActionLogHydrate`        | `'use cache: private'` | `user-${viewerId}-actionlog-${actionLogId}` + `actionlog-${actionLogId}` | `hours`                                   |
| 2. Photo URL    | `getActionLogPhotoSignedUrl` | `'use cache: private'` | `user-${viewerId}-photo-${path}` + `photo-${path}`                       | `{stale:540, revalidate:480, expire:600}` |
| 3. Counts       | `getKudosCountsForLog`       | `'use cache'`          | `kudos-counts-${actionLogId}`                                            | `{stale:60, revalidate:300, expire:3600}` |
| 3. Viewer kudos | `getViewerKudosForLog`       | `'use cache: private'` | `user-${viewerId}-kudos-${actionLogId}`                                  | `minutes`                                 |

## 무효화 규칙

| 트리거                                               | 호출                                                                                                                                                              |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 멤버십 변경 (`challenge_participants` INSERT/DELETE) | DB trigger `bump_challenge_visibility` 가 `visibility_version` 증분 → 다음 list fetch 시 새 tag 생성 → 자동 invalidation                                          |
| action_log 편집/삭제                                 | `revalidateTag('actionlog-${id}', 'max')` — viewer-agnostic tag 사용. (KO: viewer-keyed `user-*-actionlog-${id}` 는 동일 tag 안 invalidate 보장 X 한계 — 후속 PR) |
| kudos toggle (Phase 3)                               | `updateTag('user-${uid}-kudos-${alid}')` + `updateTag('kudos-counts-${alid}')` + `revalidateTag('kudos-counts-${alid}', 'max')`                                   |
| 사진 path 변경 (편집)                                | `revalidateTag('photo-${oldPath}', 'max')` (현 PR 범위 밖 — 사진 편집 기능 부재)                                                                                  |

## 외부 shape 불변

`fetchChallengeFeed(challengeId, viewerId, options?)` 의 시그니처와 `FeedItemView` 모두 그대로. 호출처 (`ChallengeFeed`, `feed-tab.tsx`) 무영향.

`options.client` 는 deprecated — 자식 함수들이 자체 createClient 호출 (cookies 기반). caller 컴파일 호환을 위해 시그니처만 유지.

## RLS 통과 전략

모든 자식 함수가 `'use cache: private'` 으로 cookies-bound — viewer 의 RLS 가 정상 작동. `'use cache'` (public) 가 적용된 `getKudosCountsForLog` 만 예외 (kudos 테이블 RLS 가 anon select 허용 한정 — anon 으로도 모든 emoji count 조회 가능, 그러나 emoji 만 select 라 데이터 노출 없음).

## 미해결 / 후속

- **Viewer-agnostic actionlog hydration**: 현재 `'use cache: private'` 으로 viewer 마다 동일 row 의 별도 cache (낭비). action_logs RLS 의 anon-readable subset 도입 또는 admin client + 추가 가드로 개선 가능 — service-role cache 금지 룰 (ADR-0019) 와의 정합 필요.
- **Integration test (`challenge-feed.spec.ts`)**: 기존 `asUser`-client 옵션이 무시되어 cookies 없는 환경에서 anon 으로 fetch — RLS 빈 결과. **본 PR 의 CI 에서 fail 가능성**. follow-up PR 에서 next/headers cookies mock 또는 별도 test fixture 로 해결.
- **사진 path 변경 시 invalidation**: 편집 기능 추가 시점에 처리.

## 참고

- plan: [`docs/superpowers/plans/2026-05-26-sns-cache-strategy-blueprint.md`](../plans/2026-05-26-sns-cache-strategy-blueprint.md) §Phase 4
- ADR-0019: [`docs/adr/0019-cache-components-and-service-role-policy.md`](../../adr/0019-cache-components-and-service-role-policy.md)
- ADR-0020: [`docs/adr/0020-visibility-version-trigger.md`](../../adr/0020-visibility-version-trigger.md)
- spec Phase 3: [`2026-05-26-kudos-cache-tags.md`](./2026-05-26-kudos-cache-tags.md)
