---
spec: 2026-06-29-rn-settlement-points-redemption-design
title: RN 정산·포인트·벌칙 redemption(2X carry-over) 화면 포팅 설계
author: pistachio8
date: 2026-06-29
status: draft
---

## Summary

web(`apps/web`)에 이미 라이브인 **P1 정산 도메인 화면 3종**을 React Native(`apps/mobile`, Expo)로 포팅한다. 비즈니스 로직(`computeSettlement`·2X carry-over 수금·과반 공식)과 DB·RPC는 EVAL-0005·0006·0042·0044·0045로 **이미 done**이므로, 이 설계는 화면(UI)과 RN 데이터 접근(read/mutation) 배선만 다룬다.

**전제 — web과 같은 UI/UX.** 화면은 web과 동일한 디자인 시스템(색·타이포·radius·컴포넌트·카피)을 따라야 한다. 그런데 현재 RN은 teal 임시 팔레트(`#0F766E`)로 web 디자인(`#8AA4FF` periwinkle, 청첩장 톤 정산 영수증, 정산 도장)과 **무관**하다. 그래서 **슬라이스 0(SL0)에서 RN 디자인 시스템을 web과 정합**한다 — `globals.css`/`DESIGN.md` 토큰을 RN theme로 미러(StyleSheet)하고 핵심 컴포넌트(Button·Chip·Card·Stamp·Empty/ErrorState)를 신설한다. **왜**: 토큰 정합 없이 화면만 옮기면 "다른 앱"처럼 보인다.

그 위에 3개 수직 슬라이스 — **① 정산 영수증(recap)** · **② 벌칙 redemption(더블 벌금)** · **③ 포인트 잔액·사용**. ①②는 web에서 이미 노출 중이라 RN에서도 바로 노출하고, ③은 게이트 **G2**(적립 포인트 법무 검토)에 묶인 EVAL-0007/0009 영역이라 **화면 구조만 구현하고 활성 노출은 보류**(기능 플래그)한다. 정산 _실행_(그룹장 확정/72h cron, EVAL-0008)은 범위 밖이며 RN은 정산 *결과 표시*만 한다. 충실도: 토큰·레이아웃·컴포넌트·카피는 web과 일치, 시그니처 모션(정산 도장 회전 등)은 정적/단순화한다.

## Why

- **RN MVP 전환의 다음 단계** — `apps/mobile`은 read 화면(home·feed·info)과 lifecycle은 됐지만 정산 도메인 화면(recap·penalty·points)이 비어 있다. recap은 placeholder(12줄)이고 penalty·points는 전무하다.
- **로직 재구현이 아니라 배선** — 핵심 산식은 `@withkey/domain`에 있고 web read/RPC가 검증돼 있다. RN은 그 계약을 소비하는 화면만 추가하므로 위험이 낮다.
- **G2와의 분리가 명확해졌다** — ①정산 영수증·②벌칙 redemption은 closed-loop 포인트 표시라 web에서 이미 노출 중(EVAL-0044·0045 done). ③포인트 사용·보증금 게이지만 G2 blocked다. 셋을 한 설계에 담되 ③만 노출 보류로 분리하면 G2를 기다리지 않고 ①②를 출시할 수 있다.
- **read 접근 패턴이 화면마다 다르다** — recap·point-balance는 순수 RLS read라 RN이 직접 호출하지만, penalty 상태 read는 web에서 **admin hydrate**(익명 reject count·signed URL을 adminClient + `"use cache"`로 채움)라 RN이 직접 못 쓴다. 이 차이를 설계가 명시하지 않으면 구현이 RLS leak이나 토큰 폭발로 샌다.
- **RN 디자인이 web과 벌어져 있다** — RN `colors.ts`는 스스로 "POC 팔레트(정식 토큰 체계 후속)"라 명시한 teal 임시값이라 web `globals.css`(periwinkle primary·청첩장 정산 톤·정산 도장)와 무관하다. "web과 같은 UI/UX" 요구를 만족하려면 화면 포팅 전에 토큰·컴포넌트 정합(SL0)이 선행돼야 한다.

## Impact Scope

### 변경 경로

