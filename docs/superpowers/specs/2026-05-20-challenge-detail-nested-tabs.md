---
spec: 2026-05-20-challenge-detail-nested-tabs
title: Challenge Detail — Nested Route Tabs + 진입 로딩 피드백
author: pistachio8
date: 2026-05-20
status: draft
---

## Summary

`/challenge/[id]` 의 3개 탭(인증 피드 · 현황판 · 정보)을 single page + client tab switcher 모델에서 **nested route segments** 모델로 재편한다. 동시에 홈 화면(`running-challenge-list.tsx`) 에서 진행 중 챌린지 카드를 클릭했을 때 진입까지의 시각 피드백(`useLinkStatus()` row spinner + 각 탭의 `loading.tsx` skeleton)을 추가한다.

routing 모델 변경 결정 근거는 [ADR-0010](../../adr/0010-challenge-detail-nested-route-tabs.md). 본 spec 은 그 결정의 구현 설계.

## Why

- 사용자 보고 (dogfood 직전):
  - 진행 중 챌린지 카드 클릭 시 로딩 피드백 부재, 진입 느낌이 느림.
  - 탭 클릭 시 매번 렌더링이 느리고 로딩 중인지 모호함.
- 기술적 원인:
  - `router.replace`가 Next.js soft navigation 을 트리거 → `auth.getUser()` 등 dynamic API 로 인해 RSC 재실행 + DB read 재실행.
  - `tab` 쿼리가 서버 렌더링 분기에 실제로 사용되지 않는데도 그 비용을 매번 지불.
  - 모든 탭 콘텐츠를 동시에 prop 으로 전달하는 구조라 info 탭만 보는 사용자도 feed fetch 비용을 지불.
- 부수 효과:
  - 탭별 독립 skeleton 격리 불가 (한 `loading.tsx`만 가능).
  - share/bookmark URL 이 query 기반이라 자연스럽지 않음.

## Impact Scope

### 변경 경로

- 신규:
  - `src/app/(app)/challenge/[id]/layout.tsx`
  - `src/app/(app)/challenge/[id]/loading.tsx`
  - `src/app/(app)/challenge/[id]/dashboard/page.tsx`
  - `src/app/(app)/challenge/[id]/dashboard/loading.tsx`
  - `src/app/(app)/challenge/[id]/info/page.tsx`
  - `src/app/(app)/challenge/[id]/info/loading.tsx`
  - `src/app/(app)/challenge/[id]/_components/tab-nav.tsx`
  - `src/app/(app)/challenge/[id]/_components/tab-nav.spec.tsx`
  - `src/lib/supabase/auth.ts` — `getAuthedUser` cache helper
  - `docs/adr/0010-challenge-detail-nested-route-tabs.md` (이미 생성)

- 수정:
  - `src/app/(app)/challenge/[id]/page.tsx` (feed 전용으로 축소)
  - `src/app/(app)/challenge/[id]/_components/challenge-tabs.tsx` (삭제)
  - `src/app/(app)/challenge/[id]/_components/challenge-tabs.spec.tsx` (삭제, 있다면)
  - `src/app/(app)/challenge/[id]/action/_components/action-result-dialog.tsx` (URL 갱신 1줄)
  - `src/app/(app)/home/_components/running-challenge-list.tsx` (row pending indicator 추가)
  - `src/lib/db/reads/challenge-detail.ts` (필요 시 `cache()` wrapping)
  - `src/lib/db/reads/challenge-feed.ts` (필요 시 `cache()` wrapping)

### src/ 영향

- `app/(app)/challenge/[id]/` 디렉토리 트리 재편.
- `app/(app)/home/_components/running-challenge-list.tsx` 행 단위 pending indicator 추가.
- `lib/db/reads/*` React `cache()` 적용 확인 및 보완.

### Supabase / RLS / migration 영향

없음.

### 외부 서비스

없음.

## Design

### C1. Routing 모델 재편

