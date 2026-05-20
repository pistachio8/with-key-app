# ADR-0010: Challenge Detail Tabs — Nested Route Segments

**Date**: 2026-05-20
**Status**: proposed
**Deciders**: pistachio8

## Context

챌린지 상세(`/challenge/[id]`)는 3개 탭(인증 피드 · 현황판 · 정보)을 하나의 페이지에서 보여준다. 현재 구현은 다음과 같다.

- 서버 컴포넌트 `page.tsx`가 진입 시 `fetchChallengeDetail` + `fetchChallengeFeed` 를 한 번에 호출하고, 3개 탭 컴포넌트(`FeedTab` / `DashboardTab` / `InfoTab`)를 모두 `ChallengeTabs`에 `ReactNode` prop 으로 전달한다.
- 클라이언트 컴포넌트 `ChallengeTabs`가 `useSearchParams`로 `?tab=` 을 읽어 active 탭을 결정하고, 사용자가 탭을 클릭하면 `router.replace`로 URL을 갱신한다.
- 코드 주석은 "active 는 URL searchParams 에서 직접 도출 — 로컬 state 없음 (single source of truth)"이라고 의도를 명시한다.

dogfood 직전 사용자 보고:

1. 진행 중 챌린지 카드 클릭 시 로딩 피드백이 없어서 진입이 느리게 느껴진다.
2. 탭(인증 피드 / 현황판 / 정보) 클릭 시 매번 렌더링이 느리고 로딩 중인지 모호하다.

원인 분석:

- `router.replace`는 URL 쿼리만 바꾸지만 Next.js soft navigation을 트리거한다. `page.tsx`는 `auth.getUser()` 같은 dynamic API를 사용하므로 RSC 가 매번 재실행되고 `fetchChallengeDetail` · `fetchChallengeFeed` 도 다시 돈다.
- 그런데 `tab` 값은 실제 서버 렌더링 결정에 **한 번도 사용되지 않는다** (서버 분기는 `justJoined`로만). 즉 "URL = SoT" 추상화는 leaky 한 상태로 perf 비용만 발생시키고 있다.
- 진입 시 모든 탭의 데이터를 prop 으로 미리 보내는 구조라, info 탭만 보는 사용자도 feed fetch 비용을 낸다.

## Decision

`/challenge/[id]` 의 탭을 nested route segments 로 재편한다.

- `layout.tsx` 가 shell(StatusCard · banners · owner menu · tab nav · account/invite slots) 과 모든 탭 공통 데이터(`fetchChallengeDetail`) 를 담당한다.
- 각 탭은 별도 segment 다.
  - `page.tsx` → 인증 피드 (default 탭).
  - `dashboard/page.tsx` → 현황판.
  - `info/page.tsx` → 정보.
- 각 segment 는 자기 탭에만 필요한 데이터를 fetch 한다. 공통 reader는 React `cache()` 로 wrapping 해서 request-scope dedupe.
- 탭 전환은 `<Link>` (Next.js 16 prefetch 기본 활성) 로 수행한다. `loading.tsx` 가 각 탭에 위치해 streaming 으로 즉시 skeleton 을 표시한다.
- URL은 `/challenge/[id]?tab=dashboard` → `/challenge/[id]/dashboard` 로 바뀐다. `layout.tsx` 가 기존 `?tab=` 쿼리를 새 경로로 redirect 한다.
- F8 결과 모달 CTA(`action-result-dialog.tsx`)는 새 경로로 갱신한다.

코드 주석의 "single source of truth" 의도는 유지된다 — 다만 SoT 단위가 query param 에서 route segment 로 승격된다.

## Alternatives Considered

### 1. `history.replaceState`로 URL 갱신, tab은 client useState

- **Pros**:
  - 변경 코드 ~10줄. 외상 작음.
  - RSC re-fetch 비용 제거 (탭 전환 즉시).
  - `nuqs` 등 라이브러리가 쓰는 검증된 escape hatch.
- **Cons**:
  - "URL = state" SoT 모델을 우회. 향후 PPR · 서버 분기 도입 시 다시 reroute 필요.
  - 첫 진입 시 모든 탭 fetch 비용은 그대로 (info 탭만 보는 사용자도 feed fetch).
  - 각 탭별 독립 skeleton 격리 불가 (한 `loading.tsx`만 가능).
  - 브라우저 back/forward 로 탭 사이 이동 불가 (현재와 동일).
- **Why not**: 사용자 보고된 두 perf 이슈는 가려지지만, **routing 모델의 leaky한 추상화는 그대로 남는다**. 향후 deep-link · share · SEO · 격리된 streaming 기회를 모두 닫는다. POC 일정상 매력적이었으나, dogfood 직전에 정통 모델로 한 번 갈아두는 편이 production 진입 후 비용이 더 낮다.

### 2. Parallel Routes (`@feed`/`@dashboard`/`@info` slots) + 조건부 layout

- **Pros**:
  - Next.js 의 명시적 multi-slot 패턴.
- **Cons**:
  - Parallel routes는 **동시에 여러 영역을 보여주는 UI** 용 (e.g., 메인 + 모달, 메인 + 사이드). 상호배타적 탭에는 over-engineering.
  - default.tsx 슬롯 처리 · 라우팅 디스패치 복잡성 증가.
- **Why not**: 도구가 의도하는 use-case 와 어긋남.

### 3. 현 구조 유지 + `react cache()` 만 적용

- **Pros**:
  - 변경 거의 없음.
- **Cons**:
  - DB request-scope dedupe 는 되지만 **soft navigation 자체의 RSC 재실행 비용**은 그대로.
  - 클라이언트 hydration · streaming · 네트워크 RT가 매번 발생.
- **Why not**: 근본 원인을 안 건드림.

## Consequences

### 긍정적

- 탭 전환이 client navigation + prefetch + streaming 으로 거의 즉시 체감.
- 각 탭별 독립 `loading.tsx` 로 skeleton 격리. perceived performance 명확.
- 직접 진입 URL(`/challenge/[id]/dashboard`) 이 자연스러워서 share/bookmark/SEO 친화.
- 브라우저 back/forward 가 탭 사이 이동에 동작 (UX 자연스러움).
- info 탭만 보는 사용자는 feed fetch 비용을 내지 않음.
- 향후 PPR · streaming · 부분 캐시 도입 여지 확보.

### 부정적 / 비용

- 약 8개 파일 신설 · 이전. PR 이 single-line patch 가 아니라 routing 모델 전환.
- `ChallengeTabs` (client tab switcher) 삭제 · `TabNav` (Link 기반) 신설.
- 관련 spec / 테스트 갱신: `challenge-tabs.spec.tsx` 삭제, `tab-nav.spec.tsx` 신설.
- 기존 `?tab=` 딥링크 호환 redirect 추가 부담 (1회성).
- 라우팅 모델 변경이므로 별도 ADR(본 문서) 필수.

### 후속 영향

- `docs/PRD.md` 의 챌린지 상세 라우팅 표기를 새 경로로 갱신 (있다면).
- `tests/e2e/` 의 챌린지 탭 시나리오 URL 갱신.
- 향후 챌린지 외 페이지(`group/[id]` 등)에 같은 패턴 도입 여부는 별도 결정.
