---
spec: 2026-05-26-cache-phase5-group-detail-tags
title: /group/[id] cache tag 컨벤션 (Phase 5-3)
author: pistachio8
date: 2026-05-26
status: draft
---

## 목표

SNS cache plan v4 §Phase 5 — `/group/[id]` 의 read 비용을 viewer-keyed private cache 로 절감.
group mutation 시 owner 본인 즉시 fresh + 멤버 SWR.

## 태그 컨벤션

| 함수               | 디렉티브               | primary tag                | secondary tag  | 라이프    |
| ------------------ | ---------------------- | -------------------------- | -------------- | --------- |
| `fetchGroupDetail` | `'use cache: private'` | `user-${uid}-group-${gid}` | `group-${gid}` | `minutes` |

## 무효화 규칙

| 트리거                                    | 호출                                                                                          |
| ----------------------------------------- | --------------------------------------------------------------------------------------------- |
| 본인 그룹 이름 변경 (`renameGroup`)       | `updateTag('user-${uid}-group-${gid}')` + `revalidateTag('group-${gid}','max')` (타 멤버 SWR) |
| 본인 계좌 변경 (`updateGroupAccount`)     | `updateTag('user-${uid}-group-${gid}')` + `revalidateTag('group-${gid}','max')`               |
| 그룹 해체 (`deleteGroup`)                 | `revalidateTag('group-${gid}','max')` + owner `updateTag`                                     |
| 챌린지 생성/종료 (Sub-PR 5-4)             | `revalidateTag('group-${gid}','max')`                                                         |
| 멤버 변경 (`acceptInvite` 의 그룹 가입측) | 영향 멤버 `updateTag('user-${mid}-group-${gid}')` + `revalidateTag('group-${gid}','max')`     |

`fetchGroupDetail` 은 viewer-keyed (private cache) — RLS 가 비멤버 차단해도 cache 레벨에서 viewer 분리해 안전.
secondary tag `group-${gid}` 는 cross-viewer 일괄 SWR 용.

## viewer 식별

`fetchGroupDetail(groupId)` 시그니처 유지. outer wrapper 가 `auth.getUser()` 호출 → viewerId 를 inner 에 inject. unauth 면 `null` 반환.

## RLS 통과

`'use cache: private'` cookies-bound — `groups_select_member` · `gm_select_member` · `challenges_select_member` RLS 정상.

## 참고

- plan: `docs/superpowers/plans/2026-05-26-cache-phase5-expansion.md`
- ADR-0019, ADR-0021
