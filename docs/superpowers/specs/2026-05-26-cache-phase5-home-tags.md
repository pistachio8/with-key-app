---
spec: 2026-05-26-cache-phase5-home-tags
title: /home cache tag 컨벤션 (Phase 5-1)
author: pistachio8
date: 2026-05-26
status: draft
---

## 목표

SNS cache plan v4 §Phase 5 — `/home` page 의 read 비용을 viewer-keyed private cache 로 절감.
mutation 시 read-your-writes 보장 + 타 viewer SWR.

## 태그 컨벤션

| 함수                      | 디렉티브               | tag                        | 라이프    |
| ------------------------- | ---------------------- | -------------------------- | --------- |
| `fetchCurrentChallenges`  | `'use cache: private'` | `user-${uid}-home-feed`    | `minutes` |
| `fetchMyDisplayName`      | `'use cache: private'` | `user-${uid}-display-name` | `hours`   |
| `hasEverCreatedChallenge` | `'use cache: private'` | `user-${uid}-has-created`  | `days`    |

## 무효화 규칙

| 트리거                                     | 호출                                                                                            |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| 본인 action_log INSERT (`submitActionLog`) | `updateTag('user-${uid}-home-feed')`                                                            |
| 본인 챌린지 join/leave                     | `updateTag('user-${uid}-home-feed')` + 기존 멤버 `revalidateTag('user-${mid}-home-feed','max')` |
| 본인 그룹 생성 (`createGroup`)             | `updateTag('user-${uid}-home-feed')`                                                            |
| 챌린지 status 변경 (start/close)           | 멤버 전원 `revalidateTag('user-${mid}-home-feed','max')`                                        |

`display-name` / `has-created` 는 빈도 ↓ + 라이프 ↑ 라 명시 invalidation 생략.

## RLS 통과

모든 read 가 `'use cache: private'` cookies-bound — viewer 의 RLS 정상.

## Inline directive 강제 (ADR-0021)

`viewerCached` wrapper 는 closure 캡처로 인한 prerender fail 때문에 deprecated.
본 plan 의 모든 read 는 inner `'use cache: private'` 함수 + outer thin wrapper 패턴.

## 참고

- plan: `docs/superpowers/plans/2026-05-26-cache-phase5-expansion.md`
- 패턴 원본: `docs/superpowers/specs/2026-05-26-feed-read-decomposition.md` (Phase 4)
- ADR-0019, ADR-0021