- **신규(RN — 디자인 시스템, SL0)**:
  - `apps/mobile/src/shared/theme/{colors,typography,radius,motion}.ts` — `globals.css` 미러 토큰(정산 영수증 `invite` 팔레트 포함)
  - `apps/mobile/src/shared/ui/{button,chip,card,stamp,empty-state,error-state}.tsx` — 핵심 RN 컴포넌트(web `components/ui/*` 모양 미러)
- **신규(RN — 화면/데이터)**:
  - `apps/mobile/src/features/penalty/api/penalty-reads.ts` — 벌칙 창2 상태 read(BFF 경유)
  - `apps/mobile/src/features/points/api/points-reads.ts` — 포인트 잔액·이력 read(RLS 직접)
  - `apps/mobile/src/app/(app)/challenge/[id]/penalty.tsx` — 벌칙 증명·판정 화면
  - `apps/mobile/src/features/penalty/components/*` · `features/points/components/*` — RN UI
  - `apps/mobile/src/features/penalty/api/submit-penalty-proof.ts` — 증명 제출 mutation(BFF FormData)
- **수정(RN)**:
  - `apps/mobile/src/app/(app)/challenge/[id]/recap.tsx` — placeholder → 실화면
  - `apps/mobile/src/app/(app)/(tabs)/home.tsx` — "만회 찬스 대기" 섹션 추가
  - `apps/mobile/src/app/(app)/(tabs)/me.tsx` — 포인트 잔액·이력 섹션(플래그 비활성)
- **신규(web BFF — RN 데이터 공급)**:
  - `apps/web/src/app/api/penalty-status/route.ts` — penalty 상태 read endpoint(Bearer, feed 선례)
  - `apps/web/src/app/api/penalty-proof/route.ts` — 증명 영상 제출 endpoint(Bearer multipart, action-log 선례)
- **수정(web read — BFF 재사용 위한 리팩터)**:
  - `apps/web/src/lib/db/reads/penalty-status.ts` — `fetchPenaltyStatusForViewerClient(supabase, …)` 주입 변형 추가(feed `fetchChallengeFeedForViewerClient` 선례). 기존 `fetchPenaltyStatus`는 위임 래퍼로 보존
- **수정(공유 계약)**:
  - `packages/domain/src/read-contracts/` — `PenaltyStatusView`·`PointBalanceView` view-model 승격(현재 web `lib/db/reads`에 지역 정의 → RN 공유 위해 read-contract로)
  - `evals/fixtures/read-contracts/` — `penalty-status`·`point-balance` 패리티 fixture 추가

### src/ 영향

- `apps/web/src/app/api/**` Route Handler 2종 신규(외부 표면이 아니라 **RN BFF**, ADR-0036 Bearer 계약). web PWA 클라이언트는 호출하지 않는다(가드레일 — web은 RSC + Server Action 유지).
- `apps/web/src/lib/analytics/track.ts` — ③ analytics 2종(`settlement_completed`·`points_balance_view`) 추가는 **spec `2026-06-18-analytics-union-settlement`(accepted)**를 따르며 emit은 **web 경로 한정**(아래 C3 참조). spec-required 경로.

### Supabase / RLS / migration 영향

**없음.** 테이블·RPC·RLS는 EVAL-0005·0006·0044·0045(migration 0042~0056)에서 확정됐다. 본 설계는 기존 RPC(`submit_penalty_proof`·`toggle_penalty_proof_rejection`·`point_balance`)와 RLS(`penalty_proofs_select_group_member`·`point_ledger_select_self_or_group`)를 **소비만** 한다.

### 외부 서비스

**없음.** 영상은 기존 Storage(`action-videos` 버킷) + signed URL을 재사용한다.

## Design

### C0. 공통 패턴 (RN 가드레일 — ADR-0036/0037/0027)