```
src/app/(app)/challenge/[id]/
  layout.tsx               # 신규: shell + 공통 fetch
  loading.tsx              # 신규: shell-level fallback (선택적)
  page.tsx                 # 축소: feed 탭
  dashboard/
    page.tsx               # 신규
    loading.tsx            # 신규
  info/
    page.tsx               # 신규
    loading.tsx            # 신규
  _components/
    tab-nav.tsx            # 신규: <Link> 기반 client tab nav
    challenge-tabs.tsx     # 삭제
    feed-tab.tsx · dashboard-tab.tsx · info-tab.tsx  # 그대로 유지
    status-card.tsx · just-joined-banner.tsx · ...   # 그대로 유지
```

### C2. `layout.tsx` 책임

- `auth.getUser()` → 미인증 시 `redirect("/login")`.
- `fetchChallengeDetail(id)` → `notFound()` 가드.
- 모든 탭 공통 데이터 계산: `daysLeft` · `ownerName` · `mySigned` · `isOwner` · `totalSigned` · `unsignedCount` · `isEndedByDate` · `showEndedBanner`.
- shell 컴포넌트 렌더:
  - `ChallengeOwnerMenu` (owner 만)
  - `ChallengeEndedBanner`
  - `JustJoinedBanner` (`?just_joined=1` 시)
  - `joinedLate` 카드 (`?joined_late=1` 시)
  - `StatusCard`
  - 서명 안 한 멤버 안내 카드 (조건부)
  - `StartChallengeCard` (`isOwner && status === "pending" && mySigned` 시)
  - `TabNav` (현재 active 표시는 `usePathname` 기반)
- 기존 `?tab=` 호환 + `just_joined` 진입 시 info 시작 redirect:
  ```ts
  const preservedQuery = buildPreservedQuery(sp); // tab 제외, 나머지 query 보존
  if (sp.tab === "dashboard") redirect(`/challenge/${id}/dashboard${preservedQuery}`);
  if (sp.tab === "info") redirect(`/challenge/${id}/info${preservedQuery}`);
  // 기존 동작 보존 — 초대 직후 진입은 info 탭에서 시작
  if (sp.tab === undefined && sp.just_joined === "1") {
    redirect(`/challenge/${id}/info?just_joined=1${sp.activated === "1" ? "&activated=1" : ""}`);
  }
  ```
  `joined_late` · `activated` 등 query 는 redirect 시 보존.
- `JustJoinedBanner` 는 layout 에서 `?just_joined=1` 시에만 렌더. 사용자가 탭 클릭으로 이동하면 query 가 자연 소실되어 배너가 사라짐 — 기존 동작 보존 (환영 배너는 첫 진입에만 표시되는 의도).
- `{children}` 영역에 자식 segment 가 들어옴.

**왜**: layout 은 segment 사이에 보존되므로 탭 전환 시 재실행되지 않음. shell flicker 제거가 핵심 이득.

### C3. 각 탭 page

**공통 의존**: 모든 page 가 `fetchChallengeDetail(id)` 와 `getAuthedUser()` 를 호출. `detail.members` 가 `todayMissingNames` · `accountSlot` · `inviteSlot` 등에서 모두 필요하므로 layout 만으로 채워지지 않음. layout 이 같은 reader 를 호출하므로 React `cache()` (§C6) 로 dedupe → DB hit 1회.

- `page.tsx` (feed, default):
  - `fetchChallengeDetail(id)` (cache hit) + `getAuthedUser()` (cache hit) + `fetchChallengeFeed(id, user.id)`.
  - `todayDoneCount` · `todayMissingNames` 계산.
  - `<FeedTab>` 렌더.
  - `<Fab href="/challenge/[id]/action">` (`isParticipant && status === "active"` 시).
- `dashboard/page.tsx`:
  - `fetchChallengeDetail(id)` (cache hit) + `getAuthedUser()` (cache hit) + `fetchChallengeFeed(id, user.id)`.
  - `totalFailures` · `totalPenalty` 계산.
  - `<DashboardTab>` 렌더 + `<Fab>` (feed 와 동일 조건).
