---
spec: 2026-05-26-cache-phase5-my-challenges-tags
title: /me/challenges cache tag 컨벤션 (Phase 5-2)
author: pistachio8
date: 2026-05-26
status: draft
---

## 목표

SNS cache plan v4 §Phase 5 — `/me/challenges` 의 read 비용을 viewer-keyed private cache 로 절감.
mutation 시 read-your-writes 보장.

## 태그 컨벤션

| 함수                | 디렉티브               | tag                         | 라이프    |
| ------------------- | ---------------------- | --------------------------- | --------- |
| `fetchMyChallenges` | `'use cache: private'` | `user-${uid}-my-challenges` | `minutes` |

## 무효화 규칙

| 트리거                            | 호출                                                                                        |
| --------------------------------- | ------------------------------------------------------------------------------------------- |
| 본인 invite 수락 (`acceptInvite`) | `updateTag('user-${uid}-my-challenges')` + `updateTag('user-${uid}-home-feed')`             |
| 본인 leave (`leaveChallenge`)     | `updateTag('user-${uid}-my-challenges')`                                                    |
| 챌린지 status 변경 (close)        | 멤버 전원 `revalidateTag('user-${mid}-my-challenges','max')` (Sub-PR 5-4 cleanup 에서 일괄) |
| 챌린지 생성 (`createChallenge`)   | owner 본인 `updateTag('user-${ownerUid}-my-challenges')` (Sub-PR 5-4)                       |

본 PR 범위: owner-only `updateTag` 만. cross-viewer 처리는 Sub-PR 5-4 (cleanup) 에서 일괄.

## RLS 통과

`'use cache: private'` cookies-bound — viewer 의 RLS 정상 (`challenge_participants_select_self`).

## 참고

- plan: `docs/superpowers/plans/2026-05-26-cache-phase5-expansion.md`
- ADR-0019, ADR-0021