- **로직 재구현 금지** — 산식은 `@withkey/domain`(`computeSettlement`·`pointBalanceFor`·`isPenaltyProofRejectedByPeers`·`confirmedPenalty`) 그대로 소비. RN은 화면·호출만. **왜**: web↔RN 단일 산식이 패리티 fixture로 보장된다.
- **read 분기** — 순수 RLS read는 `features/{domain}/api/*-reads.ts`에서 supabase client 직접(publishable key + RLS). admin hydrate가 필요한 read는 **BFF Bearer**(feed 선례 `bffGetJson`). **왜**: RN은 `next/cache`·cookies가 없어 web의 admin hydrate read를 직접 실행할 수 없다.
- **mutation 분기** — 영상 업로드를 동반하면 **BFF FormData**(`bffPostFormData`, action-log 선례), 순수 권한 RPC는 `supabase.rpc()` 직접. **왜**: 파일 압축·업로드는 서버가, 권한은 SECURITY DEFINER RPC가 강제한다.
- **phase** — `challengePhase(status, endAt)` 파생으로 표시·자격 분기. **왜**: status 컬럼 직접 분기 금지(ADR-0027).
- **UI — web 디자인 시스템 정합(SL0 산출물 사용)** — 색·타이포·radius·카피는 `DESIGN.md`/`globals.css` SoT를 미러한 RN theme 토큰, 컴포넌트는 SL0의 RN primitive(Button·Chip·Card·Stamp 등) 조합. web 컴포넌트 코드는 재사용 불가(RN StyleSheet)지만 **시각·레이아웃·카피는 web과 일치**시킨다. 시각 SoT는 `globals.css` + penalty/recap mockup(`docs/mockups/2026-06-24-feed-type-penalty-screens.html`)·`settlement-receipt-design` spec. 상태는 `useAsyncRead` 3-state + Empty/ErrorState. **왜**: "web과 같은 UI/UX".

### SL0. 슬라이스 0 — RN 디자인 시스템 정합 · _선행, 모든 슬라이스의 전제_

web 디자인 시스템(`DESIGN.md`)을 RN으로 미러한다. SoT는 `globals.css`(토큰)·`components/ui/*`(컴포넌트 모양)이고 RN은 그 값을 **도출**한다(추정·눈대중 금지 — DESIGN.md §1 SoT 체인).

- **토큰 미러** — `shared/theme/`에 colors(시맨틱 토큰 + 정산 영수증 `invite` 팔레트) · typography(`.t-h1`~`.t-caption` → RN text style) · radius(14px 파생 sm~3xl) · motion(120/200/320ms). `globals.css`의 hex/OKLCH 값을 그대로 옮긴다. **왜**: 같은 색이 파일마다 다르면 화면이 미묘하게 어긋난다.
- **핵심 컴포넌트** — `shared/ui/`에 Button(variant default·outline·secondary·ghost·destructive / size, 터치 타깃 ≥44px) · Chip(tone) · Card · Stamp(정산 도장 — **정적/단순화**, 회전 애니메이션 생략) · EmptyState · ErrorState. web `components/ui/*` 모양 미러. **왜**: primitive 우회 시 톤·접근성이 제각각이 된다(DESIGN.md §8).
- **보이스** — 마이크로카피는 web과 동일 톤("~해요", 자책 금지, 막다른 길에도 CTA). DESIGN.md §9·§11.
- **범위 경계(YAGNI)** — 이번 정산 도메인에 쓰는 토큰·컴포넌트만. KeywordDonut·ShareCard·streak/chart 팔레트 등 도메인 밖은 제외.
- **테스트** — RN theme 토큰이 `globals.css` 값과 일치하는 상수 테스트 + 컴포넌트 렌더 스냅샷.
- **PR 경계** — SL0는 이 spec에 속하되 **독립 첫 PR**로 구현한다(디자인 기반을 먼저 머지하고 ①②③가 소비). 별도 spec으로 분리하지 않는다 — 정산 화면이 실제 소비자라 함께 설계·검증해야 토큰·컴포넌트가 실사용에 맞게 잡힌다.

### C1. 슬라이스 ① — 정산 영수증(recap) · _G2 무관, 첫 슬라이스_

`apps/mobile/.../recap.tsx` placeholder를 실화면으로. **read는 신규 작업 없음** — `features/recap/api`의 `fetchRecap`·`fetchChallengePhotos`(+`fetchChallengeVideos`)가 이미 있고 `RecapView`(read-contract)를 반환한다.