- `info/page.tsx`:
  - `fetchChallengeDetail(id)` (cache hit) + `getAuthedUser()` (cache hit). **feed fetch 없음**.
  - `inviteSlot` · `accountSlot` · `startSlot` 구성. `<InfoTab>` 렌더. `<Fab>` 없음 (모킹업 §9-A·B).

**왜 fab 을 layout 으로 못 올리나**: info 탭에서 fab 을 숨겨야 하고, fab 의 `href` 가 status·isParticipant 에 의존. 탭별 page 에서 결정하는 편이 조건 분기를 명확히 한다.

### C4. `TabNav` 컴포넌트

```tsx
// src/app/(app)/challenge/[id]/_components/tab-nav.tsx
"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLinkStatus } from "next/link";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const TABS = [
  { key: "feed",      label: "인증 피드", suffix: ""           },
  { key: "dashboard", label: "현황판",   suffix: "/dashboard" },
  { key: "info",      label: "정보",     suffix: "/info"      },
] as const;

export function TabNav({ challengeId }: { challengeId: string }) {
  const pathname = usePathname();
  return (
    <div role="tablist" aria-label="챌린지 보기" className="bg-muted flex gap-1 rounded-full p-1">
      {TABS.map((t) => {
        const href = `/challenge/${challengeId}${t.suffix}`;
        const isActive =
          t.suffix === ""
            ? pathname === `/challenge/${challengeId}`
            : pathname.startsWith(href);
        return (
          <Link
            key={t.key}
            href={href}
            role="tab"
            aria-selected={isActive}
            prefetch
            className={cn(/* on/off 스타일 — 기존 ChallengeTabs 와 동일 */)}
          >
            <TabLabel label={t.label} />
          </Link>
        );
      })}
    </div>
  );
}

function TabLabel({ label }: { label: string }) {
  const { pending } = useLinkStatus();
  return (
    <span className="inline-flex items-center gap-1">
      {label}
      {pending && <Loader2 className="size-3 animate-spin" aria-hidden="true" />}
    </span>
  );
}
```

**왜**: `useLinkStatus()`는 같은 `<Link>` 자식 트리 안에서만 동작. label 옆에 spinner 를 두면 클릭 즉시 시각 피드백 + streaming 시작.

**prefetch 트레이드오프**: `<Link prefetch>` 가 viewport 진입 시 자식 page 의 RSC payload 를 미리 fetch. 결과적으로 dashboard 의 `fetchChallengeFeed` 가 첫 진입 시점에 미리 실행됨 (info 는 자체 fetch 없음). info 탭만 보는 사용자도 feed fetch 비용을 부분적으로 부담. POC dogfood 단계에서는 "탭 클릭 즉시 전환" 의 사용자 가치가 더 크다고 판단 — prefetch 유지. dogfood 데이터에서 측정 후 `prefetch="auto"` (hover only) 로 다운그레이드 옵션 열어둠.

**개발 환경 주의**: Next.js prefetch 는 production build 에서만 동작. `pnpm dev` 검증 시 탭 클릭이 느리게 느껴질 수 있음 — 본 PR 검증은 반드시 `pnpm build && pnpm start` 모드에서 수행.

### C5. Skeleton 컴포넌트

- `loading.tsx` (feed): 피드 카드 3개 placeholder + KudosBar shell. `animate-pulse` + `bg-card rounded-2xl` 톤.
- `dashboard/loading.tsx`: 4-cell 통계 shell + member rank list shell.
- `info/loading.tsx`: textblock shell (가장 가벼움 — 실제로 거의 안 보일 수 있음).
- shell-level `loading.tsx` (`challenge/[id]/loading.tsx`): 첫 진입 시 layout 자체가 streaming 중일 때 사용. 자식 loading 이 이미 격리하므로 선택적 — 첫 컷에 두지 않고 dogfood 보고 결정.

### C6. React `cache()` dedupe

