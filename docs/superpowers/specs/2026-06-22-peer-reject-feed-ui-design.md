---
spec: 2026-06-22-peer-reject-feed-ui
title: peer 반려 피드 UI — 무효 우표 · 톤다운 · 응원 차단 · 반려 버튼 라벨형
author: pistachio8
date: 2026-06-22
status: draft
---

## Summary

그룹 과반이 익명 반려해 무효 처리된(`auto_verify_status='peer_rejected'`) 인증을 챌린지 피드에서 한눈에 알아보게 만든다. 무효 카드는 (1) 우측 상단에 빨강 "반려" 우표(기존 `Stamp` 컴포넌트 + scale-in 애니메이션 재사용), (2) 내용 톤다운(흐림 + 사진 grayscale), (3) 응원(Kudos) 차단으로 표현한다. 함께 반려 버튼(`PeerRejectButton`)을 라벨형(`🟨 반려 N`)으로 다듬어 응원과 다른 "판정 입력"임을 분명히 한다.

핵심 데이터 변경은 **피드 view-model(`FeedItemView`)에 `isPeerRejected: boolean` 한 필드를 추가**하는 것이다. 현재 hydrate read 가 `auto_verify_status` 를 select 하지 않아 무효 여부가 화면까지 흐르지 않는다. status enum 전체가 아니라 boolean 만 노출해 변경을 외과적으로 가둔다.

본 spec 이 머지된 뒤 구현 PR 이 따라온다.

## Why

- "반려된 피드"의 완료 상태(과반 도달 무효)가 피드에 **전혀 표시되지 않는다**. 무효된 인증과 정상 인증이 시각적으로 동일해, 그룹 익명 다수결(ADR-0038)의 결과가 사용자에게 닫혀 있다.
- 무효 인증에도 응원(Kudos)이 열려 있어 "거부된 인증에 응원"이라는 의미 모순이 생긴다.
- 현재 반려 버튼은 `🟨 N`(이모지+숫자)뿐이라 응원과 시각적으로 구분이 약하다. 반려는 표현이 아니라 **판정 입력**(ADR-0038)이라 의미를 분리해야 한다.
- 우표/도장은 "이 인증은 그룹 판정으로 거부됨"이라는 공식 마킹과 의미가 정확히 맞고, 프로젝트에 이미 `Stamp` 컴포넌트(서약서·정산 영수증에서 사용)와 `animate-stamp-in` 키프레임이 있어 재사용으로 끝난다.

## Impact Scope

### 변경 경로

- 신규: 없음(기존 컴포넌트·read 확장으로 처리)
- 수정:
  - `packages/domain/src/read-contracts/feed.ts` — `FeedItemView` 타입 + `feedItemViewSchema` 에 `isPeerRejected` 추가
  - `evals/fixtures/read-contracts/feed.ts` — fixture 동기화
  - `apps/web/src/lib/db/reads/action-log-hydrate.ts` — `auto_verify_status` select + `isPeerRejected` 도출
  - `apps/web/src/lib/db/reads/challenge-feed.ts` — `hydrateFeedItems` 매핑에 `isPeerRejected` 추가
  - `apps/web/src/app/(app)/challenge/[id]/_actions.ts` — `togglePeerRejection` 에 `actionlog-${id}` 태그 무효화 추가
  - `apps/web/src/app/(app)/challenge/[id]/_components/challenge-feed.tsx` — `FeedCard` 로 `isPeerRejected` 전달
  - `apps/web/src/app/(app)/challenge/[id]/_components/feed-card.tsx` — 우표·톤다운·응원 차단
  - `apps/web/src/app/(app)/challenge/[id]/_components/peer-reject-button.tsx` — 라벨형 디자인
  - `apps/web/src/app/globals.css` (또는 토큰 파일) — 노랑(amber) 톤 토큰이 없으면 추가

### src/ 영향