- **화면 구성**: 정산 결과(viewer 환급 여부·`viewerPerHeadPenalty`·`viewerElapsedWeeks`/`viewerAchievedWeeks`) + 멤버 달성/MVP + 사진·영상 그리드(`feedType` 분기, signed URL). web `settlement-receipt.tsx` 레이아웃 미러.
- **carry-over 표시(②와의 접점)**: 영수증에 지난 벌칙 미수행으로 인한 `penalty_debt_carryover`(−2X 수금) 라인이 있으면 "지난 벌칙 미수행 2배 벌금 차감" 안내를 노출한다. **왜**: 사용자가 갑자기 2배가 빠진 이유를 영수증에서 이해해야 한다. (carry-over 수금 자체는 `settle_challenge`가 이미 수행.)
- **진입**: home "정산 대기"(phase=`over`/`closed`) → `/challenge/[id]/recap`. **mutation 0.**
- **테스트**: `evals/fixtures/read-contracts/recap.ts` 패리티(이미 존재) + RN 렌더 스냅샷.

### C2. 슬라이스 ② — 벌칙 redemption(더블 벌금) · _G2 무관_

가장 무겁다(read·write·신규 화면 모두). web `fetchPenaltyStatus`가 **admin hydrate**(익명 reject count·viewer rejection·video signed URL을 adminClient+cache로 채움)이므로 RN은 직접 못 쓴다 → **BFF read endpoint로 공급**한다.

- **C2-a. read (BFF)** — 신규 `GET /api/penalty-status?challengeId=`(Bearer). 핸들러는 feed BFF 선례(`/api/feed`)대로 `bearerTokenFrom`→`createBearerClient(token)`→`auth.getUser`로 viewer를 잡고, web read의 **client 주입 변형** `fetchPenaltyStatusForViewerClient(supabase, challengeId, viewerId)`를 호출해 `PenaltyStatusView`를 JSON 반환한다. **왜 주입 변형인가**: 기존 `fetchPenaltyStatus`는 `createClient()`(cookies) 의존이라 BFF(Bearer)에서 직접 못 쓴다 — feed의 `fetchChallengeFeedForViewerClient`처럼 Layer 1(challenge·participants·action_logs·penalty_proofs RLS)을 **주입 client**로, Layer 2(reject count·viewer rejection·signed URL)는 기존 `adminClient`로 분리한다. 기존 `fetchPenaltyStatus`는 그 변형에 위임하는 래퍼로 보존(web RSC 무변경). RN `penalty-reads.ts`는 `bffGetJson` + zod parse. **단 home "만회 찬스 대기" 목록은 BFF가 아니라 RN 직접 RLS read** — `penalty-waiting.ts`는 admin hydrate가 아니라 순수 RLS read(groups·challenges + 창2 메모리 필터, web은 private cache·reject count/signed URL 없음)이므로 RN이 recap·point-balance처럼 supabase 직접 호출한다. `PenaltyWaitingView`만 read-contract로 승격. **왜**: admin hydrate read만 BFF가 필요하고, 순수 RLS read를 BFF로 감싸면 불필요한 표면이 는다.
  - **왜 BFF인가**: penalty read는 익명성(voter_id 미노출) + signed URL 생성을 admin으로 한다. RN이 RLS로 직접 count하면 익명성·캐시 보장이 깨진다. feed와 동형(ADR-0036).
- **C2-b. 화면** — `challenge/[id]/penalty.tsx` 신규. `windowPhase`(before/open/expired) 게이트로 분기: 증명 제출 폼(영상, viewer `viewerConfirmedPenalty>0`일 때) · 증명 카드(pending/accepted/rejected/expired) · 동료 판정 토글(본인 외 proof) · **미제출/반려 → 다음 챌린지 2배 안내**. web `penalty/page.tsx`·`_components/*` 미러.
- **C2-c. mutation** — 증명 제출 = 신규 `POST /api/penalty-proof`(Bearer multipart: 영상 + challengeId). 핸들러는 영상을 `action-videos`에 업로드 후 `submit_penalty_proof` RPC 호출(web `_actions.ts` 로직을 BFF로 미러). 동료 판정 토글 = `supabase.rpc("toggle_penalty_proof_rejection")` **직접**(파일 없음, 권한은 RPC가 시간창·본인거부·과반전이를 한 트랜잭션으로 강제).
- **view-model 승격** — `PenaltyStatusView`·`PenaltyProofView`를 `lib/db/reads/penalty-status.ts` 지역 정의 → `packages/domain/src/read-contracts/penalty.ts`로 승격(web·RN·BFF 공유 SoT). **왜**: BFF 응답 zod와 RN 소비가 같은 타입을 봐야 drift가 없다.
- **테스트**: `penalty-status` 패리티 fixture 추가, 과반 공식(도메인 기존 테스트), BFF route 2종 계약 테스트(Bearer 인증·zod 응답).