- `src/lib/db/reads/challenge-detail.ts` · `src/lib/db/reads/challenge-feed.ts` 의 export 함수를 `cache(async (...) => {...})` 로 wrapping.
- **auth dedupe**: layout 과 모든 page 가 인증된 user 를 필요로 한다. 새 helper `getAuthedUser = cache(async () => { ... })` 를 `src/lib/supabase/auth.ts` (신규) 에 추가 — 내부에서 `createClient()` 호출 후 `auth.getUser()` 결과 반환. layout 의 redirect 가드와 각 page 의 user.id 참조가 같은 request 안에서 1회 호출로 dedupe.
- layout 과 page 가 같은 request 안에서 같은 인자로 부르면 DB hit / 네트워크 호출 1회.
- 함수 시그니처 변화 없음 (`fetchChallengeDetail` / `fetchChallengeFeed`). 신규 `getAuthedUser` 는 호출처에서 `const { user } = await getAuthedUser()` 형태.

**왜**: nested segments 가 같은 reader 를 양쪽에서 부르므로 dedupe 가 없으면 DB · Supabase auth round-trip 비용이 2-3배가 된다. POC 단계에서도 latency 영향 가시화.

### C7. 홈 row pending indicator

`running-challenge-list.tsx` 의 `<Link>` 자식에 `RowPendingIndicator` 추가. 새 파일을 만들지 않고 **같은 파일 내부 함수 컴포넌트**로 두어 외과적 변경 유지.

```tsx
// running-challenge-list.tsx 내부 (export 하지 않음)
function RowPendingIndicator({ daysLeft, joinedLate, status }: {...}) {
  const { pending } = useLinkStatus();
  if (pending) return <Loader2 className="size-4 animate-spin" aria-hidden="true" />;
  return (
    <span className="t-caption shrink-0 tabular-nums">
      {joinedLate ? "다음부터" : status === "active" ? `D-${daysLeft}` : "대기"}
    </span>
  );
}
```

- `useLinkStatus`는 `<Link>` 자식에서만 동작하므로 D-N 자리에서 직접 호출.
- row 전체 opacity 변경은 본 PR 스코프 밖 (필요 시 wrapper child 패턴으로 추후).
- `<Link>` 클릭 시 row 의 D-N 영역이 spinner 로 즉시 교체 → 사용자에게 "이동이 시작되었다"는 시각 신호.

### C8. F8 결과 모달 URL 갱신

`action-result-dialog.tsx:50`:
```ts
router.replace(`/challenge/${challengeId}?tab=dashboard`)
// → 
router.replace(`/challenge/${challengeId}/dashboard`)
```

## Alternatives Considered

ADR-0010 §Alternatives 참조 — `history.replaceState` · parallel routes · `cache()` only 세 가지 검토 후 본 안 채택.

## Verification

