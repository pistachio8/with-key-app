---
spec: 2026-05-26-kudos-cache-tags
title: Kudos cache tag 컨벤션 (Phase 3)
author: pistachio8
date: 2026-05-26
status: draft
---

## 목표

SNS cache plan v4 §Phase 3 — kudos 의 viewer-specific state 와 viewer-agnostic counts 를 별도 cacheTag 로 분리 관리해 toggle 후 flicker (1→0→1) 를 차단한다.

## 태그 컨벤션

| Layer        | 함수                                          | 디렉티브                                        | 태그                                    | 라이프                                    |
| ------------ | --------------------------------------------- | ----------------------------------------------- | --------------------------------------- | ----------------------------------------- |
| Viewer state | `getViewerKudosForLog(actionLogId, viewerId)` | `'use cache: private'` (`viewerCached` wrapper) | `user-${viewerId}-kudos-${actionLogId}` | `minutes`                                 |
| Counts       | `getKudosCountsForLog(actionLogId)`           | `'use cache'`                                   | `kudos-counts-${actionLogId}`           | `{stale:60, revalidate:300, expire:3600}` |

## 무효화 규칙 (`toggleKudos`)

```ts
// INSERT 또는 DELETE 분기 양쪽 동일 패턴
updateTag(`user-${user.id}-kudos-${actionLogId}`); // 본인 read-your-writes 즉시
updateTag(`kudos-counts-${actionLogId}`); // 본인 counts 즉시
revalidateTag(`kudos-counts-${actionLogId}`, "max"); // 타인 SWR (다음 fetch fresh)
```

근거:

- `updateTag` 는 **동기 invalidation** — Server Action 의 same-response 가 fresh tag 로 fetch.
- `revalidateTag(..., 'max')` 는 **future requests** 까지 fresh — 타인이 그룹 피드 다시 진입 시 새 counts 도착.
- 두 호출의 분리 이유: 본인은 즉시 own state 도 필요 (`updateTag` 가 둘 다 즉시), 타인은 own viewer-keyed tag 가 본인 mutate 와 무관해 invalidate 안 함 — counts 만 SWR.

## ChallengeFeed 동기화

이전 (Phase 0 hotfix): `settledItems` React local state + `useOptimistic` base. flicker 의 client 쪽 원인 — server response 도착 시 settledItems 와 props 의 mismatch.

본 phase: `settledItems` 제거 — `useOptimistic` 의 base 를 `items` props 직접 사용. transition 종료 시 server-rendered fresh items 로 자동 sync.

## 회귀 차단 시나리오 (E2E)

- **E2E #1 — Read-your-writes navigation (본 PR 동봉)**: 사용자가 다른 그룹원 글에 kudos 클릭 → `/me` 등 다른 page navigation → 브라우저 뒤로 → kudos pressed state 유지 assert.
- **E2E #2 — Tab navigation 보존 (후속 PR)**: 사용자가 글에 emoji 클릭 → `/challenge/[id]/dashboard` 탭 이동 → 다시 `/challenge/[id]` (feed) → 이모지 상태 유지 assert.
- **E2E #3 — 타인 SWR (후속 PR)**: A · B 두 세션 → B 가 A 글에 emoji → A page reload → counts 새 값 (SWR) 도착 assert.

## 미해결

- KudosBar 자체를 server component (`KudosSection`) 로 분리해 streaming Suspense 로 mount 하는 refactor 는 본 PR 범위 밖 — 후속 PR.
- `cacheLife` 의 정확한 값은 운영 데이터 부재 상태에서 보수적으로 설정. Phase 4·5 이후 분석 결과로 조정.

## 참고

- plan: [`docs/superpowers/plans/2026-05-26-sns-cache-strategy-blueprint.md`](../plans/2026-05-26-sns-cache-strategy-blueprint.md)
- ADR-0019: [`docs/adr/0019-cache-components-and-service-role-policy.md`](../../adr/0019-cache-components-and-service-role-policy.md)
- Phase 0 hotfix PR: #91