### C3. 슬라이스 ③ — 포인트 잔액·사용 · _G2 blocked, 구조만/노출 보류_

- **read** — 신규 `features/points/api/points-reads.ts`. `point_ledger`를 RLS(`point_ledger_select_self_or_group`)로 **직접** read 후 `pointBalanceFor`로 잔액=Σdelta. web `getUserPointBalance` 미러. `PointBalanceView`(잔액 + 이력 행) read-contract 신규.
- **화면** — me 탭 포인트 잔액·이력 섹션 + pledge 환급 포인트 hold 게이지(read-only 표시). **단 me/pledge에서 렌더·링크는 기능 플래그로 비활성** — 컴포넌트는 완성하되 활성 노출은 G2 후. **왜**: EVAL-0007/0009가 G2 blocked다("blocked 동안 구조·테스트 작성 가능, 활성 노출만 보류").
- **analytics** — `settlement_completed`·`points_balance_view`를 `track.ts` union + `schema.ts` zod에 추가(spec `2026-06-18-analytics-union-settlement`). **emit은 web 경로 한정**: `settlement_completed`는 정산 RPC 콜사이트(Server Action·cron — web), `points_balance_view`는 web `app/(app)/me` RSC. **RN view 이벤트 emit은 본 설계 범위 밖**(RN은 `track()` service_role을 직접 못 호출하므로 BFF 경유가 필요 → 후속). **왜**: union 계약은 지금 확정하되 RN emit 배선은 별도 결정이 필요하다.
- **테스트**: `point-balance` 패리티 fixture + analytics parity(`pnpm test -- analytics`).

### 데이터 흐름 요약

```
① recap:   RN recap.tsx → fetchRecap (RLS 직접) → RecapView
② penalty: RN penalty.tsx → bffGetJson(/api/penalty-status) → fetchPenaltyStatusForViewerClient(Bearer client 주입 + admin hydrate) → PenaltyStatusView
   만회대기: RN home.tsx → penalty-reads(fetchPenaltyWaiting, RLS 직접 — admin 아님) → PenaltyWaitingView
           제출: RN → bffPostFormData(/api/penalty-proof) → storage upload + submit_penalty_proof RPC
           판정: RN → supabase.rpc(toggle_penalty_proof_rejection)  [직접]
③ points:  RN me/pledge(플래그 off) → points-reads (RLS 직접) → PointBalanceView
           analytics: web 콜사이트만 emit (RN emit 후속)
```

## Alternatives Considered

1. **레이어 수평(모든 read → 모든 화면 → 모든 mutation)** — 패리티 fixture를 한 번에 정합하지만 **미채택**. 첫 사용자 가치까지 오래 걸리고 PR이 비대해 하네스 작은 배치·pass@3와 어긋난다. 수직 슬라이스는 ①(가장 가벼움)부터 가치를 낸다.
2. **penalty read를 RN에서 RLS로 직접** — BFF 신규를 피하지만 **미채택**. web이 admin hydrate를 쓴 이유(익명 reject count·signed URL·캐시)를 RN이 RLS로 재현하면 익명성·토큰 비용이 깨진다. feed 선례대로 BFF가 맞다.
3. **정산 트리거(그룹장 확정)까지 RN 포함** — "정산"의 직관에 부합하나 **미채택**. EVAL-0008은 G2+P2 blocked이고 RN은 표시만으로 충분하다(실행은 cron/web). 범위를 키우면 G2를 기다려야 한다.
4. **③까지 즉시 노출** — **미채택**. 포인트 사용·보증금 게이지는 G2(법무) 영역이라 활성 노출은 게이트 후. 구조만 만들어 G2 해소 시 플래그만 켠다.

## Verification

