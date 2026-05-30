---
plan: 2026-05-30-challenge-derived-over
title: Challenge Derived Over — 종료 판정 시간 파생 SoT 통일 + auto-close
author: pistachio8
date: 2026-05-30
status: draft
---

> 설계 근거: [ADR-0027](../../adr/0027-derived-over-autoclose.md). 상위: [ADR-0026](../../adr/0026-challenge-end-boundary-kst-midnight.md).

## 목표

"챌린지가 끝났는가" 판정을 **시간 파생(`end_at <= now`) 단일 기준**으로 통일한다. 현재 홈·그룹·me·상세는 `status` 컬럼만 보아 만기가 지난 `active` 챌린지를 "D-0 · 진행 중"으로 잘못 표시한다(정산·게이트는 이미 시간 파생). 공유 헬퍼로 모든 결정 지점을 수렴시키고, `status`를 ~1일 내 truthful하게 만드는 auto-close를 기존 cron에 더해 0029 슬롯 점유 문제까지 해소한다.

## 영향 범위

분류 원칙은 [ADR-0027 §2](../../adr/0027-derived-over-autoclose.md) — **A) phase로 변환(표시·자격), B) status 유지(쓰기·권한)**. B는 건드리지 않는다.

- 신규:
  - `src/lib/challenge/lifecycle.ts` (+ `.spec.ts`) — `challengePhase`·`isChallengeOver`·`remainingDays`
  - `src/app/(app)/home/_components/settlement-pending-list.tsx`
- **A. phase로 변환 (표시·인증 자격):**
  - `src/lib/db/reads/current-challenges.ts` — `phase` 파생 노출 · `daysLeft`→`remainingDays`
  - `src/app/(app)/home/page.tsx` · `_components/running-challenge-list.tsx` · `_components/row-pending-indicator.tsx`
  - `src/app/(app)/layout.tsx` — FAB `activeChallenges` → `running`만 ★누락이었음
  - `src/lib/db/reads/active-challenge.ts` — `/action`·`/feed` 인증 대상 `running`만 · 공식 ★
  - `src/app/(app)/group/[id]/_components/group-challenges-list.tsx`
  - `src/app/(app)/me/challenges/_components/manage-card-list.tsx` 배지(over→"정산 대기"; canEnd 등 권한은 §B)
  - `src/app/(app)/challenge/[id]/(tabs)/layout.tsx` · `(tabs)/page.tsx` ★ · `(tabs)/dashboard/page.tsx` ★
  - `src/app/(app)/challenge/[id]/_components/status-card.tsx` · `dashboard-tab.tsx` ★ · `next-step-cta.tsx` ★ · `feed-tab.tsx` ★
  - `src/app/(app)/challenge/[id]/_actions.ts:42` (kudos 게이트 predicate → `isChallengeOver`)
  - `src/lib/db/reads/recap.ts:130` (SQL 필터 유지 + canonical 주석)
- **B. status 유지 (변환 금지 — 회귀 방지):** `group/[id]/page.tsx`(`hasOpenChallenge`=0029 미러) · `manage-card-list.tsx`/`challenge-owner-menu.tsx`(`canEnd`=운영자 종료 경로) · `my-challenges.ts deriveCounts`·`me/challenges/page.tsx` 버킷(운영 슬롯 limit — over 도 슬롯 점유) · `settlement.ts`(pot 게이트) · `action/_actions.ts:89-97`·`_actions.ts:148-157`(이미 `end_at` 검사) · `auth/callback`·`invite/_actions`(라우팅).
- cron: `src/app/api/cron/deadline-push/route.ts` (+ `route.spec.ts`) — auto-close fold
- 데이터/RLS 영향: **신규 migration 없음.** auto-close는 `adminClient`(service role)가 RLS 우회 UPDATE(`active→closed`). 제출은 앱 게이트 + RLS `al_insert_self_active`(`now() between start_at and end_at`)가 이미 `end_at`로 차단 → DB-lag 무누수. 기존 stuck 행 backfill 없음(cron 첫 실행이 정리).
- 외부 서비스: Vercel Cron(기존 deadline-push, `0 0 * * *` UTC). 신규 cron entry 없음(Hobby 2-cron 유지).
- 재사용 후보: `computeAccruedPot`/`computePerHeadPenalty`(`src/lib/challenge/settlement.ts`), 기존 `ChallengeEndedBanner`(상세 over 표시 재사용).

## 작업 단계

TDD: 각 단계 RED(테스트 실패 확인) → GREEN(구현) → 검증. 헬퍼부터 바깥으로.

1. **lifecycle 헬퍼 + spec** — `challengePhase` · `isChallengeOver` · `remainingDays` 작성.
   경계 케이스: `end_at == now` → `over`(`<=`), `now+1ms` 미래 → `running`(`remainingDays >= 1`), `status='closed'` → 항상 `over`로 취급, `pending`/`accepted` 패스스루, `end_at=null` → `remainingDays=0`.
   엣지: `active` + `end_at=null`(이론상 미발생 — 활성화 RPC가 status·end_at을 atomic하게 set)은 `running`으로 떨어지나 `remainingDays=0`이 되어 "D-0" 재발 가능. 호출처는 **`phase==='running' && endAt != null`** 일 때만 `D-${remainingDays}`를 렌더(또는 `current-challenges`의 기존 `end_at ? … : duration_days` 폴백 보존)해 D-0를 원천 차단. spec에 이 케이스 포함.
   검증: `pnpm test src/lib/challenge/lifecycle.spec.ts`

