---
plan: 2026-05-26-sns-cache-strategy-blueprint
title: SNS Cache Strategy Blueprint — Cache Components 도입 청사진
author: pistachio8
date: 2026-05-26
status: draft
---

## 목표

with-key 의 SNS-적 표면(kudos · 이모지 · feed · dashboard) 에서 **본인 액션 즉시성(read-your-writes) 보장** + **타인 액션은 SWR 로 자연스럽게 수렴** + **읽기 비용 절감** 을 동시에 달성한다.

진단된 두 회귀:

1. kudos 클릭 → 다른 페이지로 navigation → 뒤로 가기 시 누른 상태가 사라짐
2. B 가 A 의 글에 이모지 → 같은 layout 안 다른 탭(dashboard · info) 이동 후 복귀 시 이모지가 사라짐

근본 원인은 (a) `toggleKudos` Server Action 의 `revalidatePath` 누락 + (b) `useOptimistic` state 가 서버 props 로 커밋되지 않음 + (c) Next.js Router Cache 의 stale RSC payload 재사용. 셋이 합쳐진 결과.

본 plan 은 Phase 0 hotfix(완료, PR #91) 이후의 **Phase 1~4 청사진 SoT** 다.

## 영향 범위

- 변경 경로:
  - `next.config.ts` (`cacheComponents: true`)
  - `src/lib/cache/private.ts` (신규 — `viewerCached` wrapper)
  - `src/lib/db/reads/visibility-version.ts` (신규)
  - `src/lib/db/reads/{kudos-counts,kudos-viewer,action-log-hydrate,list-visible-action-log-ids,photo-signed-url}.ts` (신규)
  - `src/lib/db/reads/challenge-feed.ts` (분해 후 deprecate 또는 thin re-export)
  - `src/app/(app)/challenge/[id]/_actions.ts` (`toggleKudos`: `revalidatePath` → `updateTag` + `revalidateTag(..., 'max')`)
  - `src/app/(app)/challenge/[id]/_components/challenge-feed.tsx` · `feed-card.tsx` (props 분리)
  - `src/app/(app)/challenge/[id]/(tabs)/page.tsx` (정적 셸 + `<Suspense>` 경계 도입)
  - `package.json` (`"next": "16.0.x"` minor pin)
  - `.claude/AGENTS.md` (§Supabase·캐시 룰 추가 — service-role cache 금지)
- 데이터/RLS 영향:
  - `supabase/migrations/00XX_visibility_version.sql` — `challenges.visibility_version BIGINT NOT NULL DEFAULT 0` 컬럼 + `challenge_participants` INSERT/DELETE trigger 로 자동 증분. RLS 신규/변경 **없음**
- 외부 서비스: 없음 (Vercel · Supabase 기존 구성 유지)
- 재사용 후보:
  - `src/lib/validators/kudos.ts` (KUDOS_EMOJIS · 스키마)
  - 기존 `React.cache` 사용 read 함수 (`fetchChallengeDetail` 등) — 분해 시 그 안의 SELECT 로직 그대로 이전

## 진단 (그릴링 결과 요약)

| 원인 layer                           | 현재 상태                                                                             | 두 이슈에 미치는 영향                                 |
| ------------------------------------ | ------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| Server Data Cache + Full Route Cache | `toggleKudos` 에 `revalidatePath` 없음                                                | 다음 server render 가 stale (#1 #2 직접 원인)         |
| Client-side useOptimistic            | optimistic state 가 `settledItems` React local state 로만 commit, 서버 props 미동기화 | navigation unmount/mount 시 사라짐 (#1 #2 보조 원인)  |
| Client Router Cache                  | 뒤로가기·탭 복귀 시 prefetched RSC payload 그대로 재사용                              | 서버가 fresh 라도 client 가 stale 표시 (#2 직접 원인) |
| BFCache                              | Next.js 캐시 외부, 외부 URL → 뒤로 시나리오에서만 변수                                | #1 변형 시나리오의 가설 변수                          |

## 신선도 모델 결정

**"피드 목록은 거의 실시간처럼 보이되, Next 캐시는 읽기 비용을 줄이는 보조 레이어로만 사용. 본인이 방금 한 액션은 반드시 read-your-writes 로 보장."**

비교한 모델:

- A. Navigation = Fresh (모든 navigation 시 서버 fetch) — 서버 부하 ↑
- B. Mutate-driven Invalidation (현재) — revalidate 누락 = 버그 (현재 두 이슈가 그 실패 사례)
- C. Supabase Realtime — POC 범위 초과
- **D. 캐시 가능성을 분류 정책으로 정의 (채택)** — RLS 가드레일 유지 + Next.js 16 Cache Components 활용

## 5-Layer 분류 정책

| Layer                    | 대상                                                          | 캐시 전략                                                                                                       | 무효화                                                                  |
| ------------------------ | ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| 1. Visibility Decision   | "어떤 action_log id 가 이 사용자에게 보이는가"                | `'use cache: private'` + viewer-keyed tag (`user-${uid}-feed-${cid}-v${visibilityVersion}`)                     | `visibility_version` 증분(자동)                                         |
| 2. Content Hydration     | action_log 본문(텍스트·photo_path·AI summary·키워드·작성자명) | `'use cache: private'` + actionlog-keyed tag (`actionlog-${alid}`)                                              | `updateTag('actionlog-...')` (편집/삭제 시)                             |
| 3. Viewer-specific State | viewerKudos · unread-kudos · mySigned 등                      | `'use cache: private'` + user-keyed tag (`user-${uid}-kudos-${alid}`) + counts 는 별도 (`kudos-counts-${alid}`) | 본인 mutate 시 `updateTag` + 타인 영향 부분 `revalidateTag(..., 'max')` |
| 4. Visibility Version    | `challenges.visibility_version` 컬럼                          | DB-level (trigger)                                                                                              | 멤버십 INSERT/DELETE 시 자동 증분                                       |
| 5. Service-role Cache    | adminClient 결과                                              | **금지** (cron worker + 공개 데이터만 예외)                                                                     | —                                                                       |

## Anchor 결정

- **`cacheComponents: true`** 활성화 — `<Activity hidden>` 로 navigation 시 client state 보존 → 이슈 #2 자체 완화 효과
- **`'use cache: private'`** (experimental, v16.0) 수용
- **`src/lib/cache/private.ts`** 단일 wrapper 로 격리 — drop·rename·API 변경 시 한 파일만 수정
- **ADR-XXXX-cache-components-and-service-role-policy** 작성 — 본 청사진의 룰 명문화
- **`"next": "16.0.x"`** minor pin — 자동 minor upgrade 차단
- **`.claude/AGENTS.md`** 에 §캐시·changelog 룰 추가

근거: `'use cache'` 자체가 v15.0 experimental → v16.0 stable promotion 의 직전 사례. drop 가능성은 낮고 rename·동작 변경 가능성이 중간. wrapper 격리로 mitigation 충분.

## 작업 단계

### Phase 0 — Hotfix (완료)

- `toggleKudos` 에 `revalidatePath('/challenge/${id}', 'layout')` 양 분기 추가
- PR #91 (https://github.com/pistachio8/with-key-app/pull/91)
- 본 청사진의 Phase 3 가 도착하면 `revalidatePath` 호출은 `updateTag` + `revalidateTag` 로 교체

### Phase 1 — Foundation (반나절)

1. `next.config.ts` 에 `cacheComponents: true` 추가 — 검증: `pnpm typecheck && pnpm lint && pnpm build`
2. `src/lib/cache/private.ts` — `viewerCached(fn, {tag, life})` wrapper. 'use cache: private' + cacheTag + cacheLife 묶음 — 검증: 단위 테스트(스모크)
3. `package.json` 에 `"next": "16.0.x"` pin — 검증: `pnpm install --frozen-lockfile`
4. `.claude/AGENTS.md` §캐시 룰 추가 (service-role cache 금지 · `viewerCached` 사용 컨벤션 · next 마이너 changelog 확인 룰) — 검증: `pnpm validate:docs`
5. `docs/adr/00XX-cache-components-and-service-role-policy.md` 작성 — 검증: `pnpm validate:docs`

### Phase 2 — Visibility Version (반나절)

1. `supabase/migrations/00XX_visibility_version.sql` — 컬럼 + trigger
   - `ALTER TABLE challenges ADD COLUMN visibility_version BIGINT NOT NULL DEFAULT 0`
   - `CREATE FUNCTION bump_challenge_visibility() RETURNS TRIGGER ...`
   - `CREATE TRIGGER ... AFTER INSERT OR DELETE ON challenge_participants ...`
2. `src/lib/db/reads/visibility-version.ts` — `getVisibilityVersion(challengeId)` (admin 또는 user-bound). 캐시 키 인자 전용 → `cacheTag` 자체로 invalidation 불필요
3. ADR-XXXX-visibility-version-trigger 작성
4. 검증: `pnpm supabase db reset` + 역할별(anon · authenticated) 접근 테스트 + integration test 추가(멤버 INSERT/DELETE 시 increment 확인)

### Phase 3 — Layer 3 kudos (1일, 두 이슈 fix)

1. `src/lib/db/reads/kudos-counts.ts` — `getKudosCountsForLog(actionLogId)` (viewer-agnostic) + tag `kudos-counts-${alid}`
2. `src/lib/db/reads/kudos-viewer.ts` — `getViewerKudosForLog(actionLogId, viewerId)` + tag `user-${uid}-kudos-${alid}`
3. `_actions.ts/toggleKudos`:
   - `revalidatePath` 제거 (Phase 0 hotfix 부분)
   - `updateTag('user-${user.id}-kudos-${alid}')` (본인 read-your-writes)
   - `updateTag('kudos-counts-${alid}')` (본인 counts 즉시)
   - `revalidateTag('kudos-counts-${alid}', 'max')` (타인 SWR)
4. `ChallengeFeed` props 분리 — `viewerKudos` · `kudosByEmoji` 를 별도 자식 컴포넌트로 streaming Suspense
5. spec: `docs/superpowers/specs/2026-MM-DD-kudos-cache-tags.md` (태그 컨벤션)
6. 검증: `pnpm test` + integration test(toggle → tag invalidation 확인) + E2E (두 이슈 회귀 시나리오)

### Phase 4 — Layer 1·2 feed (1.5일)

1. `src/lib/db/reads/list-visible-action-log-ids.ts` — viewer-keyed, visibility_version 포함
2. `src/lib/db/reads/action-log-hydrate.ts` — actionlog-keyed (viewer-agnostic)
3. `src/lib/db/reads/photo-signed-url.ts` — photo path 해시 keyed, `cacheLife({stale: 600, ...})` (Supabase signed URL 만료 정합)
4. `fetchChallengeFeed` 를 위 3 함수의 합성으로 재정의 (또는 deprecate + 호출처 직접 합성)
5. `(tabs)/page.tsx` 에 정적 셸 + `<Suspense>` 경계 도입 — 피드 데이터 fetch 가 셸 prerender 를 막지 않도록
6. spec: `docs/superpowers/specs/2026-MM-DD-feed-read-decomposition.md`
7. 검증: `pnpm test` + `pnpm build` (정적 셸 prerender 확인) + 모바일 viewport 수동 + E2E smoke

### Phase 5 — 확대 (2~3일, 별도 plan 으로 분리 가능)

`/home` · `/me/challenges` · `/group/[id]` 같은 SNS 표면에 동일 패턴 적용. Phase 4 패턴 재사용.

## 검증

```bash
# 각 Phase 공통
pnpm typecheck
pnpm lint
pnpm test
pnpm validate:docs

# Phase 1 추가
pnpm build

# Phase 2 추가
pnpm supabase db reset

# Phase 3 · 4 추가 (Supabase 환경 필요 — CI 또는 로컬 db)
pnpm test:integration
pnpm test:e2e
```

수동 확인 항목:

- [ ] 모바일 viewport: kudos toggle → 다른 탭 이동 → 복귀 시 누른 상태 유지 (두 이슈 회귀)
- [ ] 모바일 viewport: A 가 글 → B 가 이모지 → B 가 탭 이동 후 복귀 → 이모지 유지
- [ ] migration 재적용 후 RLS 접근 회귀 없음
- [ ] Vercel Preview 빌드 성공 (`cacheComponents: true` runtime 동작)

## 리스크 / 미해결

| 리스크                                                                                    | 등급                       | 대응                                                                       |
| ----------------------------------------------------------------------------------------- | -------------------------- | -------------------------------------------------------------------------- |
| `'use cache: private'` 가 v16.x 마이너에서 API/동작 변경                                  | 중                         | `viewerCached` wrapper 격리 + minor pin + AGENTS.md changelog 룰           |
| `'use cache: private'` drop                                                               | 낮음 (history 근거)        | wrapper 한 곳만 교체. 최악의 경우 React.cache + 명시 invalidation 로 회귀  |
| `cacheComponents: true` 활성화로 Vercel runtime 동작 변경 (`<Activity>` · prerender 분리) | 중                         | Phase 1 에서 `pnpm build` + Preview 배포 후 dogfood 확인                   |
| `visibility_version` trigger 성능 영향                                                    | 낮음 (멤버 변경 빈도 작음) | EXPLAIN ANALYZE + integration test                                         |
| Phase 3 · 4 가 분리되어 머지 사이에 stale 화면 노출                                       | 낮음                       | Phase 0 hotfix 가 임시 차단 중                                             |
| Service-role cache 금지 룰을 우회한 패턴이 PR 에 섞여 들어옴                              | 중                         | AGENTS.md 명문화 + 코드 리뷰 체크리스트 + 선택적 ESLint custom rule (후속) |
| Supabase signed URL 만료 시간(현재 1시간) 과 `photo-signed-url` cacheLife 불일치          | 중                         | Phase 4 cacheLife 를 만료 - margin (50분) 으로 보수 설정                   |

## 참고

- 본 청사진은 2026-05-26 그릴링 세션의 합의 결과
- Phase 0 PR: #91 (fix/kudos-revalidate-on-toggle)
- 인접 plan: `2026-04-30-kudos-feed-mount.md`, `2026-05-22-kudos-received-notification.md`, `2026-05-22-challenge-revalidate-and-header-cleanup.md`
- Next.js 16 docs 근거: `node_modules/next/dist/docs/01-app/03-api-reference/01-directives/use-cache.md`, `use-cache-private.md`, `04-functions/updateTag.md`, `04-functions/cacheLife.md`, `05-config/01-next-config-js/cacheComponents.md`