```bash
# (a) 본 spec 머지 — 지금
pnpm validate:docs
pnpm harness:check          # traceability

# (b) 구현 PR (슬라이스별)
pnpm typecheck && pnpm lint
pnpm test -- theme          # SL0: RN 토큰 ↔ globals.css 일치 + 컴포넌트 렌더
pnpm test -- recap          # 슬라이스① 패리티
pnpm test -- penalty        # 슬라이스② 패리티 + BFF 계약
pnpm test -- analytics      # 슬라이스③ union parity (track.ts ↔ schema.ts)
# RN 화면: Expo dev build 모바일 viewport 수동 — web mockup과 시각 비교(같은 UI/UX), points는 플래그 off 확인
```

### 시나리오 (구현 PR)

- **① 정상**: 종료 챌린지 → recap 진입 → 환급/미달 결과·사진 그리드 렌더. carry-over 행 있으면 2배 안내.
- **② 정상 제출**: 창2 open + `viewerConfirmedPenalty>0` → 영상 제출 → BFF → proof `pending`. 동료 과반 미반려 → 종료+96h `accepted`(2배 면제).
- **② 더블 벌금**: 미제출 또는 과반 반려 → `finalize_penalty_proof`가 `penalty_debts(2X, open)` 적재 → 같은 그룹 다음 정산에서 `settle_challenge`가 자동 수금 → ① recap에 carry-over 라인.
- **② 익명성**: penalty read가 voter_id를 노출하지 않는지(BFF 응답에 reject count만).
- **③ 노출 보류**: me/pledge에서 포인트 섹션이 플래그 off로 렌더되지 않음. 플래그 on 시 잔액=Σdelta 표시.

## Out of scope

- 정산 _실행_ 트리거(그룹장 확정·72h cron) — EVAL-0008(G2+P2 blocked).
- 현금 충전 포인트 — Fast-follow, G2 후 별도.
- ③ 포인트 사용·보증금 게이지 **활성 노출** — G2(법무) 후.
- **RN 측 analytics emit** — `track()`은 server-side service_role이라 RN이 직접 못 부른다. `settlement_completed`는 정산 _실행_(web Server Action/cron) 시점 emit이라 표시만 하는 RN과 무관하고, `points_balance_view`는 ③ 잔액 화면 이벤트라 ③ 노출 보류(G2)와 함께 보류된다. RN view 이벤트 일반(recap·penalty 조회 신호)은 RN track BFF 인프라(`/api/track`)가 없어 **안 남는 구멍**이며, 정산 도메인 너머 RN 전반 기반이라 별도 작업으로 둔다.
- 비즈니스 로직·RPC·migration 변경 — 이미 done(소비만).

## 용어집

- **admin hydrate read**: RLS visibility 통과 후 `adminClient`로 익명 집계·signed URL을 채우는 read(ADR-0024). cookies·next cache 의존이라 RN 직접 호출 불가 → BFF 경유.
- **BFF(Backend for Frontend)**: RN 전용 서버 endpoint(`apps/web/src/app/api/*`, Bearer 인증, ADR-0036). web PWA는 호출 금지.
- **carry-over(2X)**: 벌칙 미수행 시 미달분 X의 2배를 같은 그룹 다음 챌린지 정산에서 수금하는 빚(`penalty_debts`, ADR-0039).
- **closed-loop 포인트**: 앱 안에서만 도는 현금화 불가 포인트.
- **G2**: 적립 포인트 법무 검토 게이트. P1 포인트 사용·보증금 노출의 선행 조건.
- **read-contract**: web·RN이 공유하는 view-model 타입 SoT(`packages/domain/src/read-contracts`, ADR-0037).
- **창2(window 2)**: 벌칙 증명 제출 가능 구간 = 챌린지 종료+48h ~ +96h.
- **수직 슬라이스**: 한 플로우를 read→화면→mutation 완결 단위로 구현하는 방식.
- **디자인 토큰 미러**: web `globals.css`(SoT)의 색·타이포·radius·motion 값을 RN theme로 도출해 같은 시각을 내는 것. 값을 추정하지 않고 SoT에서 옮긴다(DESIGN.md §1).
- **primitive**: 화면을 조립하는 최소 UI 컴포넌트(web `components/ui/*`, RN `shared/ui/*`).