2. **current-challenges 읽기 통일 + spec** — challenge view에 `phase` 파생 노출, `daysLeft`를 `remainingDays`로 교체. 같은 read를 쓰는 `active-challenge.ts`(공식·`status==='active'` 선택)도 같은 배치에서 `running`/`remainingDays` 기준으로 통일(`/action`·`/feed` 인증 대상에서 over 제외).
   검증: over 챌린지가 `phase='over'`로 분류되고 stats 집계에서 빠지는지 spec. `pnpm test src/lib/db/reads/current-challenges.spec.ts`

3. **홈 + FAB 분리** — `home/page.tsx`에서 `running`/`over` 분리, 집계(`activeCount`·`completedToday`·`pendingToday`·`totalPenalty`)는 `running`만. `RunningChallengeList`는 `running`만, 신규 `SettlementPendingList`가 `over`를 "종료 · 정산하기" → `/challenge/[id]/recap` CTA로. `row-pending-indicator`는 `running`일 때만 `D-${remainingDays}`. **`(app)/layout.tsx`의 FAB `activeChallenges`도 `running`만**(over가 "인증하기"에 뜨면 탭 시 차단되는 버그 제거).
   검증: `pnpm test` (running-challenge-list spec 갱신) + 모바일 viewport 수동(FAB 포함).

4. **그룹·me 통일** — `group-challenges-list`는 `phase` 배지(over→"종료/정산") + `running`만 D-N. `my-challenges.deriveCounts`는 `running` 기준(over 제외), `me/challenges/page.tsx`는 over를 "종료된 챌린지" 버킷으로.
   주의(한 컴포넌트 내 §A/§B 혼재): `manage-card-list.tsx`에서 **배지 라벨은 §A(phase로)** — over가 "종료된 챌린지" 섹션에 있으면서 "진행 중" 배지를 달면 모순이므로 phase 기반 라벨. 반면 **`canEnd`/`canDelete`/`canLeave`는 §B(status 유지)** — 운영자가 over를 실제로 종료하는 버튼이라 노출 유지.
   검증: 해당 spec 갱신 + `pnpm typecheck`

5. **상세 페이지 통일** — `(tabs)/layout.tsx`·`(tabs)/page.tsx`의 인라인 predicate, `(tabs)/dashboard/page.tsx`의 `computeDaysLeft` 제거 → 헬퍼. `StatusCard`·`dashboard-tab`·`next-step-cta`·`feed-tab`에 `phase` 전달, `over`면 "종료"(D-0 금지)·인증 prompt 숨김. `ChallengeEndedBanner`와 카드 신호 일치.
   검증: status-card spec(over→"종료", D-0 없음) + 상세/대시보드/피드 화면 수동.

6. **kudos 게이트 predicate 통일** — `_actions.ts:42`(toggleKudos)의 인라인 종료 판정 → `isChallengeOver`. `recap.ts:130` SQL `.or`는 유지 + canonical 주석. **§B(쓰기·권한: `hasOpenChallenge`·`canEnd`·`settlement`·제출 게이트·라우팅)는 건드리지 않는다** — 이미 올바르거나 status가 SoT.
   검증: `pnpm test` (\_actions spec 회귀 없음).

7. **auto-close fold + spec** — `deadline-push/route.ts`에 `UPDATE challenges SET status='closed' WHERE status='active' AND end_at<=now()` 추가.
   검증: `route.spec.ts` — 만료 active만 close, 미래 active·pending 불변. `pnpm test src/app/api/cron/deadline-push/route.spec.ts`

8. **문서/주석 마무리** — `ChallengeEndedBanner` 주석(#37 구현됨) 갱신, `docs/BE_SCHEMA.md` §5.5 status 전이에 auto-close 추가, ADR-0027 status `proposed→accepted`(승인 후).
   검증: `pnpm validate:docs`

## 검증

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm validate:docs
```

수동 확인 항목:

- [ ] 모바일 viewport — 홈 "진행 중"/"정산 대기" 분리, over 챌린지에 D-0 미표시
- [ ] 상세 페이지 — over 시 종료 배너 + 카드 "종료" 신호 일치(D-0 없음)
- [ ] auto-close — 로컬에서 `end_at` 과거 active 행 seed 후 cron route 호출 시 `closed` 전이, 미래/pending 불변
- [ ] 0029 — over 챌린지가 close된 그룹에서 새 챌린지 생성 가능

## 리스크 / 미해결

- **DB-lag 창(자정~09:00 KST)**: status 일시 부정확하나 파생-읽기·게이트가 커버(ADR-0027 §5). 사용자 영향 없음, 0029 슬롯만 cron까지 점유(수동 종료로 즉시 해제).
- **홈 "정산 대기"는 transient**(ADR-0027 부정적, **2026-05-30 transient 수용 결정**): `phase==='over'`는 auto-close 전(active+만료)만이라 cron이 닫으면 홈에서 사라지고, 정산은 `/me/challenges`·상세 배너로 이동. nudge 창이 ≈9h~1일로 짧음. 지속 nudge 필요 시 "closed+미정산" 추적은 별도 PR/ADR(POC 범위 밖)로 분리.
- **phase 캐시 staleness**: `current-challenges`(cacheLife minutes)가 `Date.now()`로 `phase`/`remainingDays`를 채워 자정 경계에서 수 분간 stale 가능 — 기존 `daysLeft`와 동일 성질(신규 회귀 아님), 쓰기 게이트는 live `now()`라 무영향.
- **UX 카피 미정**: 홈 "정산 대기" 섹션 헤딩·아이콘, me/group의 over 버킷 카피는 모킹업 확인 필요. 상세는 기존 `ChallengeEndedBanner` 재사용으로 카피 신규 없음.
- **base 브랜치**: `origin/develop` 기준(`fix/challenge-derived-over`). PR 베이스 `develop`.