- 챌린지 상세 피드 탭(`/challenge/[id]`)의 `FeedCard` 렌더. 다른 화면(home·정산)은 `FeedItemView` 를 쓰지 않으므로 무영향.
- `FeedItemView` 는 BFF `GET /api/feed`(RN 전용) 응답 계약이기도 하다 — 필드 추가는 비파괴적이지만 zod required 필드라 **RN 측 fixture/mock 동기화**가 따라온다(아래 §Rollout).

### Supabase / RLS / migration 영향

- **없음.** `peer_rejections` 테이블·`toggle_peer_rejection` RPC·`auto_verify_status='peer_rejected'` 전이는 0048(ADR-0038)에서 이미 존재한다. 본 작업은 그 결과를 read 에서 select 해 UI 에 노출만 한다. 과반 임계 규칙은 변경하지 않는다.

### 외부 서비스

- 없음.

## Design

### 과반 임계 (참고 — 변경 없음)

무효 판정은 `toggle_peer_rejection` RPC(`0048_peer_rejections.sql:129-149`)가 닫는다. 분모 N = 그 챌린지에 **서약 완료(`signed_at IS NOT NULL`)한 참가자** 수이고, 작성자 제외 `(N−1)` 표본에 대해 `count > (N−1)/2`(실수 나눗셈, 초과) 면 `peer_rejected` 로 전이한다. 예: 서약자 4명 → 2명, 3명 → 2명(투표 가능 2명 전원). 본 UI 는 이 결과(`isPeerRejected`)만 쓰고 임계 숫자는 노출하지 않는다.

### C1. status → view-model 배선

- `getActionLogHydrate`(Layer 2, admin + public `'use cache'`)의 select 에 `auto_verify_status` 추가. `ActionLogHydrate` 에 `isPeerRejected: boolean`(`row.auto_verify_status === 'peer_rejected'`)로 도출. **왜 boolean**: 피드 카드엔 "무효인가"만 필요하고, status enum 전체 노출은 변경 표면을 불필요하게 넓힌다(외과적).
- `FeedItemView`(read-contract SoT)에 `isPeerRejected: boolean` 추가 — 타입 + `feedItemViewSchema` + fixture. `hydrateFeedItems` 가 `hydrate.isPeerRejected` 를 매핑.
- **cache 정합**: `togglePeerRejection` 에 `updateTag(actionlog-${id})` + `revalidateTag(actionlog-${id}, "max")` 를 추가한다. **왜**: 무효 여부는 이제 `actionlog-${id}` 태그가 거는 hydrate 캐시에 들어가는데, 현재 토글은 `peer-reject-count-*` 만 무효화하므로 과반 전이(passed↔peer_rejected)가 피드에 반영되지 않는다.
- **optimistic 범위**: `ChallengeFeed.applyToggle` 은 현행대로 count·viewerRejected 만 낙관 갱신한다. `isPeerRejected` 는 서버 re-render 로 sync. **왜**: 과반(N) 계산은 서버 RPC SoT 이고, 클라에서 재현하면 서약자 N(`signed_at` 필터)을 다시 구현해야 해 가드레일(서버 일원화) 위반·오차 위험.

### C2. FeedCard — 무효 표현

- prop `isPeerRejected?: boolean` 추가. `ChallengeFeed` 가 item 에서 전달.
- true 일 때:
  - 카드 본문을 감싸는 **inner wrapper 에만** 톤다운(`opacity` ~0.55 + 사진 `grayscale`). 우표는 이 wrapper 의 **형제**로 둔다. **왜**: 부모에 `opacity` 를 걸면 자식 도장도 함께 흐려진다 — 도장을 흐림 바깥 형제 + `z-index` 위로 둬야 또렷이 뜬다(브라우저 시안에서 확정).
  - Card 우측 상단(`absolute`, 사진에 살짝 겹침)에 `<Stamp label="반려" tone="danger" />`. 기존 `animate-stamp-in`(scale 1.8→1 + rotate)이 mount 시 자동 재생. `prefers-reduced-motion` 은 기존 1ms 처리로 안전.
  - `KudosBar` 미렌더(응원 차단). **왜**: 거부된 인증에 응원은 의미 모순.
  - 접근성: 무효 카드 컨테이너에 "그룹 반려로 무효 처리됨" 취지의 안내(`aria-label` 또는 시각적으로 숨긴 텍스트).