### 명령

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build && pnpm start   # prefetch 동작 검증을 위해 production mode 필수
```

수동 검증 (모바일 viewport, iPhone 13 Pro emulation, **production mode** 에서):

```bash
# 1. 홈 → 진행 중 카드 클릭 → row spinner + 상세 skeleton 확인
# 2. 상세 → 탭 전환 (feed → dashboard → info → feed) 각 < 200ms 체감
# 3. 직접 진입: /challenge/[id]/dashboard URL 입력 → 정상 표시
# 4. ?tab= 호환: /challenge/[id]?tab=info → /info 로 redirect 확인
# 5. ?just_joined=1 진입: /challenge/[id]?just_joined=1 → /info?just_joined=1 로 redirect + JustJoinedBanner 표시
# 6. F8 결과 모달 CTA → dashboard 진입 확인
# 7. 브라우저 back/forward 로 탭 사이 이동 확인
# 8. 탭 사이 back/forward 시 scroll 위치 복원 확인 (feed 에서 스크롤 → dashboard → back → 원래 위치)
# 9. DevTools Slow 3G 에서 row spinner → skeleton → 콘텐츠 3단계 전환 자연스러움 확인
# 10. 챌린지 종료 직후 push 진입 (또는 endAt 과거 데이터 시드) → ChallengeEndedBanner 즉시 표시 확인
```

### 시나리오

**정상 케이스:**
- 진행 중 챌린지 카드 클릭 → row 의 D-N 자리에 spinner 즉시 표시 → 상세 페이지의 feed skeleton 으로 전환 → 데이터 도착 시 카드 렌더.
- feed 탭 진입 후 dashboard 클릭 → label 옆 spinner + dashboard skeleton → DashboardTab 렌더. layout 은 재실행되지 않음 (StatusCard 깜박임 없음).
- `/challenge/[id]?tab=dashboard` 직접 진입 → `/challenge/[id]/dashboard` 로 redirect.
- F8 결과 모달 "확인" → `/challenge/[id]/dashboard` 진입.

**엣지 케이스:**
- 미인증 사용자 직접 진입 → layout 의 `auth.getUser()` 에서 `/login` redirect.
- 존재하지 않는 챌린지 ID → layout 의 `fetchChallengeDetail` 결과 null → `notFound()`.
- 종료된 챌린지 → `ChallengeEndedBanner` 표시 (모든 탭에서 보임).
- 서명 안 한 멤버 진입 → 서명 안내 카드 (모든 탭에서 보임).
- 브라우저 back 으로 탭 이동 → URL 과 active 탭이 동기화됨.
- `?just_joined=1` 진입 → info 탭이 기본 (현재 동작 보존을 위해 layout redirect 분기).

## Rollout

1. ADR-0010 머지 (본 PR 과 동시).
2. PR 머지 후 staging dogfood 1-2일 → 탭 전환 체감 · 진입 피드백 확인.
3. 운영 데이터(`/api/analytics` 또는 PostHog) 에서 `challenge_detail_open` · 탭 전환 빈도 변화 관찰.
4. dogfood 결과 OK → main 머지. 회귀 발견 시 §롤백.

### 롤백

- PR 단일 commit 으로 정리 → revert 1회.
- redirect 와 routing 모델이 함께 묶여 있어 partial rollback 은 비추천. 전체 revert.

## Out of scope

- `group/[id]` 등 다른 페이지의 탭 모델 — 동일 패턴 적용 여부는 별도 결정.
- PPR / 부분 캐시 도입 — 본 PR 은 routing 만 정리, 추후 별도 spec.
- 알림 페이로드의 `?tab=` 딥링크 사용 여부 — `src/lib/push/dispatch.ts` 검색 결과 `/challenge/${id}` (default feed) + `/challenge/${id}/action` 만 사용. 새 구조 호환. 추가 발견 시 별도 fix.
- iOS Safari 의 swipe-to-back gesture 와 탭 라우팅 호환성 — dogfood 에서 확인 후 별도 이슈.
- row 전체 opacity 피드백 (D-N spinner 만 본 PR 스코프).
- Segment 별 `error.tsx` 추가 (네트워크 실패 fallback) — POC 는 root error boundary 로 충분. 본격 운영 전 별도 PR.
- skeleton 의 flash-of-skeleton 방지 (최소 표시 시간) — 데이터 부재 시 사용자 인지 못함. POC 외.

## 용어집

- **ADR**: Architecture Decision Record. `docs/adr/` 의 짧은 결정 기록.
- **dogfood**: 팀 내부 사용으로 실사용 검증하는 단계.
- **PPR**: Partial Prerendering. Next.js 의 정적/동적 혼합 렌더링 모델.
- **prefetch**: Next.js `<Link>` 가 viewport/hover 진입 시 다음 segment 를 미리 가져오는 동작.
- **RSC**: React Server Component. 서버에서 렌더되는 React 컴포넌트, 클라이언트 번들 미포함.
- **shell**: 페이지의 공용 골격(banner · status · nav · 슬롯). 탭마다 바뀌지 않는 부분.
- **soft navigation**: Next.js 의 client-side route 전환. URL 만 바뀌고 RSC payload 만 fetch.
- **SoT**: Single Source of Truth. 중복 정의 없이 기준으로 삼는 단일 원본.
- **streaming**: 서버가 HTML 을 조각으로 보내는 방식. `loading.tsx` 와 결합되어 skeleton 후 콘텐츠.