- 반려 버튼(`PeerRejectButton`)은 무효 후에도 노출 유지 — 48h 내 토글(복원)이 가능하기 때문(`isEnded` 로 막지 않는 기존 규칙 유지).

### C3. PeerRejectButton — 라벨형

- 표기 `🟨 반려 N`. 평소 옅은 노랑 배경, active(본인 반려, `viewerRejected`) 시 노랑 채움 + 굵게.
- 색은 진행 중 반려=노랑(amber, 경고 누적), 확정 무효=빨강 우표(danger)로 구분해 "경고 → 거부 확정" 흐름을 색으로 읽히게 한다. globals.css 에 amber 토큰이 없으면 디자인 토큰으로 추가(하드코딩 지양).
- 익명성·1탭 토글·`aria-pressed`·카운트만 노출은 그대로 유지.

### 도장 동시 찍힘 (기본값)

피드에 무효 카드가 여럿이면 진입 시 도장이 동시에 찍힌다. 1차는 그대로 둔다. 거슬리면 `animation-delay` stagger 를 후속으로 — YAGNI.

## Alternatives Considered

1. **viewer 본인이 누른 반려에 우표(viewerRejected)** — 데이터가 이미 있어 프론트만으로 가능하나, 우표(공식 도장)보다 개인 토글 상태에 가까워 의미가 약하다. 채택 안 함.
2. **status enum 전체를 view-model 에 노출** — 향후 failed/manual_review UI 에 재사용 여지가 있으나, 현재 불필요하고 변경 표면만 넓힌다(YAGNI). boolean 으로 한정.
3. **반려 진행도 표시("과반까지 N표")** — 유용하나 임계 노출이 익명 다수결의 압박감을 키울 수 있고 범위를 넓힌다. 1차 제외.
4. **무효 카드 완전 숨김(피드에서 제거)** — 무효 사실 자체가 그룹에 주는 신호(피드백)를 없앤다. 톤다운 + 우표로 "보이되 무효"가 낫다.

## Verification

### 명령

```bash
pnpm typecheck
pnpm lint
pnpm test
```

### 시나리오

- read-contract: `feedItemViewSchema`(zod) ↔ `FeedItemView`(TS) parity, fixture 가 새 필드를 포함.
- FeedCard 단위: `isPeerRejected=true` → `Stamp`(label "반려") 렌더 + `KudosBar` 미렌더 + 톤다운 클래스 적용. `false` → 우표 없음·응원 정상.
- PeerRejectButton 단위: 평소/active 표기, `aria-pressed`, 카운트 표시.
- `togglePeerRejection`: 과반 전이 시 `actionlog-${id}` 태그 무효화 호출(기존 count 태그와 함께).
- 수동(모바일 viewport): 무효 카드 진입 시 우표 scale-in, 내용만 흐려지고 도장은 또렷, 응원 버튼 부재.

## Rollout

- 단일 PR(브랜치 `feat/feed-peer-reject-stamp`, base `develop`). 0048 은 이미 배포 경로에 있으므로 migration 동반 없음.
- **RN 동기화**: `FeedItemView` 필드 추가가 BFF 계약이라 RN 측 fixture/mock(`apps/mobile` feed 관련)이 새 필드로 빌드 통과하는지 확인한다. RN feed-card 의 시각 반영은 본 PR 범위 밖(web 우선) — 타입/계약만 통과시키고 RN UI 는 별도.
- dogfood 중인 챌린지에서 실제 과반 반려 1건을 만들어 우표·톤다운·응원 차단을 실측.

### 롤백

- view-model 필드·UI 변경이라 코드 revert 로 즉시 롤백 가능. DB·migration 변경이 없어 데이터 롤백 불필요.
