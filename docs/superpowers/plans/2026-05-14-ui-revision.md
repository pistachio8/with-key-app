# 2026-05-14 UI Revision Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `docs/mockups/2026-05-14-ui-revision.html` 모킹업의 시각·정보구조·플로우를 with-key 앱 전체에 점진 적용. 기존 데이터 흐름(Server Action·RSC)은 유지하고 시각 레이어만 교체.

**Architecture:** 토큰·프리미티브 PR을 먼저 머지(PR1 foundation)한 뒤 라우트별 1 PR씩 점진 마이그레이션(PR2~7). ADR은 시각 PR보다 먼저 머지(PR0)하여 모킹업이 SoT라는 정책을 코드보다 앞에 박는다. PRD는 시각 PR 종료 후 cleanup PR로 일괄 동기화(PR8).

**Tech Stack:** Next.js 16 App Router · React 19 · TypeScript · Tailwind 4 · shadcn primitives(유지) · Pretendard Variable(next/font/local) · lucide-react(이미 설치) · vitest · Playwright · axe-core(신규 devDep)

**SoT:** 모킹업이 시각·IA·플로우의 SoT. PRD가 모킹업과 충돌하면 PRD를 후행 업데이트. 결정적 충돌(데이터 모델·RLS·인증 영향)은 작업 중단·사용자 확인.

**메모리 참조:** `~/.claude/projects/-Users-ian-gitlab-with-key/memory/project_ui_revision_sot.md`

---

## File Structure

신규 또는 수정될 파일 — 책임별로 분리.

### 신규 (PR1 foundation)

| Path | 책임 |
|---|---|
| `public/fonts/PretendardVariable-Subset.woff2` | Pretendard Variable subset 폰트 파일 (~80KB) |
| `src/app/fonts.ts` | `next/font/local`로 Pretendard 로드, CSS 변수 export |
| `src/components/ui/card.tsx` | 범용 Card primitive (모킹업 `.card` 매핑) |
| `src/components/ui/chip.tsx` | 범용 Chip/Badge primitive |
| `src/components/ui/fab.tsx` | Floating Action Button (홈 중앙 +) |
| `src/components/ui/stamp.tsx` | 도장 애니메이션 (IntersectionObserver, 마운트당 1회) |
| `src/components/ui/icon-button.tsx` | 헤더용 아이콘 버튼 (알림·마이) |
| `src/components/ui/skeleton.tsx` | 로딩 skeleton variants |
| `src/components/ui/empty-state.tsx` | 통일된 EmptyState |
| `src/components/ui/error-state.tsx` | 통일된 ErrorState |
| `src/components/ui/share-card.tsx` | 그라데이션 브랜드 카드 (홈+공유+초대 3곳) |
| `src/components/ui/keyword-donut.tsx` | 키워드 도넛 차트 카드 (홈+상세) |
| `src/app/(app)/loading.tsx` | (app) 그룹 페이지 로딩 |
| `src/app/(auth)/loading.tsx` | (auth) 그룹 페이지 로딩 |
| `tests/unit/tokens.spec.ts` | 토큰값 회귀 단위 테스트 |
| `tests/a11y/foundation.spec.ts` | axe-core PR1 1회 검증 |

### 수정 (PR1 foundation)

| Path | 변경 |
|---|---|
| `src/app/globals.css` | shadcn 토큰값 교체 + brand-* 추가 토큰 + 모션 토큰 + typography utility classes |
| `src/app/layout.tsx` | Geist 폰트 import 제거, Pretendard fonts.ts 사용 |
| `.github/pull_request_template.md` | 시각 PR용 캡처·접근성 체크 섹션 추가 |
| `package.json` | `axe-core` `@axe-core/playwright` devDependency 추가 |

### PR2~7에서 수정될 파일 (결정 반영)

| PR | 주요 경로 |
|---|---|
| PR2 app-shell | `src/components/app-shell/app-header.tsx`(신규) · `bottom-nav.tsx` **삭제** · `(app)/layout.tsx` |
| PR3 auth | `(auth)/login/page.tsx` · `(auth)/login/_components/*` (`onboarding-slides.tsx` 신규) · `(auth)/invite/[token]/page.tsx` |
| PR4 home | `(app)/home/page.tsx` · `(app)/home/_components/*` (stats-grid·invited-banner·running-list 신규) · `src/lib/db/reads/home-stats.ts`(신규) |
| PR5 challenge | `(app)/challenge/new/**` (`FrequencyStepper`·`PenaltyPicker`·`EndDatePicker` 신규) · `(app)/challenge/[id]/page.tsx` (3-탭 통합) · `(app)/challenge/[id]/_components/{challenge-tabs,status-card,owner-menu,...}.tsx` · `(app)/challenge/[id]/pledge/page.tsx` (이동) · `(app)/challenge/[id]/recap/page.tsx` (이동) · `src/lib/challenge/frequency.ts` (신규) · `src/lib/validators/challenge.ts` (penaltyAmount min(0) + durationDays min(7) — spec 동반) · `supabase/migrations/0024_challenge_validators_revision.sql` (필요 시) · `src/app/share/[challengeId]/opengraph-image.tsx`(신규) · `(app)/pledge/**` 폐기 · `(app)/recap/**` 폐기 · `(app)/group/new/**` 폐기 |
| PR6 feed/action | `(app)/feed/**` **폐기** (→ challenge 안 탭) · `(app)/challenge/[id]/action/page.tsx` (`(app)/action/**` 이동) · `(app)/challenge/[id]/_components/feed-tab.tsx` (피드 탭) · `(app)/challenge/[id]/_components/dashboard-tab.tsx` (현황판 탭) · `(app)/challenge/[id]/action/_components/*` |
| PR7 me/group/notifications | `(app)/me/page.tsx`(신규) · `(app)/me/_components/{profile,notification,my-challenges,legal,logout}-card.tsx` (신규 5개) · `(app)/me/_actions.ts` (signOut) · `(app)/me/challenges/page.tsx` (옛 §12 흡수) · `(app)/group/[id]/page.tsx`(신규) · `(app)/group/[id]/_components/*` (group-detail·calc-input) · `(app)/notifications/page.tsx`(신규) · `(app)/settings/**` → `/me` redirect · `src/lib/db/reads/my-challenge-counts.ts`(신규) |

### PR0 (사전) · PR8 (사후)

| Path | 책임 |
|---|---|
| `docs/adr/0002-2026-05-14-ui-revision-as-sot.md` | UI 리비전 = SoT 정책 (PR0-A) |
| `docs/adr/0003-2026-05-14-group-ux-implicit-auto-creation.md` | 그룹 자동 생성·명시 UI 폐기 (PR0-B) |
| `docs/adr/0004-2026-05-14-end-date-picker-min-week.md` | 종료일 사용자 선택 + 최소 1주 (PR0-C) |
| `docs/superpowers/specs/2026-05-14-challenge-validators-revision.md` | `penaltyAmount.min(0)` + `durationDays.min(7)` 변경 근거 (PR5 동반) |
| `docs/PRD.md` | 모킹업 반영 일괄 업데이트 (PR8) |
| `docs/BE_SCHEMA.md` | IA 변경 + penalty CHECK 갱신으로 인한 표 갱신 (PR8) |

---

## PR0: 2개 ADR — SoT 정책 + 그룹 UX 모델

PR0은 ADR 2개를 한 PR에 묶어 머지 (둘 다 짧고 정책적, 코드 변경 없음).

### PR0-A: ADR-0002 — UI 리비전이 시각·IA·플로우 SoT

**Branch:** `chore/adr-ui-revision-sot`
**Base:** `develop`
**Files:** Create: `docs/adr/0002-2026-05-14-ui-revision-as-sot.md`

### Task 0.1: ADR 작성 + 머지

- [ ] **Step 1: scaffolding으로 빈 ADR 생성**

```bash
pnpm new adr 2026-05-14-ui-revision-as-sot
```

Expected: `docs/adr/0002-2026-05-14-ui-revision-as-sot.md` 생성

- [ ] **Step 2: ADR 본문 작성**

```markdown
# ADR-0002: 2026-05-14 UI 리비전 — 모킹업이 시각·IA·플로우 SoT

**Date**: 2026-05-14
**Status**: accepted
**Deciders**: ian.jung@gbike.io (PO)

## Context

POC 1주차 종료, 2주차 dogfood 직전에 디자인 리비전 v4
(`docs/mockups/2026-05-14-ui-revision.html`)를 받음. 단순 시각 교체가 아니라
정보 구조(IA)·플로우 재설계가 포함됨. 예:

- 참여완료 화면 별도 라우트 폐기 → 서명 직후 redirect + 보너스 배너
- 외부 공유는 별도 화면이 아니라 og:image 동적 라우트로 처리
- BottomNav 탭 재정의 (구: 홈/인증/서약서 → 신: 홈/그룹/FAB/피드/마이)

기존 PRD는 시각 리비전 전 IA에 정렬돼 있어 모킹업과 다수 충돌.

## Decision

UI 리비전 작업(`docs/superpowers/plans/2026-05-14-ui-revision.md`) 기간 동안
**모킹업이 시각·정보구조·플로우의 Single Source of Truth**.

- 시각(레이아웃·색·간격·아이콘·typography): 모킹업 우선
- 정보 구조·카피·유저 플로우: 모킹업 우선
- 충돌 시 PRD를 모킹업에 맞춰 후행 업데이트 (PR8 cleanup)
- 결정적 충돌(데이터 모델·RLS·인증 플로우 등 되돌리기 비용이 큰 영역)은
  자동 결정 금지 → PO 확인 후 진행
- WCAG AA contrast 검증에서 모킹업 컬러가 fail이면 → PO에게 미세조정 안 제시 후 결정

## Alternatives Considered

### 1. PRD를 사전에 일괄 업데이트한 뒤 시각 PR 진행

- **Pros**: 코드와 문서 항상 sync
- **Cons**: PRD 업데이트 자체가 큰 단일 PR이 되고, 시각 구현이 그만큼 지연
- **Why not**: dogfood 직전 일정 압박, 모킹업 의도가 구현 과정에서 추가 검증되어야
  PRD를 한 번에 정확히 쓸 수 있음

### 2. 시각 PR마다 그 화면의 PRD 섹션을 같이 갱신

- **Pros**: 매 PR 코드/문서 sync
- **Cons**: PR 본문 비대, 시각 변경과 IA 결정이 한 PR에 섞임
- **Why not**: 가드레일 §"외과적 수정" — 시각/문서 변경 분리가 리뷰 효율 ↑

## Consequences

### 긍정적

- 시각 PR은 시각만 → 리뷰 부담 최소, 회귀 추적 명확
- PRD cleanup PR이 "실제 머지된 결과"를 보고 일괄 정리 → drift 사이클 단축
- 정책이 코드보다 먼저 머지되어 도구·사람 합류 시 혼란 없음

### 부정적 / 비용

- PR0~PR7 기간(예상 7~10일) 동안 PRD가 stale
  → 이 ADR이 stale 사실과 cleanup 일정을 명시함으로써 허용

### 후속 영향

- PR8(`docs: UI 리비전 PRD 동기화`)에서 PRD §2·§3·§4·§5·§9.1 영향 영역 갱신
- 키워드 풀(`src/lib/keywords/pool.ts`)은 POC freeze 정책 유지
- `src/lib/analytics/track.ts`는 IA 변경이 이벤트 송신 지점에 영향 줄 수 있음 → PR6/PR7에서 발견 시 spec 동반
```

- [ ] **Step 3: 검증 + 커밋 (PR은 ADR-0003 다음에 함께 생성)**

```bash
pnpm validate:docs
git checkout -b chore/adr-ui-revision-sot
git add docs/adr/0002-2026-05-14-ui-revision-as-sot.md
git commit -m "docs(adr): UI 리비전 — 모킹업이 시각·IA·플로우 SoT (ADR-0002)"
```

### PR0-B: ADR-0003 — 그룹 UX (자동 그룹 + 명시 UI 폐기)

**Files:** Create: `docs/adr/0003-2026-05-14-group-ux-implicit-auto-creation.md`

- [ ] **Step 1: scaffolding**

```bash
pnpm new adr 2026-05-14-group-ux-implicit-auto-creation
```

- [ ] **Step 2: ADR 본문**

```markdown
# ADR-0003: 그룹 UX — 자동 그룹 생성 + 명시 UI 폐기

**Date**: 2026-05-14
**Status**: accepted
**Deciders**: ian.jung@gbike.io (PO)

## Context

2026-05-14 UI 리비전 모킹업은 "그룹" 개념을 UX에서 **숨김**:
- 챌린지 생성 wizard에 그룹 입력 UI 없음
- 모킹업 13개 섹션 어디에도 "그룹 만들기" 화면 없음
- 사용자에게 챌린지가 1차 시민, 그룹은 데이터 모델 차원만

그러나 `groups` 테이블은 BE_SCHEMA §5.2의 1차 시민이며 migration 23개·RPC·RLS·계좌 암호화가 모두 그룹 단위. 데이터 모델 차원의 그룹 제거는 POC 범위 초과.

## Decision

**데이터 모델은 유지, UX 차원에서만 그룹을 숨김:**

- 첫 챌린지 생성 시 `createChallenge` Server Action이 그룹을 **자동 생성** (이름: `{displayName}님과 친구들`, 계좌 없이)
- `/group/new` 명시 라우트 **폐기** (PR5)
- `/group/[id]/page.tsx` **신설** (PR7) — 그룹 상세 = 챌린지 리스트 + 멤버 + 계좌 설정
- **계좌 입력은 lazy** — 정산 시점 (§11 "정산 요청" 클릭 시 계좌 없으면 inline prompt) + `/me` 안 group 카드 두 곳에서 가능
- 헤더 chevron-down sheet으로 그룹 전환 (BottomNav 없음 — ADR-0004 참조)

## Alternatives Considered

### 1. 그룹 = 챌린지 1:1 매핑 강제

- **Pros**: UX 단순
- **Cons**: BE_SCHEMA §5.2 모델과 충돌, migration 다수 + RLS 재작성 = POC 범위 초과
- **Why not**: 비용 ↑↑

### 2. 현 코드 유지 + 모킹업 카피만 톤다운

- **Pros**: 코드 변경 최소
- **Cons**: 모킹업 §3 챌린지 생성 wizard에 그룹 입력이 없는데 현 코드는 명시 — IA 갭 그대로
- **Why not**: ADR-0002 "모킹업 SoT" 정신과 충돌

## Consequences

### 긍정적

- 데이터 모델·RLS·migration 무손상 → 가드레일 §3 §Supabase/RLS 준수
- 모킹업 의도(그룹 명시 UI 없음)를 시각 레이어에서 구현
- 사용자 onboarding 마찰 ↓ (그룹 만들기 단계 생략, 계좌 lazy)

### 부정적 / 비용

- `createChallenge` Server Action에 그룹 자동 생성 로직 추가
- 계좌 입력 lazy 트리거 카피 신설 (정산 시점)
- `/group/new` 옛 라우트 deprecation — 외부 링크 보존 위해 redirect

### 후속 영향

- `createChallenge` Server Action 변경 → `src/lib/validators/challenge.ts` spec 동반 가능 (PR5)
- `/group/new/_actions.ts` `createGroup` 함수는 `/group/[id]` settings 내부에서 metadata edit·계좌 추가용으로 재활용
- PRD §3 그룹 서약서 섹션 — 시각·UX 카피 갱신 (PR8)
```

- [ ] **Step 3: 검증 + 커밋**

```bash
pnpm validate:docs
git add docs/adr/0003-2026-05-14-group-ux-implicit-auto-creation.md
git commit -m "docs(adr): 그룹 UX — 자동 그룹 + 명시 UI 폐기 (ADR-0003)"
```

### PR0-C: ADR-0004 — 챌린지 종료일 사용자 선택 + 최소 1주

**Files:** Create: `docs/adr/0004-2026-05-14-end-date-picker-min-week.md`

- [ ] **Step 1: scaffolding**

```bash
pnpm new adr 2026-05-14-end-date-picker-min-week
```

- [ ] **Step 2: ADR 본문**

```markdown
# ADR-0004: 챌린지 종료일 사용자 선택 + 최소 1주 제약

**Date**: 2026-05-14
**Status**: accepted
**Deciders**: ian.jung@gbike.io (PO)

## Context

이전 grill round 에서 모킹업 §3-A calendar 아이콘을 "number input 트리거"로 처리하기로 결정 (date-picker 라이브러리 미도입). 사용자 review 후 의도 재확인 — **종료일이 필요하고 최소 1주 이상**.

Q13 grill round 에서 다음 의미 명확화:
- 종료일 절대 날짜 선택 (캘린더) → 시스템이 `duration_days` 변환
- 시작일은 서버 결정 유지 (전원 서명 시점)
- 최소 1주 기준은 오늘 (사용자 입력 시점)

## Decision

- **react-day-picker + date-fns 도입** (~40KB gzipped)
- `EndDatePicker` 컴포넌트 신설 (3 preset pill + 캘린더)
- `validators.durationDays.min(7)` — 1주 미만 차단
- `start_at` 서버 결정 유지 (현 transition model 무변경)
- `duration_days = endDate - today` 계산 (생성 시점 기준)
- 모킹업 §3-A "최대 3개월" 카피 그대로 (max 90 유지)

## Alternatives Considered

### 1. 사용자가 시작일도 선택 (Q13-B-ii)

- **Pros**: 챌린지 시간 윈도우 완전 사용자 제어
- **Cons**: 현 transition model(전원 서명 = active) 충돌, ADR 추가 + RPC 갱신
- **Why not**: POC 범위 초과

### 2. 시작일 = 생성일 (Q13-B-iii)

- **Pros**: 가장 단순
- **Cons**: 전원 서명 model 폐기 = PRD §3 그룹 서약서 §3.3 AC 다수 영향
- **Why not**: PRD 큰 변경, 기능 핵심 (서약서 → 동시 시작) 손상

### 3. number input 유지 (이전 결정)

- **Pros**: 라이브러리 도입 없음, 코드 단순
- **Cons**: 사용자가 절대 날짜 인식 어려움, "언제 끝나는지" 직관 ↓
- **Why not**: PO review 후 의도 재확인 — 종료일 캘린더 UX 가치 ↑

## Consequences

### 긍정적

- 모킹업 §3-A calendar 아이콘 의도 충실 구현
- 종료일 시각 명확 ("2026-06-12 (목)" 표기)
- 1주 미만 챌린지 차단으로 의미 있는 dataset 보장
- POC v1 이후 시작일 선택 등 확장 자연스러움

### 부정적 / 비용

- `react-day-picker` + `date-fns` 의존성 추가 (~40KB)
- `validators/challenge.ts` 변경 → spec-required + spec 작성 (2026-05-14-challenge-validators-revision)
- migration CHECK 갱신 가능성 → `0024_challenge_validators_revision.sql`
- PRD §3.3·§8.2 D-006 (duration_days "POC 고정: 7") 갱신 (PR8)

### 후속 영향

- PRD §3.3 AC 갱신 — "최소 1주" 명시
- PRD §8.2 challenges.duration_days 비고 "POC 고정: 7" → "7~90"
- BE_SCHEMA §5.5 D-006 갱신
- migration 0024 신설 (CHECK 변경 필요 시)
```

- [ ] **Step 3: 커밋**

```bash
git add docs/adr/0004-2026-05-14-end-date-picker-min-week.md
git commit -m "docs(adr): 챌린지 종료일 사용자 선택 + 최소 1주 (ADR-0004)"
```

### PR0 통합 PR 생성

- [ ] **Step: gh pr create (두 ADR 한 PR)**

```bash
gh pr create --base develop --title "docs(adr): UI 리비전 — 모킹업 SoT (ADR-0002) + 그룹 UX (ADR-0003) + 종료일 (ADR-0004)" --body "$(cat <<'EOF'
## Summary
- ADR-0002: 2026-05-14 UI 리비전 동안 모킹업이 시각·IA·플로우 SoT
- ADR-0003: 그룹 UX — 자동 그룹 생성 + 명시 UI 폐기 (데이터 모델 보존)
- ADR-0004: 챌린지 종료일 사용자 선택 + 최소 1주 (react-day-picker 도입)

## Spec / ADR
- 신규: docs/adr/0002-2026-05-14-ui-revision-as-sot.md
- 신규: docs/adr/0003-2026-05-14-group-ux-implicit-auto-creation.md
- 신규: docs/adr/0004-2026-05-14-end-date-picker-min-week.md
- 후속 plan: docs/superpowers/plans/2026-05-14-ui-revision.md
- 후속 spec: docs/superpowers/specs/2026-05-14-challenge-validators-revision.md (PR5 동반)

## with-key 가드레일 체크
- [x] Supabase migration 변경 없음 (CHECK 변경은 PR5에서)
- [x] src/lib/{validators, analytics/track, keywords/pool}.ts 미변경 (PR5에서 변경 + spec)
- [x] middleware.ts 미변경
- [x] 신규 env 변수 없음

## Verification
- [x] pnpm validate:docs

## Rollback
3 commits revert. 코드 영향 없음.
EOF
)"
```

---

## PR1: Foundation — 토큰·폰트·primitive·상태 컴포넌트

**Branch:** `feat/ui-foundation` · **Base:** `develop` (PR0 머지 후)

### Task 1.1: Pretendard 폰트 셋업

- [ ] **Step 1: 폰트 파일 다운로드**

```bash
mkdir -p public/fonts
curl -L -o public/fonts/PretendardVariable-Subset.woff2 \
  https://github.com/orioncactus/pretendard/raw/v1.3.9/packages/pretendard/dist/web/variable/woff2-subset/PretendardVariable-Subset.woff2
ls -lh public/fonts/PretendardVariable-Subset.woff2
```

Expected: 약 80KB. 100KB 초과면 풀세트 잘못 받은 것, subset URL 재확인.

- [ ] **Step 2: `src/app/fonts.ts` 생성**

```typescript
import localFont from "next/font/local";

export const pretendard = localFont({
  src: "../../public/fonts/PretendardVariable-Subset.woff2",
  display: "swap",
  variable: "--font-sans",
  weight: "45 920",
});
```

- [ ] **Step 3: `src/app/layout.tsx` 수정**

```typescript
import type { Metadata, Viewport } from "next";
import { Toaster } from "@/components/ui/sonner";
import { PwaRegister } from "@/components/pwa-register";
import { pretendard } from "./fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: "from. with",
  description: "혼자, 또는 친구와 함께하는 운동 기록",
  manifest: "/manifest.json",
  icons: { icon: "/icons/icon-192.png", apple: "/icons/icon-192.png" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko" className={`${pretendard.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <PwaRegister />
        {children}
        <Toaster />
      </body>
    </html>
  );
}
```

- [ ] **Step 4: 폰트 wiring 검증**

```bash
pnpm dev
```

DevTools Network 탭에서 `PretendardVariable-Subset.woff2`가 같은 도메인에서 1회 fetch 되는지 확인.

### Task 1.2: 디자인 토큰 교체 — `globals.css`

- [ ] **Step 1: `src/app/globals.css` 전체 교체**

```css
@import "tailwindcss";
@import "tw-animate-css";
@import "shadcn/tailwind.css";

@custom-variant dark (&:is(.dark *));

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --font-sans: var(--font-sans);
  --font-mono: var(--font-sans);
  --font-heading: var(--font-sans);
  --color-sidebar-ring: var(--sidebar-ring);
  --color-sidebar-border: var(--sidebar-border);
  --color-sidebar-accent-foreground: var(--sidebar-accent-foreground);
  --color-sidebar-accent: var(--sidebar-accent);
  --color-sidebar-primary-foreground: var(--sidebar-primary-foreground);
  --color-sidebar-primary: var(--sidebar-primary);
  --color-sidebar-foreground: var(--sidebar-foreground);
  --color-sidebar: var(--sidebar);
  --color-chart-5: var(--chart-5);
  --color-chart-4: var(--chart-4);
  --color-chart-3: var(--chart-3);
  --color-chart-2: var(--chart-2);
  --color-chart-1: var(--chart-1);
  --color-ring: var(--ring);
  --color-input: var(--input);
  --color-border: var(--border);
  --color-destructive: var(--destructive);
  --color-accent-foreground: var(--accent-foreground);
  --color-accent: var(--accent);
  --color-muted-foreground: var(--muted-foreground);
  --color-muted: var(--muted);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-secondary: var(--secondary);
  --color-primary-foreground: var(--primary-foreground);
  --color-primary: var(--primary);
  --color-popover-foreground: var(--popover-foreground);
  --color-popover: var(--popover);
  --color-card-foreground: var(--card-foreground);
  --color-card: var(--card);
  --color-brand-accent: var(--brand-accent);
  --color-brand-pink: var(--brand-pink);
  --color-brand-danger: var(--brand-danger);
  --color-brand-warn: var(--brand-warn);
  --color-brand-success: var(--brand-success);
  --color-brand-secondary-soft: var(--brand-secondary-soft);
  --color-brand-primary-soft: var(--brand-primary-soft);
  --radius-sm: calc(var(--radius) * 0.6);
  --radius-md: calc(var(--radius) * 0.8);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) * 1.4);
  --radius-2xl: calc(var(--radius) * 1.8);
  --radius-3xl: calc(var(--radius) * 2.2);
}

:root {
  /* 모킹업 v4 팔레트 — hex → oklch */
  --background: oklch(0.975 0.005 264);          /* #F7F8FB */
  --foreground: oklch(0.235 0.014 268);          /* #22262E */
  --card: oklch(1 0 0);
  --card-foreground: oklch(0.235 0.014 268);
  --popover: oklch(1 0 0);
  --popover-foreground: oklch(0.235 0.014 268);
  --primary: oklch(0.72 0.106 268);              /* #8AA4FF */
  --primary-foreground: oklch(1 0 0);
  --secondary: oklch(0.886 0.107 87);            /* #FFD46B */
  --secondary-foreground: oklch(0.235 0.014 268);
  --muted: oklch(0.955 0.005 264);
  --muted-foreground: oklch(0.605 0.015 264);    /* #8B91A1 */
  --accent: oklch(0.78 0.106 295);               /* #BCA6FF */
  --accent-foreground: oklch(0.235 0.014 268);
  --destructive: oklch(0.66 0.207 22);           /* #FF6B6B */
  --border: oklch(0.93 0.008 264);
  --input: oklch(0.93 0.008 264);
  --ring: oklch(0.72 0.106 268);
  --chart-1: oklch(0.72 0.106 268);
  --chart-2: oklch(0.886 0.107 87);
  --chart-3: oklch(0.78 0.106 295);
  --chart-4: oklch(0.79 0.115 12);
  --chart-5: oklch(0.74 0.155 145);
  --radius: 0.875rem;

  --brand-accent: oklch(0.78 0.106 295);
  --brand-pink: oklch(0.79 0.115 12);
  --brand-danger: oklch(0.66 0.207 22);
  --brand-warn: oklch(0.69 0.18 45);
  --brand-success: oklch(0.74 0.155 145);
  --brand-primary-soft: oklch(0.945 0.022 268);
  --brand-secondary-soft: oklch(0.973 0.04 87);
  --brand-primary-deep: oklch(0.66 0.13 268);    /* AA 보정용 */

  --sidebar: oklch(0.985 0 0);
  --sidebar-foreground: oklch(0.235 0.014 268);
  --sidebar-primary: oklch(0.72 0.106 268);
  --sidebar-primary-foreground: oklch(1 0 0);
  --sidebar-accent: oklch(0.955 0.005 264);
  --sidebar-accent-foreground: oklch(0.235 0.014 268);
  --sidebar-border: oklch(0.93 0.008 264);
  --sidebar-ring: oklch(0.72 0.106 268);

  --motion-fast: 120ms;
  --motion-base: 200ms;
  --motion-slow: 320ms;
  --motion-stamp: 520ms;
  --ease-out-soft: cubic-bezier(0.2, 0.8, 0.2, 1);
  --ease-in-soft: cubic-bezier(0.8, 0.2, 1, 0.6);
}

/* Dark mode 토큰 — POC light-only. 인프라 보존, 활성화 안 함. */
.dark {
  --background: oklch(0.145 0 0);
  --foreground: oklch(0.985 0 0);
  --card: oklch(0.205 0 0);
  --card-foreground: oklch(0.985 0 0);
  --popover: oklch(0.205 0 0);
  --popover-foreground: oklch(0.985 0 0);
  --primary: oklch(0.72 0.106 268);
  --primary-foreground: oklch(0.985 0 0);
  --secondary: oklch(0.269 0 0);
  --secondary-foreground: oklch(0.985 0 0);
  --muted: oklch(0.269 0 0);
  --muted-foreground: oklch(0.708 0 0);
  --accent: oklch(0.78 0.106 295);
  --accent-foreground: oklch(0.985 0 0);
  --destructive: oklch(0.704 0.191 22.216);
  --border: oklch(1 0 0 / 10%);
  --input: oklch(1 0 0 / 15%);
  --ring: oklch(0.72 0.106 268);
  --sidebar: oklch(0.205 0 0);
  --sidebar-foreground: oklch(0.985 0 0);
  --sidebar-primary: oklch(0.72 0.106 268);
  --sidebar-primary-foreground: oklch(0.985 0 0);
  --sidebar-accent: oklch(0.269 0 0);
  --sidebar-accent-foreground: oklch(0.985 0 0);
  --sidebar-border: oklch(1 0 0 / 10%);
  --sidebar-ring: oklch(0.72 0.106 268);
}

@layer base {
  * { @apply border-border outline-ring/50; }
  body { @apply bg-background text-foreground; }
  html { @apply font-sans; }
}

/* Typography utility — γ utility */
@layer components {
  .t-h1 { font-size: 28px; font-weight: 800; letter-spacing: -0.02em; line-height: 1.2; }
  .t-h2 { font-size: 22px; font-weight: 700; letter-spacing: -0.01em; line-height: 1.25; }
  .t-h3 { font-size: 18px; font-weight: 700; letter-spacing: -0.01em; line-height: 1.3; }
  .t-body { font-size: 14px; font-weight: 500; line-height: 1.5; }
  .t-sub { font-size: 13px; font-weight: 500; color: var(--color-muted-foreground); line-height: 1.45; }
  .t-caption { font-size: 11px; font-weight: 600; letter-spacing: 0.04em; color: var(--color-muted-foreground); }
}

@layer utilities {
  @keyframes stamp-in {
    0% { opacity: 0; transform: scale(1.8) rotate(-18deg); }
    60% { opacity: 1; transform: scale(0.92) rotate(-8deg); }
    100% { opacity: 1; transform: scale(1) rotate(-10deg); }
  }
  .animate-stamp-in { animation: stamp-in var(--motion-stamp) var(--ease-out-soft) forwards; }
}

@media (prefers-reduced-motion: reduce) {
  :root {
    --motion-fast: 1ms; --motion-base: 1ms; --motion-slow: 1ms; --motion-stamp: 1ms;
  }
  *, *::before, *::after {
    animation-duration: 1ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 1ms !important;
  }
}
```

- [ ] **Step 2: 시각 회귀 확인 — `pnpm dev` 모바일 393×852로 로그인·홈·피드 진입, 토큰 적용 확인**

### Task 1.3: 토큰 회귀 단위 테스트

- [ ] **Step 1: `tests/unit/tokens.spec.ts` 생성**

```typescript
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf-8");

function extractToken(name: string): string {
  const match = css.match(new RegExp(`--${name}:\\s*([^;]+);`));
  if (!match) throw new Error(`token --${name} not found`);
  return match[1].trim();
}

describe("design tokens (globals.css)", () => {
  it("primary token uses 2026-05-14 mockup palette", () => {
    expect(extractToken("primary")).toContain("oklch(0.72 0.106 268)");
  });
  it("secondary token uses mockup yellow", () => {
    expect(extractToken("secondary")).toContain("oklch(0.886 0.107 87)");
  });
  it("background uses mockup off-white", () => {
    expect(extractToken("background")).toContain("oklch(0.975 0.005 264)");
  });
  it("radius is 0.875rem (14px) per mockup card radius", () => {
    expect(extractToken("radius")).toBe("0.875rem");
  });
  it("brand-* tokens exist for non-semantic mockup colors", () => {
    expect(() => extractToken("brand-pink")).not.toThrow();
    expect(() => extractToken("brand-warn")).not.toThrow();
    expect(() => extractToken("brand-success")).not.toThrow();
    expect(() => extractToken("brand-primary-deep")).not.toThrow();
  });
  it("motion tokens are present", () => {
    expect(() => extractToken("motion-fast")).not.toThrow();
    expect(() => extractToken("motion-base")).not.toThrow();
    expect(() => extractToken("motion-stamp")).not.toThrow();
  });
  it("dark mode infrastructure retained (inactive)", () => {
    expect(css).toMatch(/\.dark\s*{/);
  });
});
```

- [ ] **Step 2: 실행**

```bash
pnpm test tests/unit/tokens.spec.ts
```

Expected: PASS (7 tests)

### Task 1.4: 기본 primitive — Card · Chip · Fab · IconButton

- [ ] **Step 1: `src/components/ui/card.tsx`**

```typescript
import { cn } from "@/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

const cardVariants = cva(
  "rounded-[14px] border border-border/60 bg-card text-card-foreground shadow-[0_1px_2px_rgba(20,24,36,0.04)]",
  {
    variants: {
      padding: { none: "p-0", sm: "p-2.5", md: "p-3.5", lg: "p-5" },
      tone: {
        default: "",
        muted: "bg-muted/60 border-transparent shadow-none",
        primary: "bg-primary text-primary-foreground border-transparent",
      },
    },
    defaultVariants: { padding: "md", tone: "default" },
  },
);

export interface CardProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof cardVariants> {}

export function Card({ className, padding, tone, ...props }: CardProps) {
  return <div className={cn(cardVariants({ padding, tone }), className)} {...props} />;
}
```

- [ ] **Step 2: `src/components/ui/chip.tsx`**

```typescript
import { cn } from "@/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

const chipVariants = cva(
  "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold tracking-wide",
  {
    variants: {
      tone: {
        neutral: "bg-muted text-muted-foreground",
        primary: "bg-brand-primary-soft text-primary",
        secondary: "bg-brand-secondary-soft text-foreground",
        success: "bg-brand-success/15 text-brand-success",
        danger: "bg-destructive/12 text-destructive",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

export interface ChipProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof chipVariants> {}

export function Chip({ className, tone, ...props }: ChipProps) {
  return <span className={cn(chipVariants({ tone }), className)} {...props} />;
}
```

- [ ] **Step 3: `src/components/ui/fab.tsx`**

```typescript
"use client";
import { Plus } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

interface FabProps {
  href?: string;
  onClick?: () => void;
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  className?: string;
}

export function Fab({ href, onClick, label, icon: Icon = Plus, className }: FabProps) {
  const base = cn(
    "inline-flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground",
    "shadow-[0_8px_20px_rgba(111,141,245,0.35)] transition-transform duration-[var(--motion-fast)] ease-[var(--ease-out-soft)]",
    "active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
    className,
  );
  if (href) {
    return (
      <Link href={href} aria-label={label} className={base}>
        <Icon className="size-6" aria-hidden="true" />
      </Link>
    );
  }
  return (
    <button type="button" aria-label={label} onClick={onClick} className={base}>
      <Icon className="size-6" aria-hidden="true" />
    </button>
  );
}
```

- [ ] **Step 4: `src/components/ui/icon-button.tsx`**

```typescript
import { cn } from "@/lib/utils";
import * as React from "react";

interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

export function IconButton({ label, icon: Icon, className, ...props }: IconButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      className={cn(
        "inline-flex size-11 items-center justify-center rounded-full text-foreground/85 transition-colors",
        "hover:bg-muted active:bg-muted active:scale-95",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        className,
      )}
      {...props}
    >
      <Icon className="size-5" aria-hidden="true" />
    </button>
  );
}
```

- [ ] **Step 5: 커밋**

```bash
git add src/components/ui/card.tsx src/components/ui/chip.tsx src/components/ui/fab.tsx src/components/ui/icon-button.tsx
git commit -m "feat(ui): add Card · Chip · Fab · IconButton primitives"
```

### Task 1.5: 도장(Stamp) — IntersectionObserver 1회

- [ ] **Step 1: `src/components/ui/stamp.tsx`**

```typescript
"use client";
import { cn } from "@/lib/utils";
import { useEffect, useRef, useState } from "react";

interface StampProps {
  label: string;
  tone?: "primary" | "success" | "danger";
  className?: string;
}

const TONE = {
  primary: "border-primary text-primary",
  success: "border-brand-success text-brand-success",
  danger: "border-destructive text-destructive",
} as const;

export function Stamp({ label, tone = "primary", className }: StampProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [played, setPlayed] = useState(false);

  useEffect(() => {
    if (played) return;
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setPlayed(true);
            observer.disconnect();
            return;
          }
        }
      },
      { threshold: 0.4 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [played]);

  return (
    <div
      ref={ref}
      role="img"
      aria-label={label}
      data-played={played}
      className={cn(
        "inline-flex size-20 items-center justify-center rounded-full border-[3px] font-bold tracking-wider",
        "opacity-0 scale-150 rotate-[-12deg]",
        "data-[played=true]:animate-stamp-in",
        TONE[tone],
        className,
      )}
    >
      <span className="text-[13px] leading-tight text-center px-2">{label}</span>
    </div>
  );
}
```

- [ ] **Step 2: 단위 테스트 `tests/unit/stamp.spec.tsx`**

```typescript
import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { Stamp } from "@/components/ui/stamp";

describe("Stamp", () => {
  it("registers IntersectionObserver on mount", () => {
    const observe = vi.fn();
    // @ts-expect-error — test-only mock
    global.IntersectionObserver = class {
      observe = observe;
      disconnect = vi.fn();
      unobserve = vi.fn();
      takeRecords = vi.fn(() => []);
      root = null;
      rootMargin = "";
      thresholds = [];
    };
    render(<Stamp label="인증 완료" />);
    expect(observe).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 3: 실행 + 커밋**

```bash
pnpm test tests/unit/stamp.spec.tsx
git add src/components/ui/stamp.tsx tests/unit/stamp.spec.tsx
git commit -m "feat(ui): add Stamp component (1-time IntersectionObserver animation)"
```

### Task 1.6: 상태 컴포넌트 — Skeleton · EmptyState · ErrorState

- [ ] **Step 1: `src/components/ui/skeleton.tsx`**

```typescript
import { cn } from "@/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";

const skeletonVariants = cva("animate-pulse bg-muted", {
  variants: {
    variant: {
      card: "rounded-[14px] h-24 w-full",
      line: "h-3 rounded-full",
      avatar: "rounded-full size-10",
      block: "rounded-md",
    },
  },
  defaultVariants: { variant: "line" },
});

interface SkeletonProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof skeletonVariants> {}

export function Skeleton({ className, variant, ...props }: SkeletonProps) {
  return <div aria-hidden="true" className={cn(skeletonVariants({ variant }), className)} {...props} />;
}
```

- [ ] **Step 2: `src/components/ui/empty-state.tsx`**

```typescript
import { cn } from "@/lib/utils";
import * as React from "react";

interface EmptyStateProps {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-3 py-12 text-center", className)}>
      <Icon className="size-10 text-muted-foreground" aria-hidden="true" />
      <h3 className="t-h3">{title}</h3>
      {description && <p className="t-sub max-w-xs">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
```

- [ ] **Step 3: `src/components/ui/error-state.tsx`**

```typescript
"use client";
import { AlertCircle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ErrorStateProps {
  title?: string;
  description?: string;
  onRetry?: () => void;
  retryLabel?: string;
  className?: string;
}

export function ErrorState({
  title = "문제가 발생했어요",
  description = "잠시 후 다시 시도해 주세요",
  onRetry,
  retryLabel = "다시 시도",
  className,
}: ErrorStateProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-3 py-12 text-center", className)}>
      <AlertCircle className="size-10 text-destructive" aria-hidden="true" />
      <h3 className="t-h3">{title}</h3>
      <p className="t-sub max-w-xs">{description}</p>
      {onRetry && (
        <Button variant="ghost" onClick={onRetry} className="mt-2 gap-1">
          <RotateCcw className="size-4" aria-hidden="true" />
          {retryLabel}
        </Button>
      )}
    </div>
  );
}
```

- [ ] **Step 4: `src/app/(app)/loading.tsx` 와 `src/app/(auth)/loading.tsx`**

```typescript
// (app)/loading.tsx
import { Skeleton } from "@/components/ui/skeleton";
export default function Loading() {
  return (
    <div className="flex flex-col gap-3 p-4">
      <Skeleton variant="line" className="w-32" />
      <Skeleton variant="card" />
      <Skeleton variant="card" />
      <Skeleton variant="card" />
    </div>
  );
}
```

```typescript
// (auth)/loading.tsx
import { Skeleton } from "@/components/ui/skeleton";
export default function Loading() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 p-6 min-h-svh">
      <Skeleton variant="avatar" />
      <Skeleton variant="line" className="w-40" />
      <Skeleton variant="line" className="w-56" />
    </div>
  );
}
```

- [ ] **Step 5: 커밋**

```bash
git add src/components/ui/skeleton.tsx src/components/ui/empty-state.tsx src/components/ui/error-state.tsx 'src/app/(app)/loading.tsx' 'src/app/(auth)/loading.tsx'
git commit -m "feat(ui): add Skeleton · EmptyState · ErrorState + group-level loading.tsx"
```

### Task 1.7: ShareCard · KeywordDonut — 다중 라우트 공용

- [ ] **Step 1: `src/components/ui/share-card.tsx`**

```typescript
import { cn } from "@/lib/utils";

interface ShareCardProps {
  brand?: string;
  title: string;
  subtitle?: string;
  footer?: React.ReactNode;
  className?: string;
}

export function ShareCard({ brand = "FROM. WITH", title, subtitle, footer, className }: ShareCardProps) {
  return (
    <div
      className={cn(
        "rounded-[18px] p-4 text-primary-foreground",
        "bg-[linear-gradient(135deg,#8AA4FF_0%,#BCA6FF_50%,#FFB6C6_100%)]",
        className,
      )}
    >
      <div className="text-[11px] font-bold tracking-[0.05em] opacity-95">{brand}</div>
      <div className="mt-6 text-lg font-bold leading-tight">{title}</div>
      {subtitle && <div className="mt-1 text-xs opacity-90">{subtitle}</div>}
      {footer && <div className="mt-4">{footer}</div>}
    </div>
  );
}
```

- [ ] **Step 2: `src/components/ui/keyword-donut.tsx`**

```typescript
import { cn } from "@/lib/utils";

interface KeywordSlice {
  label: string;
  value: number;
  color: string;
}

interface KeywordDonutProps {
  slices: KeywordSlice[];
  title: string;
  className?: string;
}

export function KeywordDonut({ slices, title, className }: KeywordDonutProps) {
  const stops: string[] = [];
  let cursor = 0;
  for (const s of slices) {
    const next = cursor + s.value;
    stops.push(`${s.color} ${(cursor * 360).toFixed(2)}deg ${(next * 360).toFixed(2)}deg`);
    cursor = next;
  }
  const conic = `conic-gradient(${stops.join(", ")})`;

  return (
    <div
      className={cn(
        "flex w-[220px] items-center justify-between rounded-[14px] border border-border/60 bg-card p-3.5",
        className,
      )}
    >
      <div className="t-body font-semibold">{title}</div>
      <div className="relative size-12 rounded-full" style={{ background: conic }} aria-hidden="true">
        <span className="absolute inset-[6px] rounded-full bg-card" />
      </div>
    </div>
  );
}
```

- [ ] **Step 3: 커밋**

```bash
git add src/components/ui/share-card.tsx src/components/ui/keyword-donut.tsx
git commit -m "feat(ui): add ShareCard · KeywordDonut shared composites"
```

### Task 1.8: axe-core + 접근성 게이트

- [ ] **Step 1: devDependency + dependency 추가**

```bash
pnpm add -D axe-core @axe-core/playwright
# Q13 결정 (ADR-0004): EndDatePicker용 react-day-picker + date-fns
pnpm add react-day-picker date-fns
```

react-day-picker · date-fns 는 PR5 `EndDatePicker` 에서 사용. dep을 PR1 foundation 에서 추가하는 이유 — bundle 크기·번들 영향을 foundation에서 미리 검증 가능.

- [ ] **Step 1b: Playwright config 갱신 — `tests/a11y/` 디렉토리 인식**

`playwright.config.ts` 의 `testDir` 또는 `testMatch` 확인. 기존이 `tests/e2e/`만 본다면 다음 중 하나:

```typescript
// 옵션 1: testDir 확장
export default defineConfig({
  testDir: "tests",
  testMatch: /\.(e2e|spec|a11y)\.ts$/,
  // ...
});

// 옵션 2: projects로 분리 (e2e + a11y 별도)
projects: [
  { name: "e2e", testDir: "tests/e2e" },
  { name: "a11y", testDir: "tests/a11y" },
],
```

추천 **옵션 2** — `pnpm test:e2e --project=a11y` 로 a11y만 격리 실행 가능. `package.json`에 `"test:a11y": "playwright test --project=a11y"` 스크립트 추가.

- [ ] **Step 2: `tests/a11y/foundation.spec.ts`**

```typescript
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test.describe("foundation accessibility — mockup palette", () => {
  test("login page has no AA violations", async ({ page }) => {
    await page.goto("/login");
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
    if (results.violations.length > 0) {
      console.log(JSON.stringify(results.violations, null, 2));
    }
    expect(results.violations).toEqual([]);
  });
});
```

- [ ] **Step 3: 실행**

```bash
pnpm test:e2e tests/a11y/foundation.spec.ts
```

`color-contrast` 위반 발견 시 → 작업 중단 → PR 본문에 위반 캡처 첨부 → PO 결정 요청 (옵션 i: `--primary` 톤 어둡게 / 옵션 ii: 모킹업 그대로) → 결정 후 토큰값 갱신 + 단위 테스트 갱신 후 재실행.

### Task 1.9: PR 템플릿 보강

- [ ] **Step 1: `.github/pull_request_template.md` 끝에 추가**

```markdown
## (시각 PR만) 캡처 · 접근성

- [ ] 393×852 (iPhone 14 Pro) DevTools 모바일 캡처 첨부
- [ ] 360×740 (중급 안드로이드) DevTools 모바일 캡처 첨부
- [ ] 모킹업 해당 섹션과 나란히 비교 캡처
- [ ] 빈 상태·로딩·에러 상태 각각 캡처
- [ ] 키보드 포커스 링 확인 (Tab 한 번)
- [ ] axe-core 통과 또는 위반 + PO 결정 링크
```

- [ ] **Step 2: 커밋**

```bash
git add .github/pull_request_template.md tests/a11y/foundation.spec.ts package.json pnpm-lock.yaml
git commit -m "feat(ui): foundation a11y gate (axe-core) + PR template visual section"
```

### Task 1.10: PR1 종합 검증·PR 생성

**기술 점검 (T1·T2 사전 확인)**:

- [ ] **T1: react-day-picker v9 + date-fns peer dep 버전 확인**
  ```bash
  pnpm why react-day-picker date-fns
  ```
  react-day-picker v9 의 peer `date-fns` 가 v3 이상이면 OK. v4 사용 시 ESM-only — Next.js 16 + Tailwind 4 환경에서 `transpilePackages` 추가 불필요한지 빌드 시 확인. `pnpm build` 에서 에러 나면 `next.config.ts` 에 `transpilePackages: ["react-day-picker"]` 추가
- [ ] **T2: `react-day-picker/style.css` import Tailwind 4 충돌 확인**
  PR1 에서는 import 만 추가하지 않음 (실제 사용은 PR5). PR1 검증은 dep 설치 후 `pnpm build` 통과만 확인. T2 본 검증은 PR5 Task 5.1 Step 4 실 사용 시점
- [ ] **dep 추가 후 번들 크기 회귀 확인**: `pnpm build` 출력에서 main bundle 크기 변화. react-day-picker + date-fns ≈ 40KB → 무시 가능 범위. 100KB 이상 증가면 dynamic import 검토

- [ ] **Step 1: 전체 게이트**

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm build
```

- [ ] **Step 2: 모바일 캡처 — `/login`, `/home`, `/feed`, dialog 1개**

- [ ] **Step 3: PR 생성**

```bash
gh pr create --base develop --title "feat(ui): UI 리비전 PR1 — foundation (토큰·Pretendard·primitive·상태)" --body "<위 양식대로 + 캡처 첨부>"
```

---

## PR2: App-shell — BottomNav 폐기 + AppHeader 신설

**Branch:** `feat/ui-app-shell` · **Base:** `develop` (PR1 머지 후)

**Mockup:** §2 (홈 헤더 + 화면 내 FAB — BottomNav 없음)
**IA 변경 (ADR-0002):** **BottomNav 자체 폐기**. 모킹업에 BottomNav 마크업이 없음 (grep 결과 0건, `fab-center`만 존재). 네비는 AppHeader + 화면 내 FAB + Back 버튼만으로 구성.

### Task 2.1: BottomNav 제거

- [ ] **Step 1: 옛 라우트 사용처 확인 후 BottomNav import 제거**

```bash
grep -rn "BottomNav\|bottom-nav" src/ --include="*.tsx"
```

- [ ] **Step 2: `src/components/app-shell/bottom-nav.tsx` 삭제**

가드레일 §외과적 수정 — 보존 비용 없음. 옛 spec 파일 동시 삭제.

```bash
rm src/components/app-shell/bottom-nav.tsx src/components/app-shell/bottom-nav.spec.tsx
```

- [ ] **Step 3: `(app)/layout.tsx`에서 BottomNav 제거** (다음 Task 2.2 Step 3에 통합)

### Task 2.2: AppHeader 신설

- [ ] **Step 1: `src/components/app-shell/app-header.tsx`**

```typescript
import Link from "next/link";
import { Bell, User } from "lucide-react";
import { IconButton } from "@/components/ui/icon-button";

interface AppHeaderProps {
  groupLabel?: string;
  groupHref?: string;
  unreadNotifications?: boolean;
}

export function AppHeader({
  groupLabel = "from. with",
  groupHref = "/group",
  unreadNotifications = false,
}: AppHeaderProps) {
  return (
    <header className="sticky top-0 z-30 flex items-center justify-between bg-background/90 px-4 py-3 backdrop-blur">
      <Link href={groupHref} className="flex items-center gap-1.5 t-h3 hover:opacity-80">
        {groupLabel}
        <ChevronDownIcon />
      </Link>
      <div className="flex items-center gap-1">
        <Link href="/notifications" aria-label="알림" className="relative">
          <IconButton label="알림" icon={Bell} />
          {unreadNotifications && (
            <span aria-hidden="true" className="absolute right-2.5 top-2.5 size-2 rounded-full bg-destructive" />
          )}
        </Link>
        <Link href="/settings" aria-label="마이페이지">
          <IconButton label="마이페이지" icon={User} />
        </Link>
      </div>
    </header>
  );
}

function ChevronDownIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}
```

> **그룹 선택 sheet 스텁**: AppHeader 좌측 그룹 라벨 클릭 시 동작은 PR2에서는 `/group/[id]` 또는 `/group` redirect로 둠. PR7 Task 7.1에서 다중 그룹 가진 사용자용 shadcn Sheet (`<GroupSwitcherSheet>`)으로 교체. ADR-0003 §"헤더 chevron-down sheet"의 구체 컴포넌트.

- [ ] **Step 2: `(app)/layout.tsx`에 통합** (BottomNav 제거, AppHeader만)

```typescript
import { redirect } from "next/navigation";
import { AppHeader } from "@/components/app-shell/app-header";
import { createClient } from "@/lib/supabase/server";
import { fetchUnreadKudosCount } from "@/lib/db/reads/unread-kudos";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const unreadCount = await fetchUnreadKudosCount(user.id);
  return (
    <div className="mx-auto flex min-h-svh w-full max-w-screen-sm flex-col bg-background">
      <AppHeader unreadNotifications={unreadCount > 0} />
      <main id="main" className="flex-1">{children}</main>
    </div>
  );
}
```

> **참고**: `pb-20` (BottomNav 공간 padding) 제거됨. 화면 내 FAB은 각 페이지에서 `fixed bottom-6 right-1/2 translate-x-1/2 z-20` 또는 화면별 적절 위치로 직접 배치.

### Task 2.3: PR2 검증·PR 생성

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm build
pnpm dev  # 모바일 viewport 시각 확인
pnpm test:e2e tests/a11y/foundation.spec.ts
```

**시각 회귀 확인 — `pb-20` 제거 영향**:
- `(app)/layout.tsx`에서 `main`의 `pb-20`(BottomNav 공간 padding) 제거됨
- 모든 (app) 라우트 페이지에서 마지막 카드/CTA가 화면 하단에 잘리거나 safe-area에 가려지지 않는지 모바일 viewport 캡처
- 각 화면이 `pb-[env(safe-area-inset-bottom)]` 또는 `pb-6` 같은 자체 padding을 가진 경우 변경 불필요
- 잘림 발견 시 페이지별 padding 추가 (글로벌 변경 X — 외과적)

```bash
gh pr create --base develop --title "feat(ui): UI 리비전 PR2 — app-shell (BottomNav 폐기 + AppHeader 신설)"
```

PR 본문에 명시:
- "BottomNav **폐기** — 모킹업에 BottomNav 마크업 없음 (`fab-center`만 존재)"
- "AppHeader 신설 — 좌: 그룹 셀렉터 chevron-down, 우: 알림 bell + 마이 user"
- "unreadKudos dot이 BottomNav `/home`에서 헤더 `/notifications`로 이동"
- "옛 라우트 폐기·sub-route화는 PR5/PR6/PR7에서 — `/feed` 폐기, `/action`·`/pledge` → `/challenge/[id]/{action,pledge}` sub-route, `/recap` → `/challenge/[id]/recap`, `/me` 신설, `/group/[id]` 신설, `/notifications` 신설"
- "PRD §10 화면 인벤토리 갱신은 PR8"

---

## PR3: Auth — login (온보딩) + invite

**Branch:** `feat/ui-auth` · **Base:** `develop` (PR2 머지 후)
**Mockup sections:** §1 (라인 379~490), §5 (712~756)

### Task 3.1: 현재 코드 파악

- [ ] **Step 1: 기존 구현 읽기**

```bash
cat 'src/app/(auth)/login/page.tsx'
ls 'src/app/(auth)/login/_components/'
cat 'src/app/(auth)/invite/[token]/page.tsx'
ls 'src/app/(auth)/invite/[token]/_components/'
```

서버 컴포넌트·Server Action 구조 파악. 매직링크·invite 토큰 핸들링은 건드리지 말 것. 시각만 교체.

### Task 3.2: 온보딩 슬라이드 (모킹업 §1)

- [ ] **Step 1: 모킹업 §1-A·B(진입 기본·초대 진입), §1-C/D/E/F (온보딩 4슬라이드)를 React로 옮김**

- [ ] **Step 2: 슬라이드 컴포넌트는 `(auth)/login/_components/onboarding-slides.tsx` 신설**, `SLIDES = [{ illustEmoji, illustTone, title, body }, ...]` 상수로 데이터 분리

- [ ] **Step 3: 슬라이드 인디케이터 + "건너뛰기" + "다음/시작하기" CTA. fade 전환만(reduced-motion 대응)**

- [ ] **Step 4: 온보딩 트리거·종료 destination (F2)**

**트리거 조건**:
- 신규 가입자(가입 직후 첫 진입)만 1회 노출
- 신호: `localStorage.getItem("withkey:onboarded")` — `"1"` 이면 skip
- 옛 사용자(데이터 있음) 진입 시: skip — `localStorage` flag 없어도, 이미 챌린지·그룹 데이터 있으면 onboarded 간주 (`/login` server side에서 user.user_metadata.has_groups` 또는 client side에서 fetchCurrentChallenges 호출 후 판단)

**종료 destination**:
- 마지막 슬라이드 "시작하기" 클릭 → `localStorage.setItem("withkey:onboarded", "1")` + `/home` redirect
- "건너뛰기" 동일 동작 (모든 슬라이드에서 노출)

**구현 위치**: `(auth)/login/page.tsx` 가입 성공 후 `/onboarding` redirect 또는 `/login?onboard=1` 분기. 추천 **`/login?onboard=1`** — 새 라우트 추가 회피, 매직링크 callback 안에서 onboarded flag 확인 후 분기

```typescript
// (auth)/login/page.tsx (server component)
// 매직링크 callback 후 진입 시:
// 1. 신규 가입자면 onboarding-slides 컴포넌트 렌더 (client-side localStorage 확인)
// 2. 기존 사용자면 /home redirect
//
// 옛 invite token cookie 보존 분기 (F4 참조) 가 우선 — invite 가 있으면 온보딩 skip
```

- [ ] **Step 5: 슬라이드 CTA 색상 (F3 — 모킹업 라인 441 `opacity:.6`)**

**의도 해석**: 모킹업이 1~3 슬라이드 "다음" 을 `opacity:.6` 으로 표현 — "비활성 또는 약한 강조" 시각.

추천:
- 1~3 슬라이드: "다음" 버튼 `opacity-60` 그대로 + 클릭 가능 (다음 슬라이드로 진행)
- 마지막 슬라이드 (1-F): "시작하기" 버튼 `opacity-100` full color
- 즉 시각적으로 "진행 중 / 마지막" 구분만, 기능은 모두 클릭 가능
- "건너뛰기" 는 모든 슬라이드에서 동일 색상

### Task 3.3: invite — 모킹업 §5

- [ ] **Step 1: `<ShareCard>` 적용 (challenge 미리보기 카드)**

- [ ] **Step 2: `(auth)/invite/[token]/_components/invite-loading-dots.tsx` 신설** — §5-B 점 progress 애니메이션 (5개 점 wave keyframe)

- [ ] **Step 3: 비로그인 invite 진입 시 token 보존 (F4)**

PRD §3.3 AC-3 매직링크 후 invite 페이지 진입. 현 코드는 비로그인 시 `/invite/[token]` → `/login` redirect 동작 확인 필요.

**플로우**:
```
1. 사용자가 카톡 invite link 클릭 → /invite/[token] 진입
2. 서버 컴포넌트가 user 확인 → 비로그인이면:
   - cookie 저장: invite_token = [token], max-age=72h (PRD §3.3 AC-2 토큰 만료와 동일)
   - redirect("/login")
3. /login 진입 → §1-B 화면 (모킹업 invite-banner — "초대받은 챌린지" 안내)
4. 매직링크 클릭 → /auth/callback → 인증 성공
5. callback 핸들러 (src/app/auth/callback/route.ts) 에서:
   - cookie.get("invite_token") 확인
   - 있으면 cookie 삭제 + redirect(`/invite/${token}`)
   - 없으면 redirect("/home")
6. /invite/[token] 진입 (로그인 상태) → §5-A 표시 → "참여하기" → §5-B 로딩 → 챌린지 pledge sub-route
```

**구현 위치**:
- `(auth)/invite/[token]/page.tsx` — 비로그인 시 cookie 저장 + login redirect
- `src/app/auth/callback/route.ts` — cookie 확인 후 redirect 분기
- `(auth)/login/page.tsx` — cookie 존재 시 invite-banner (§1-B) 노출 — `getInviteBannerFromCookie()` 헬퍼

```typescript
// (auth)/invite/[token]/page.tsx (server)
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    const c = await cookies();
    c.set("invite_token", token, { maxAge: 60 * 60 * 72, httpOnly: true, sameSite: "lax", secure: true });
    redirect("/login?invite=1");
  }
  // 로그인 상태면 기존 invite flow
  // ...
}
```

```typescript
// src/app/auth/callback/route.ts (callback 핸들러)
export async function GET(req: NextRequest) {
  // ... 기존 매직링크 검증 후
  const c = await cookies();
  const inviteToken = c.get("invite_token")?.value;
  if (inviteToken) {
    c.delete("invite_token");
    return NextResponse.redirect(new URL(`/invite/${inviteToken}`, req.url));
  }
  // 첫 가입자 (F2) 인지 확인 — onboarding flag
  return NextResponse.redirect(new URL("/home", req.url));
}
```

- [ ] **Step 4: §5-A "초대장 도착" 이모지 제거 (F5)**

모킹업 라인 738 메모 "초대장 도착" 옆 이모지 제거. PR3 작업 시 카피만 변경:
- Before: `초대장 도착 ✉️` (있다면)
- After: `초대장 도착` (텍스트만)

### Task 3.4: PR3 검증·PR 생성

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm build
pnpm dev
# 1. /login → 매직링크 전송 → 메일 클릭 → 로그인 성공
# 2. 다른 사용자로 /invite/[token] → 챌린지 미리보기 → 참여
pnpm test:e2e tests/a11y/foundation.spec.ts
```

---

## PR4: Home

**Branch:** `feat/ui-home` · **Base:** `develop` (PR3 머지 후)
**Mockup section:** §2 (라인 492~547) — 2-A 빈 상태 / 2-B 진행 중

### Task 4.1: 모킹업 §2 매핑

요소 인벤토리:
- AppHeader (PR2)
- 인사말: `5월 14일 · 화요일 · 안녕, {nickname} 👋` — 새 컴포넌트 `home/_components/home-greeting.tsx`
- 초대받은 챌린지 배너 (있을 때) — `home/_components/invited-challenge-banner.tsx`
- 4 stats (진행중·오늘완료·미인증·총벌금) — `home/_components/stats-grid.tsx`
- 진행 중 챌린지 카드 리스트 — 기존 `group-strip.tsx` 시각 교체 또는 신규 `home/_components/running-challenge-list.tsx`
- 중앙 FAB (BottomNav가 들고 있음 — PR2)
- 빈 상태 (그룹 없음): EmptyState

### Task 4.2: 화면 구현

- [ ] **Step 1: `page.tsx` 시각만 교체** — data fetch·Server Action 구조 유지

- [ ] **Step 2: 빈 상태 처리** — `<EmptyState icon={Sparkles} title="아직 진행 중인 챌린지가 없어요" description="친구들과 함께 첫 챌린지를 만들어보세요" action={<Button asChild><Link href="/challenge/new">챌린지 만들기</Link></Button>} />`

### Task 4.3: PR4 검증·PR 생성

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm build
pnpm dev  # /home 데이터 있음/없음 각각 캡처
```

---

## PR5: Challenge — new + detail + pledge

**Branch:** `feat/ui-challenge` · **Base:** `develop` (PR4 머지 후)
**Mockup sections:** §3 (549~677), §4 (679~710), §6 (758~823), §7 (825~843)

**IA 변경 (ADR-0002):**
- §4 외부 공유 → 별도 라우트 아니라 `src/app/share/[challengeId]/opengraph-image.tsx` 동적 OG + 공유 시트
- §7 참여 완료 → 별도 라우트 폐기, `pledge` 서명 직후 `redirect('/challenge/{id}?just_joined=1')` + 보너스 배너

### Task 5.1: Challenge 생성 (§3)

- [ ] **Step 1: `src/lib/challenge/frequency.ts` 신설 — `goalCount` → 라벨 변환 헬퍼**

```typescript
// src/lib/challenge/frequency.ts
//
// 모킹업 §3-A "인증 빈도" stepper 의 라벨 변환.
// goalCount(1~7) = 주 N회 (PRD §3.3 D-005). 모킹업의 "매일"은 7회의 별명.
// 다른 화면에서도 재사용: 홈 진행 중 카드, 챌린지 상세 §6-A "매일 1회", recap 결과.

export type FrequencyLabel = {
  /** stepper 가운데 표시되는 주 라벨 — "매일" 또는 "주 N번". */
  primary: string;
  /** 보조 헬퍼 — "한 주에 N번 인증". */
  helper: string;
  /** challenge 상세 §6-A 인증 빈도 카드용 짧은 표기 — "매일 1회" / "주 N회". */
  detail: string;
};

export function goalCountLabel(goalCount: number): FrequencyLabel {
  if (!Number.isInteger(goalCount) || goalCount < 1 || goalCount > 7) {
    throw new RangeError(`goalCount must be 1..7, got ${goalCount}`);
  }
  if (goalCount === 7) {
    return {
      primary: "매일",
      helper: "한 주에 7번 인증",
      detail: "매일 1회",
    };
  }
  return {
    primary: `주 ${goalCount}번`,
    helper: `한 주에 ${goalCount}번 인증`,
    detail: `주 ${goalCount}회`,
  };
}
```

단위 테스트 `tests/unit/frequency.spec.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { goalCountLabel } from "@/lib/challenge/frequency";

describe("goalCountLabel", () => {
  it("7 maps to '매일' with weekly helper", () => {
    expect(goalCountLabel(7)).toEqual({
      primary: "매일",
      helper: "한 주에 7번 인증",
      detail: "매일 1회",
    });
  });
  it("1..6 maps to '주 N번' / '한 주에 N번 인증'", () => {
    for (const n of [1, 2, 3, 4, 5, 6]) {
      const { primary, helper, detail } = goalCountLabel(n);
      expect(primary).toBe(`주 ${n}번`);
      expect(helper).toBe(`한 주에 ${n}번 인증`);
      expect(detail).toBe(`주 ${n}회`);
    }
  });
  it("rejects out-of-range values", () => {
    expect(() => goalCountLabel(0)).toThrow(RangeError);
    expect(() => goalCountLabel(8)).toThrow(RangeError);
    expect(() => goalCountLabel(1.5)).toThrow(RangeError);
  });
});
```

- [ ] **Step 2: `(app)/challenge/new/_components/frequency-stepper.tsx` 신설 — 디자인 시스템 기반**

모킹업 §3-A 라인 575~581 매핑:
- − / + 버튼: 30px width pill, padding 0
- 가운데 박스: rounded-[10px], background `var(--background)`, 12px font-weight-600 + 10px helper
- 라벨 변환: `goalCountLabel(value)`
- 모션: 클릭 시 active scale + value 변경 시 fade (reduced-motion 대응 자동)
- 접근성: `role="spinbutton"`, `aria-valuemin/max/now/text`, 키보드 ↑/↓·Enter

```typescript
// src/app/(app)/challenge/new/_components/frequency-stepper.tsx
"use client";

import { Minus, Plus } from "lucide-react";
import { useId } from "react";
import { cn } from "@/lib/utils";
import { goalCountLabel } from "@/lib/challenge/frequency";

interface FrequencyStepperProps {
  value: number;          // 1..7
  onChange: (next: number) => void;
  min?: number;           // default 1
  max?: number;           // default 7
  className?: string;
  label?: string;         // 외부 legend 텍스트, default "인증 빈도"
}

export function FrequencyStepper({
  value,
  onChange,
  min = 1,
  max = 7,
  className,
  label = "인증 빈도",
}: FrequencyStepperProps) {
  const id = useId();
  const { primary, helper } = goalCountLabel(value);
  const atMin = value <= min;
  const atMax = value >= max;

  function step(direction: -1 | 1) {
    const next = value + direction;
    if (next < min || next > max) return;
    onChange(next);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowUp" || e.key === "ArrowRight") {
      e.preventDefault();
      step(1);
    } else if (e.key === "ArrowDown" || e.key === "ArrowLeft") {
      e.preventDefault();
      step(-1);
    }
  }

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label id={`${id}-label`} className="t-caption">
        {label}
      </label>
      <div
        role="group"
        aria-labelledby={`${id}-label`}
        className="flex items-center gap-1.5"
      >
        <StepButton
          ariaLabel={`${label} 줄이기`}
          icon={Minus}
          onClick={() => step(-1)}
          disabled={atMin}
        />
        <div
          role="spinbutton"
          tabIndex={0}
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuenow={value}
          aria-valuetext={`${primary} · ${helper}`}
          aria-labelledby={`${id}-label`}
          onKeyDown={onKeyDown}
          className={cn(
            "flex flex-1 flex-col items-center justify-center gap-0.5 rounded-[10px] bg-background py-2",
            "border border-border/40 transition-colors duration-[var(--motion-fast)]",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          )}
        >
          <span className="text-[13px] font-semibold tabular-nums">{primary}</span>
          <span className="text-[10px] font-normal text-muted-foreground">{helper}</span>
        </div>
        <StepButton
          ariaLabel={`${label} 늘리기`}
          icon={Plus}
          onClick={() => step(1)}
          disabled={atMax}
        />
      </div>
    </div>
  );
}

interface StepButtonProps {
  ariaLabel: string;
  icon: React.ComponentType<{ className?: string }>;
  onClick: () => void;
  disabled?: boolean;
}

function StepButton({ ariaLabel, icon: Icon, onClick, disabled }: StepButtonProps) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex size-9 shrink-0 items-center justify-center rounded-full border border-border/60 bg-card text-foreground/85",
        "transition-transform duration-[var(--motion-fast)] ease-[var(--ease-out-soft)]",
        "active:scale-90 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        "disabled:opacity-40 disabled:pointer-events-none",
      )}
    >
      <Icon className="size-4" aria-hidden="true" />
    </button>
  );
}
```

단위 테스트 `(app)/challenge/new/_components/frequency-stepper.spec.tsx`:

```typescript
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { FrequencyStepper } from "./frequency-stepper";

describe("FrequencyStepper", () => {
  it("renders current value as '매일' for value=7", () => {
    render(<FrequencyStepper value={7} onChange={() => {}} />);
    expect(screen.getByText("매일")).toBeInTheDocument();
    expect(screen.getByText(/한 주에 7번/)).toBeInTheDocument();
  });
  it("renders '주 N번' for value 1..6", () => {
    render(<FrequencyStepper value={3} onChange={() => {}} />);
    expect(screen.getByText("주 3번")).toBeInTheDocument();
  });
  it("calls onChange with +1 when + clicked", () => {
    const onChange = vi.fn();
    render(<FrequencyStepper value={3} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: /늘리기/ }));
    expect(onChange).toHaveBeenCalledWith(4);
  });
  it("does not call onChange when at max", () => {
    const onChange = vi.fn();
    render(<FrequencyStepper value={7} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: /늘리기/ }));
    expect(onChange).not.toHaveBeenCalled();
  });
  it("ArrowUp keyboard increments", () => {
    const onChange = vi.fn();
    render(<FrequencyStepper value={3} onChange={onChange} />);
    fireEvent.keyDown(screen.getByRole("spinbutton"), { key: "ArrowUp" });
    expect(onChange).toHaveBeenCalledWith(4);
  });
});
```

- [ ] **Step 3: `(app)/challenge/new/page.tsx` wizard 2-step 분리 + FrequencyStepper 적용**

기존 `goalCount` radiogroup(`1·2·3·4·5`) 영역을 FrequencyStepper로 교체. 2-step wizard는 별도 sub-task — `?step=1|2` query 또는 state-based.

```typescript
// 기존:
// <fieldset> goalCount radiogroup </fieldset>
//
// 신:
<FrequencyStepper value={goalCount} onChange={setGoalCount} />
```

- [ ] **Step 4: `EndDatePicker` 신설 — `react-day-picker` 기반 (Q13 결정)**

**Q13 결정 (잠금)**: 종료일 사용자 선택 + 최소 1주 (오늘 기준) ~ 최대 3개월.
- 의미 (Q13-A): 절대 날짜 선택 → 시스템이 `duration_days = endDate - today` 변환
- 시작일 (Q13-B): 서버 결정 유지 (전원 서명 시점)
- 제약 (Q13-C): 오늘로부터 종료일 ≥ 7일
- 라이브러리 (Q13-D): `react-day-picker` (shadcn 표준, 한국어 locale 지원)

모킹업 §3-A 라인 564~573 매핑: 3 preset pill (7일/14일/30일) + calendar 트리거. calendar 아이콘 클릭 시 **react-day-picker 캘린더 시트**를 inline 또는 popover로 노출.

**ADR-0004 추가 (PR0-C)**: 종료일 선택·최소 1주 정책 명문화 — 이전 grill에서 "duration number input" 결정을 뒤집음. ADR로 추적.

**의존성 추가 (PR1 Foundation에 추가)**:

```bash
pnpm add react-day-picker date-fns
```

크기: react-day-picker ~30KB + date-fns ~10KB (tree-shaking) = 약 40KB gzipped. 한국어 locale은 date-fns 가 제공.

**컴포넌트 코드**:

```typescript
// src/app/(app)/challenge/new/_components/end-date-picker.tsx
"use client";

import { useId, useState } from "react";
import { Calendar as CalendarIcon } from "lucide-react";
import { DayPicker } from "react-day-picker";
import { addDays, differenceInCalendarDays, format, startOfDay } from "date-fns";
import { ko } from "date-fns/locale";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import "react-day-picker/style.css";

const PRESETS = [7, 14, 30] as const;
const MIN_DAYS = 7;   // Q13-C 최소 1주 (오늘 기준)
const MAX_DAYS = 90;  // PRD D-006 · 모킹업 "최대 3개월"

interface EndDatePickerProps {
  value: number;     // duration_days (오늘 기준)
  onChange: (next: number) => void;
  className?: string;
}

export function EndDatePicker({ value, onChange, className }: EndDatePickerProps) {
  const id = useId();
  const today = startOfDay(new Date());
  const minDate = addDays(today, MIN_DAYS);
  const maxDate = addDays(today, MAX_DAYS);
  const endDate = addDays(today, value);
  const [open, setOpen] = useState(false);
  const isPreset = (PRESETS as readonly number[]).includes(value);

  function handleSelectDate(date: Date | undefined) {
    if (!date) return;
    const days = differenceInCalendarDays(date, today);
    if (days < MIN_DAYS || days > MAX_DAYS) return;
    onChange(days);
    setOpen(false);
  }

  return (
    <fieldset className={cn("flex flex-col gap-1.5", className)}>
      <legend id={`${id}-label`} className="t-caption">진행 기간</legend>
      <div role="radiogroup" aria-labelledby={`${id}-label`} className="flex gap-1.5">
        {PRESETS.map((d) => {
          const checked = value === d;
          return (
            <button
              key={d}
              type="button"
              role="radio"
              aria-checked={checked}
              tabIndex={checked ? 0 : -1}
              onClick={() => { onChange(d); setOpen(false); }}
              className={cn(
                "min-h-11 flex-1 rounded-full border text-[13px] font-semibold transition-colors",
                "duration-[var(--motion-fast)] ease-[var(--ease-out-soft)]",
                "active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                checked
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border/60 bg-card text-foreground/85 hover:bg-muted",
              )}
            >
              {d}일
            </button>
          );
        })}
        <button
          type="button"
          aria-label="종료일 직접 선택"
          aria-expanded={open}
          aria-pressed={!isPreset || open}
          onClick={() => setOpen((o) => !o)}
          className={cn(
            "inline-flex size-11 shrink-0 items-center justify-center rounded-full border",
            "transition-colors duration-[var(--motion-fast)]",
            "active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
            (!isPreset || open)
              ? "border-primary bg-brand-primary-soft text-primary"
              : "border-border/60 bg-card text-foreground/85 hover:bg-muted",
          )}
        >
          <CalendarIcon className="size-4" aria-hidden="true" />
        </button>
      </div>
      {open && (
        <Card padding="md" className="mt-1 flex justify-center">
          <DayPicker
            mode="single"
            selected={isPreset ? undefined : endDate}
            onSelect={handleSelectDate}
            disabled={[{ before: minDate }, { after: maxDate }]}
            locale={ko}
            showOutsideDays={false}
            classNames={{
              caption: "t-h3 mb-2 text-center",
              head_cell: "t-caption text-muted-foreground",
              day: "size-9 rounded-full text-[13px] hover:bg-muted active:scale-95 transition-transform",
              day_selected: "bg-primary text-primary-foreground hover:bg-primary",
              day_today: "ring-2 ring-ring/40",
              day_disabled: "opacity-30 pointer-events-none",
              nav_button: "p-1 rounded-full hover:bg-muted",
            }}
          />
        </Card>
      )}
      <p className="text-[10px] text-muted-foreground">
        종료일: <span className="font-semibold tabular-nums">{format(endDate, "yyyy년 M월 d일 (EEE)", { locale: ko })}</span>
        {" · "}오늘부터 {value}일 (최소 1주 ~ 최대 3개월)
      </p>
    </fieldset>
  );
}
```

특징:
- **3 preset pill + calendar 트리거** — preset과 calendar 상호 배타
- **react-day-picker `disabled` prop** — `[{before: minDate}, {after: maxDate}]` 로 1주 미만·3개월 초과 비활성
- **한국어 locale** (`date-fns/locale/ko`) — "5월 14일 (수)" 표기
- **모션 토큰** active scale + transition duration
- **접근성**: `role="radiogroup"` + `aria-pressed` + `aria-expanded`. 키보드 화살표·Enter 지원 (react-day-picker 기본)
- **선택일 표시**: 항상 하단에 절대 날짜 + 일수 모두 표시 (UX 명확)
- **Card primitive 재사용** (PR1) — 캘린더 컨테이너

> **react-day-picker style import**: `react-day-picker/style.css` 를 컴포넌트 파일에서 직접 import. globals.css 에 안 두는 이유는 이 페이지에서만 쓰이는 스타일이라 콜로케이션 유지.

> **T3 — KST timezone 처리**: 클라이언트 `new Date()` 는 디바이스 timezone (사용자가 한국 외 지역이면 KST 다름). `duration_days = endDate - today` 계산 시 KST 기준으로 일관되어야 서버 (`start_at + duration_days` UTC 처리)와 어긋나지 않음.
> 
> 단순화 방안:
> 1. 클라이언트는 `startOfDay(new Date())` 로 device-local midnight 사용 (대부분 사용자가 한국 거주 가정)
> 2. 서버는 `start_at` (활성화 시점 UTC) + `duration_days` 으로 `end_at` 계산 — `interval '${days} day'` SQL
> 3. **종료일 표시는 항상 KST**: `format(endDate, "yyyy년 M월 d일 (EEE)", { locale: ko })` — date-fns 가 device timezone 기준
> 4. dogfood 사용자 모두 한국 → 1~2시간 시차 발생 가능성 매우 낮음. POC 검증 후 v1에서 명시적 KST 변환 (`date-fns-tz`) 추가 가능
> 
> PR5 작업 시 사용자에 명시: "종료일은 표시 시점 기준이며, 실제 종료일은 모든 멤버 서명 완료 후 자동 계산됩니다" (PledgePreviewCard 또는 EndDatePicker helper 카피).

- [ ] **Step 5: `PenaltyPicker` 디자인 시스템 기반 신설/교체** — 모킹업 §3-A 라인 582~591 4-pill

`#58` 결정에 따라 0원 옵션 포함. `challengeInputSchema.penaltyAmount.min(0)` 으로 validators 변경 + spec 동반 (Step 5b에서 처리).

```typescript
// src/app/(app)/challenge/new/_components/penalty-picker.tsx
"use client";

import { useId } from "react";
import { cn } from "@/lib/utils";

const OPTIONS = [
  { value: 0, label: "없음", helper: "강제력 없이 가볍게 시작" },
  { value: 3000, label: "3천원", helper: "인증 못하면 자동으로 누적돼요" },
  { value: 5000, label: "5천원", helper: "인증 못하면 자동으로 누적돼요" },
  { value: 10000, label: "만원", helper: "인증 못하면 자동으로 누적돼요" },
] as const;

interface PenaltyPickerProps {
  value: number;
  onChange: (next: number) => void;
  className?: string;
}

export function PenaltyPicker({ value, onChange, className }: PenaltyPickerProps) {
  const id = useId();
  const selected = OPTIONS.find((o) => o.value === value) ?? OPTIONS[0];
  return (
    <fieldset className={cn("flex flex-col gap-1.5", className)}>
      <legend id={`${id}-label`} className="t-caption">
        1회 실패 벌금
      </legend>
      <div role="radiogroup" aria-labelledby={`${id}-label`} className="grid grid-cols-4 gap-1.5">
        {OPTIONS.map((opt) => {
          const checked = opt.value === value;
          return (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={checked}
              tabIndex={checked ? 0 : -1}
              onClick={() => onChange(opt.value)}
              className={cn(
                "min-h-11 rounded-full border text-[13px] font-semibold transition-colors",
                "duration-[var(--motion-fast)] ease-[var(--ease-out-soft)]",
                "active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                checked
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border/60 bg-card text-foreground/85 hover:bg-muted",
              )}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
      <p className="text-[10px] text-muted-foreground">{selected.helper}</p>
    </fieldset>
  );
}
```

- [ ] **Step 5b: Validators 변경 + spec 동반 (#58 + Q13 결정)**

`src/lib/validators/challenge.ts` 갱신 — penalty min(0) + duration min(7):

```typescript
// Before:
penaltyAmount: z.number().int().min(1000).max(10000).refine((v) => v % 1000 === 0, "1000원 단위"),
durationDays: z.number().int().min(1).max(90),

// After (Q13 + #58 결정):
penaltyAmount: z.number().int().min(0).max(10000).refine((v) => v % 1000 === 0, "1000원 단위"),
durationDays: z.number().int().min(7).max(90),  // Q13-C 최소 1주 (오늘 기준)
```

추가 작업:
1. **Migration 확인 + 신설** (필요 시):
   - `grep -nE "penalty_amount.*CHECK|penalty_amount.*>=|duration_days.*CHECK|duration_days.*>=" supabase/migrations/`
   - penalty CHECK 또는 duration CHECK 있으면 → `supabase/migrations/0024_challenge_validators_revision.sql` 신설 (두 CHECK 동시 갱신)
   - 없으면 → 코드만 변경
2. **Spec 작성**: `pnpm new spec 2026-05-14-challenge-validators-revision`
   - 변경 근거: penalty 모킹업 §3-A "없음" / duration Q13 PO 결정 (종료일 최소 1주)
   - 영향 범위: validators · migration · BE_SCHEMA §5.5 D-006/D-007 · PRD §3.3
   - Rollback: penalty min을 1000, duration min을 1로 되돌림 + 위배되는 row 정리 query
3. **PRD §3.3·§8.2 갱신은 PR8 cleanup**
4. **Analytics 영향**: `analyticsEventSchema.challenge_created.props.penaltyAmount`/`goalCount` 는 `z.number().int()`라 0/7 자동 허용 — 확인만, 변경 없음
5. **단위 테스트**: `tests/unit/challenge-validators.spec.ts` 신설 또는 갱신

```typescript
import { describe, expect, it } from "vitest";
import { challengeInputSchema } from "@/lib/validators/challenge";

const base = {
  title: "30일 헬스장 출석",
  type: "fitness" as const,
  goalCount: 7,
  durationDays: 30,
  penaltyAmount: 5000,
};

describe("challengeInputSchema.penaltyAmount (#58)", () => {
  it("accepts 0원 (없음 옵션)", () => {
    expect(challengeInputSchema.safeParse({ ...base, penaltyAmount: 0 }).success).toBe(true);
  });
  it("accepts 3000·5000·10000", () => {
    for (const v of [3000, 5000, 10000]) {
      expect(challengeInputSchema.safeParse({ ...base, penaltyAmount: v }).success).toBe(true);
    }
  });
  it("rejects negative · > 10000 · non-1000 multiple", () => {
    expect(challengeInputSchema.safeParse({ ...base, penaltyAmount: -1000 }).success).toBe(false);
    expect(challengeInputSchema.safeParse({ ...base, penaltyAmount: 20000 }).success).toBe(false);
    expect(challengeInputSchema.safeParse({ ...base, penaltyAmount: 500 }).success).toBe(false);
  });
});

describe("challengeInputSchema.durationDays (Q13)", () => {
  it("accepts 7 (minimum 1 week)", () => {
    expect(challengeInputSchema.safeParse({ ...base, durationDays: 7 }).success).toBe(true);
  });
  it("rejects < 7 (1주 미만)", () => {
    for (const v of [1, 3, 6]) {
      expect(challengeInputSchema.safeParse({ ...base, durationDays: v }).success).toBe(false);
    }
  });
  it("accepts up to 90", () => {
    expect(challengeInputSchema.safeParse({ ...base, durationDays: 90 }).success).toBe(true);
  });
  it("rejects > 90 (3개월 초과)", () => {
    expect(challengeInputSchema.safeParse({ ...base, durationDays: 91 }).success).toBe(false);
  });
});
```

```typescript
import { describe, expect, it } from "vitest";
import { challengeInputSchema } from "@/lib/validators/challenge";

describe("challengeInputSchema.penaltyAmount (#58 — 모킹업 § 3-A '없음' 옵션)", () => {
  const base = {
    title: "30일 헬스장 출석",
    type: "fitness" as const,
    goalCount: 7,
    durationDays: 30,
  };
  it("accepts 0원 (없음 옵션)", () => {
    expect(challengeInputSchema.safeParse({ ...base, penaltyAmount: 0 }).success).toBe(true);
  });
  it("accepts 3000, 5000, 10000", () => {
    for (const v of [3000, 5000, 10000]) {
      expect(challengeInputSchema.safeParse({ ...base, penaltyAmount: v }).success).toBe(true);
    }
  });
  it("rejects negative", () => {
    expect(challengeInputSchema.safeParse({ ...base, penaltyAmount: -1000 }).success).toBe(false);
  });
  it("rejects > 10000", () => {
    expect(challengeInputSchema.safeParse({ ...base, penaltyAmount: 20000 }).success).toBe(false);
  });
  it("rejects non-1000-multiple", () => {
    expect(challengeInputSchema.safeParse({ ...base, penaltyAmount: 500 }).success).toBe(false);
  });
});
```

- [ ] **Step 6: "균등 분할 정산" 안내 추가** (모킹업 §3 메모)

서약서 작성 화면 또는 페널티 영역 아래 카피:
- "벌금은 챌린지 종료 시 미달성자가 균등 분담합니다 (POC: 표시만)"
- Card tone="muted" + 작은 텍스트

- [ ] **Step 7: 옛 `goalCount` 라벨 grep 일괄 교체**

```bash
grep -rn '주 목표 횟수\|주 N회' src/ --include="*.tsx" --include="*.ts"
```

발견 위치 (예상: MemberStrip · ChallengeFeed · RecapStatsRow · challenge 상세):
- 라벨 표기 `주 N회` → `goalCountLabel(n).detail` 결과 사용 ("매일 1회" 또는 "주 N회")
- 단순 표시 텍스트만 교체, 데이터 모델 변경 없음

- [ ] **Step 7b: Wizard Step 2 — 서약서 + 운영자 서명 (§3-C, L1 누락 보강)**

모킹업 §3-C 라인 634~654. wizard 2번째 step. 운영자가 챌린지 정보(step 1) 입력 후, 서약서 본문 미리보기 + 본인 서명 후 `createChallenge` 호출.

**IA 핵심**: 운영자 본인 서명은 챌린지 생성 wizard에 포함 → `createChallenge` Server Action 이 챌린지 row + 운영자 자가 서명 동시 처리. 멤버 서명은 별도 (`/challenge/[id]/pledge` sub-route, §6-B). PRD §3.2 "[그룹장] 그룹 생성 → 챌린지 조건 입력 → 초대 링크 생성" 흐름과 정합.

**`page.tsx` wizard 통합**:

```typescript
// src/app/(app)/challenge/new/page.tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { FrequencyStepper } from "./_components/frequency-stepper";
import { EndDatePicker } from "./_components/end-date-picker";
import { PenaltyPicker } from "./_components/penalty-picker";
import { PledgePreviewCard } from "./_components/pledge-preview-card";
import { PledgeSigningCanvas } from "./_components/pledge-signing-canvas";
import { CreationCompleteSheet } from "./_components/creation-complete-sheet";
import { createChallenge } from "./_actions";

type Step = 1 | 2 | 3;

export default function NewChallengePage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);
  const [title, setTitle] = useState("");
  const [goalCount, setGoalCount] = useState(7);
  const [durationDays, setDurationDays] = useState(7);
  const [penaltyAmount, setPenaltyAmount] = useState(5000);
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null);
  const [createdChallengeId, setCreatedChallengeId] = useState<string | null>(null);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function gotoStep2() {
    if (!title.trim()) { toast.error("챌린지 이름을 입력해 주세요"); return; }
    setStep(2);
  }

  function submit() {
    if (!signatureDataUrl) { toast.error("서명을 그려주세요"); return; }
    start(async () => {
      const res = await createChallenge({
        title, type: "fitness",
        goalCount, durationDays, penaltyAmount,
        ownerSignatureDataUrl: signatureDataUrl,
      });
      if (!res.ok || !res.data?.id) {
        toast.error("챌린지 생성에 실패했어요");
        return;
      }
      setCreatedChallengeId(res.data.id);
      setInviteUrl(res.data.inviteUrl);
      setStep(3);
      // F1: wizard step 3 진입 후 back 누르면 step 2 (이미 생성된 챌린지)로 가 incoherent.
      // history 를 challenge 상세로 교체 — back 시 challenge 상세 가 자연스러움.
      window.history.replaceState(null, "", `/challenge/${res.data.id}/created`);
    });
  }

  return (
    <div className="flex flex-col gap-4 p-4 min-h-svh">
      <header className="flex items-center justify-between">
        <button type="button" onClick={() => step === 1 ? router.back() : setStep((step - 1) as Step)} aria-label="뒤로" className="t-h3">←</button>
        <span className="t-body font-semibold">새 챌린지</span>
        <span className="t-sub tabular-nums">{step === 3 ? "완료" : `${step}/2`}</span>
      </header>

      {step === 1 && (
        <Step1Form
          title={title} setTitle={setTitle}
          goalCount={goalCount} setGoalCount={setGoalCount}
          durationDays={durationDays} setDurationDays={setDurationDays}
          penaltyAmount={penaltyAmount} setPenaltyAmount={setPenaltyAmount}
          onNext={gotoStep2}
        />
      )}
      {step === 2 && (
        <Step2Sign
          title={title} goalCount={goalCount} durationDays={durationDays} penaltyAmount={penaltyAmount}
          signatureDataUrl={signatureDataUrl} setSignatureDataUrl={setSignatureDataUrl}
          onSubmit={submit} pending={pending}
        />
      )}
      {step === 3 && createdChallengeId && inviteUrl && (
        <CreationCompleteSheet challengeId={createdChallengeId} inviteUrl={inviteUrl} />
      )}
    </div>
  );
}
```

**`PledgePreviewCard` — 디자인 시스템 기반** (모킹업 §3-C 라인 639~646 매핑):

```typescript
// (app)/challenge/new/_components/pledge-preview-card.tsx
// 운영자 wizard step 2 + 멤버 pledge sub-route + challenge 정보 탭 = 3곳 사용 → Q3 hybrid 룰로 ui/ 승격 검토.
// 현 plan은 challenge/new colocate 후, PR5 후반 PR7 정보 탭 작업 시 ui/로 git mv 평가.
import { goalCountLabel } from "@/lib/challenge/frequency";

interface PledgePreviewCardProps {
  title: string;
  durationDays: number;
  goalCount: number;
  penaltyAmount: number;
  ownerName?: string;
  bodyText?: string;
}

const DEFAULT_BODY = (days: number) =>
  `나는 함께한 친구들과의 약속을 가볍게 여기지 않을게요.\n매일 운동을 인증하고, 못한 날은 약속한 벌금을 부담할게요.\n서로를 응원하여 ${days}일을 즐겁게 끝내볼게요.`;

export function PledgePreviewCard({ title, durationDays, goalCount, penaltyAmount, ownerName, bodyText }: PledgePreviewCardProps) {
  const dateRangeText = formatDateRange(durationDays);
  return (
    <div className="rounded-[14px] bg-primary p-5 text-primary-foreground">
      <div className="mb-2 inline-flex items-baseline gap-1 font-bold">
        <span className="text-[18px]">from</span>
        <span className="inline-block h-px w-3 self-center bg-current opacity-60" />
        <span className="text-[18px]">with</span>
      </div>
      <div className="text-[11px] font-bold tracking-[0.05em] opacity-90">PLEDGE · 운영자 작성</div>
      <h3 className="t-h3 mt-1">{title}</h3>
      <p className="text-[11px] leading-relaxed mt-2 opacity-95 break-keep whitespace-pre-line">
        {bodyText ?? DEFAULT_BODY(durationDays)}
      </p>
      <dl className="mt-4 flex flex-col gap-1.5 text-[12px]">
        <PledgeRow label="기간" value={`${durationDays}일 · ${dateRangeText}`} />
        <PledgeRow label="인증 빈도" value={goalCountLabel(goalCount).detail} />
        <PledgeRow label="벌금" value={penaltyAmount === 0 ? "없음" : `회당 ${penaltyAmount.toLocaleString()}원`} />
        {ownerName && <PledgeRow label="작성자" value={ownerName} />}
      </dl>
    </div>
  );
}

function PledgeRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-t border-white/20 pt-1.5">
      <dt className="opacity-80">{label}</dt>
      <dd className="font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

function formatDateRange(durationDays: number): string {
  const start = new Date();
  const end = new Date();
  end.setDate(start.getDate() + durationDays);
  const fmt = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}`;
  return `${fmt(start)} ~ ${fmt(end)}`;
}
```

**`PledgeSigningCanvas` — 디자인 시스템 기반** (모킹업 §3-C 라인 647~650 sign-area):

```typescript
// (app)/challenge/new/_components/pledge-signing-canvas.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface PledgeSigningCanvasProps {
  onChange: (dataUrl: string | null) => void;
  className?: string;
}

export function PledgeSigningCanvas({ onChange, className }: PledgeSigningCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [drawing, setDrawing] = useState(false);
  const [hasInk, setHasInk] = useState(false);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = c.getBoundingClientRect();
    c.width = rect.width * dpr;
    c.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#22262E"; // foreground 토큰의 hex (canvas는 CSS var 미지원)
  }, []);

  function getPoint(e: React.PointerEvent): { x: number; y: number } {
    const c = canvasRef.current;
    if (!c) return { x: 0, y: 0 };
    const rect = c.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function start(e: React.PointerEvent) {
    e.currentTarget.setPointerCapture(e.pointerId);
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const p = getPoint(e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    setDrawing(true);
  }
  function move(e: React.PointerEvent) {
    if (!drawing) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const p = getPoint(e);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    setHasInk(true);
  }
  function end() {
    if (!drawing) return;
    setDrawing(false);
    const c = canvasRef.current;
    if (!c || !hasInk) return;
    onChange(c.toDataURL("image/png"));
  }
  function clear() {
    const c = canvasRef.current;
    if (!c) return;
    c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
    setHasInk(false);
    onChange(null);
  }

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <div className="flex items-center justify-between">
        <span className="t-caption">전자 서명</span>
        <button type="button" onClick={clear} className="t-sub hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded">
          지우기
        </button>
      </div>
      <canvas
        ref={canvasRef}
        className="h-24 w-full rounded-[10px] border border-border bg-card touch-none"
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
        aria-label="전자 서명 캔버스"
        role="img"
      />
      <p className="text-[10px] text-muted-foreground">손가락 또는 펜으로 서명해주세요</p>
    </div>
  );
}
```

**`createChallenge` Server Action 변경** — `ownerSignatureDataUrl` 입력 + 응답에 `inviteUrl` 추가:

```typescript
// (app)/challenge/new/_actions.ts (Step 5.6 ADR-0003 변경에 더해)
//
// ADR-0003: 자동 그룹 + 운영자 자가 서명 동시 처리
// Step 7b 추가: ownerSignatureDataUrl 으로 운영자 본인 서명 즉시 처리
//
// 결과 응답: { id: challengeId, inviteUrl: string }
//   - inviteUrl 은 invite/share-url.ts 또는 새 invite token RPC 결과
export const createChallenge = withUser<CreateChallengeInputWithSignature, { id: string; inviteUrl: string }>(
  async (user, input) => {
    // 1. 자동 그룹 생성 (ADR-0003)
    // 2. challenge row 생성
    // 3. 운영자 본인 서명 처리 — pledge_signatures 테이블 또는 group_members.signed_at 갱신
    //    (기존 signPledge Server Action 또는 RPC 재사용 가능 — supabase/migrations/0023_signpledge_returns_count.sql)
    // 4. invite token 발급 + URL 생성 (lib/invite/share-url.ts)
    return success({ id: createdId, inviteUrl });
  },
);
```

> **PR5 작업 시 확인 사항**:
> - `signPledge` Server Action 또는 RPC 가 이미 있으면 그것 재사용 (현 코드 `0023_signpledge_returns_count.sql` 존재)
> - signature image 데이터 보관: (a) Storage `signatures/` bucket — migration 필요 / (b) `pledge_signatures.signature_data_url` 컬럼 — migration / (c) **보관 안 함 (boolean signed 만)** — PRD §3.3 AC-5 충족, migration 0건. 추천 **(c)**
> - invite URL 발급 — `createChallenge` 응답에 inviteUrl 포함, `CreationCompleteSheet` 가 props로 받음

- [ ] **Step 7c: 3-D 생성 완료 화면 (L2 누락 보강)**

모킹업 §3-D 라인 657~673. wizard step 3 으로 인라인 렌더 (별도 라우트 아님).

```typescript
// (app)/challenge/new/_components/creation-complete-sheet.tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";

interface CreationCompleteSheetProps {
  challengeId: string;
  inviteUrl: string;
}

export function CreationCompleteSheet({ challengeId, inviteUrl }: CreationCompleteSheetProps) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("복사에 실패했어요");
    }
  }

  async function shareKakao() {
    // Q11 #44: Web Share API + URL fallback
    if (navigator.share) {
      try {
        await navigator.share({ url: inviteUrl, title: "with-key 챌린지" });
        return;
      } catch { /* 사용자 취소 — fallthrough */ }
    }
    await copy();
    toast.info("링크를 복사했어요. 카카오톡에 붙여넣어 공유하세요");
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 py-8">
      <div className="flex size-20 items-center justify-center rounded-full bg-brand-secondary-soft text-4xl">🎉</div>
      <h2 className="t-h2">챌린지가 생성되었어요!</h2>
      <p className="t-sub text-center break-keep">
        링크를 친구들에게 공유하면<br />전원 서명 후 자동 시작돼요
      </p>
      <div className="mt-2 flex w-full items-center justify-between gap-2 rounded-[12px] border border-border/60 bg-muted/40 px-3 py-2.5">
        <span className="t-sub flex-1 truncate font-mono text-[12px]">{inviteUrl}</span>
        <button
          type="button"
          onClick={copy}
          className="t-sub font-semibold text-primary active:scale-95 transition-transform px-2 py-1 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {copied ? "복사됨" : "copy"}
        </button>
      </div>
      <button
        type="button"
        onClick={shareKakao}
        className="w-full rounded-full bg-[#FEE500] py-3 text-[13px] font-semibold text-[#3C2E22] active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        카카오톡으로 공유
      </button>
      <Link href={`/challenge/${challengeId}`} className="t-sub mt-2 underline-offset-4 hover:underline">
        홈으로
      </Link>
    </div>
  );
}
```

특징:
- 모킹업 §3-D 라인 660~669 카피·구조 1:1
- 카카오 컬러 `#FEE500` 직접 (브랜드 일관성)
- Web Share API + Clipboard fallback (Q11 #44 결정)
- "복사됨" 상태 1.5s 후 reset
- `text-[#3C2E22]` 카카오 다크 텍스트
- `bg-brand-secondary-soft` 토큰 사용 (모킹업 ic-secondary)
- 모션 토큰 `active:scale-95` / `transition-transform`

- [ ] **Step 8: 검증 + 커밋**

```bash
pnpm typecheck && pnpm lint
pnpm test tests/unit/frequency.spec.ts 'src/app/(app)/challenge/new/_components/frequency-stepper.spec.tsx'
git add src/lib/challenge/frequency.ts tests/unit/frequency.spec.ts 'src/app/(app)/challenge/new/_components/frequency-stepper.tsx' 'src/app/(app)/challenge/new/_components/frequency-stepper.spec.tsx'
git commit -m "feat(challenge): add FrequencyStepper + goalCountLabel helper (모킹업 §3-A)"
```

> **참고**: FrequencyStepper는 1 라우트(`challenge/new`) 전용이므로 `ui/`가 아닌 라우트 colocate. 모킹업 §6-A "매일 1회" 등 라벨 표시는 `goalCountLabel`만 재사용. 향후 챌린지 수정 기능이 추가되면(2번째 라우트) `ui/`로 승격 고려.

### Task 5.2: Challenge 상세 + 3-탭 셸 (§6 첫 화면)

- [ ] **Step 1: `(app)/challenge/[id]/_components/challenge-tabs.tsx` 셸 신설** — 디자인 시스템 기반

모킹업 §6/§8/§9 상단의 `.tabs` 마크업(라인 855·882·917·940)을 React로 옮김. 3 탭: `인증 피드 / 현황판 / 정보`. **이 PR5에선 셸 + Placeholder 컨텐츠**, 피드/현황판 본문은 PR6, 정보 본문은 PR7에서 채움.

```typescript
// (app)/challenge/[id]/_components/challenge-tabs.tsx
"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

type TabKey = "feed" | "dashboard" | "info";

interface ChallengeTabsProps {
  feed: React.ReactNode;
  dashboard: React.ReactNode;
  info: React.ReactNode;
  defaultTab?: TabKey;
}

const TABS: { key: TabKey; label: string }[] = [
  { key: "feed", label: "인증 피드" },
  { key: "dashboard", label: "현황판" },
  { key: "info", label: "정보" },
];

export function ChallengeTabs({ feed, dashboard, info, defaultTab = "feed" }: ChallengeTabsProps) {
  const [active, setActive] = useState<TabKey>(defaultTab);
  const content = active === "feed" ? feed : active === "dashboard" ? dashboard : info;
  return (
    <div className="flex flex-col gap-3">
      <div role="tablist" aria-label="챌린지 보기" className="flex gap-1 rounded-full bg-muted p-1">
        {TABS.map(({ key, label }) => {
          const on = active === key;
          return (
            <button
              key={key}
              role="tab"
              aria-selected={on}
              tabIndex={on ? 0 : -1}
              onClick={() => setActive(key)}
              className={cn(
                "flex-1 rounded-full px-3 py-1.5 text-[12px] font-semibold transition-colors",
                "duration-[var(--motion-fast)] ease-[var(--ease-out-soft)]",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                on ? "bg-card text-foreground shadow-[0_1px_2px_rgba(20,24,36,0.06)]" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {label}
            </button>
          );
        })}
      </div>
      <div role="tabpanel">{content}</div>
    </div>
  );
}
```

- [ ] **Step 2: PR5에서 셸 + 정보 탭(§9-B)을 채움**

피드/현황판은 placeholder Skeleton, 정보 탭은 §9-B의 서약서 미리보기 + info-row + 초대 링크 복사 채움. (PR6에서 피드·현황판 본문 교체, PR7는 정보 탭 추가 손볼 일 없음)

```typescript
// (app)/challenge/[id]/page.tsx 일부
import { Skeleton } from "@/components/ui/skeleton";
import { ChallengeTabs } from "./_components/challenge-tabs";
// ...
return (
  <div className="flex flex-col gap-4 p-4">
    <StatusCard ... />
    <ChallengeTabs
      feed={<FeedTabPlaceholder />}      // PR5: <Skeleton variant="card" />×3 / PR6: <FeedTab challengeId={id} />
      dashboard={<DashboardTabPlaceholder />} // PR5: <Skeleton variant="card" /> / PR6: <DashboardTab .../>
      info={<InfoTab detail={detail} pledge={pledge} />} // PR5: 본문 채움
    />
    <ChallengeOwnerMenu visible={user.id === detail.group.ownerId} /> {/* PR7에서 채울 ⋯ 메뉴 */}
  </div>
);
```

- [ ] **Step 3: `status-card.tsx` 신설** — primary bg 카드, "FROM·WITH · 운영자" 라벨, 챌린지 이름, 참여자 사회증명 (#33 — "이미 N명이 함께했어요")

`tone="primary"` Card 활용 + 솔로(`participantCount === 1`)와 멀티 분기 카피:
- 멀티: `이미 {n - 1}명이 함께했어요`
- 솔로: `혼자 시작했어요 · 친구를 초대해보세요`

- [ ] **Step 4: 챌린지 정보 4-카드** (기간·인증빈도·벌금·인원) — 기존 컴포넌트가 있으면 시각 교체, 없으면 `_components/challenge-info-cards.tsx` 신설. 인증빈도 라벨은 `goalCountLabel(goalCount).detail` 사용

- [ ] **Step 5: §6-A 운영자 안내 카드** (모킹업 라인 785~787)

```tsx
<Card padding="sm" className="bg-destructive/10 border-transparent">
  <div className="flex items-center gap-2 text-[11px] text-destructive">
    <AlertCircle className="size-3.5" aria-hidden="true" />
    <span>다음 단계에서 운영자가 작성한 서약서를 확인하고 서명하면 챌린지에 참여돼요</span>
  </div>
</Card>
```

- 챌린지 상세에서 본인이 아직 서명 안 한 참여자일 때만 노출
- 카드 tone: `destructive/10` 배경 + 작은 텍스트 + AlertCircle 아이콘

### Task 5.3: Pledge 서명 (§6 두 번째)

- [ ] **Step 1: `(app)/pledge/_components/pledge-card.tsx` 시각 교체** — primary bg, "from·with" 스탬프, 운영자 작성 라벨, 4-row 메타

- [ ] **Step 2: 서명 캔버스 (`sign-area`)** — `react-signature-canvas` 또는 SVG path 캡처. 이미 구현돼 있으면 시각만 교체.

### Task 5.4: 참여 완료 → redirect 흡수 (§7)

- [ ] **Step 1: `(app)/pledge/_actions.ts`의 서명 성공 후 redirect 갱신**

```typescript
// 서명 성공 후 — signPledge 결과의 status 분기 (F6)
const result = await signPledgeRpc(...);
if (result.status === "active") {
  // 본인이 마지막 서명자 = 전원 서명 완료 + active 전이
  redirect(`/challenge/${challengeId}?just_joined=1&activated=1`);
} else {
  // 일부 멤버 서명 대기
  redirect(`/challenge/${challengeId}?just_joined=1`);
}
```

- [ ] **Step 2: `(app)/challenge/[id]/page.tsx`에 searchParam 처리 + `<JustJoinedBanner />`**

```typescript
const { just_joined, activated } = await searchParams;
// 페이지 상단에 just_joined === "1" 이면 JustJoinedBanner 렌더 + Stamp 1회 재생
// F6 — activated === "1" 이면 카피 강화
//   - activated: "챌린지 시작!" + Stamp tone="success"
//   - 그냥 just_joined: "참여 완료" + "다른 멤버 서명 대기 중" 안내 + Stamp tone="primary"
```

```typescript
// (app)/challenge/[id]/_components/just-joined-banner.tsx
import { Card } from "@/components/ui/card";
import { Stamp } from "@/components/ui/stamp";

interface JustJoinedBannerProps {
  activated: boolean;
  totalSigned: number;
  totalMembers: number;
}

export function JustJoinedBanner({ activated, totalSigned, totalMembers }: JustJoinedBannerProps) {
  if (activated) {
    return (
      <Card tone="primary" padding="lg" className="flex items-center gap-4">
        <Stamp label="시작" tone="success" />
        <div>
          <div className="t-h3">챌린지 시작!</div>
          <div className="t-sub text-primary-foreground/80">전원 서명 완료 · 오늘부터 인증 시작</div>
        </div>
      </Card>
    );
  }
  return (
    <Card padding="lg" className="flex items-center gap-4">
      <Stamp label="참여" tone="primary" />
      <div>
        <div className="t-h3">참여 완료</div>
        <div className="t-sub">
          서명 {totalSigned}/{totalMembers} · 전원 서명 시 자동 시작돼요
        </div>
      </div>
    </Card>
  );
}
```

PRD §3.3 AC-5 "전원 서명 완료 시 active 전이 + 전원에게 시작 푸시" 자동 — `signPledge` Server Action 이 이미 처리 중 (`status: "active"` 반환 시점에 dispatchStartPush 호출). PR5 작업 시 코드 확인.

- [ ] **Step 3: 옛 참여완료 별도 라우트 파일 있으면 삭제** — 가드레일 §"외과적 수정"

### Task 5.5: 외부 공유 OG (§4)

- [ ] **Step 1: `src/app/share/[challengeId]/opengraph-image.tsx`**

Next.js dynamic OG (`ImageResponse`). 모킹업 §4 디자인 (그라데이션 + 챌린지 이름 + 메타) 그대로.

- [ ] **Step 2: challenge 상세 안의 "공유" 버튼** — invite-url을 카카오톡 share intent 또는 native share API로 전달. og:image는 `/share/{id}/opengraph-image`에서 자동 생성.

### Task 5.6: 자동 그룹 생성 + `/group/new` 폐기 (ADR-0003 구현)

- [ ] **Step 1: `(app)/challenge/new/_actions.ts`의 `createChallenge` 변경**

ADR-0003: `groupId` 가 없으면 사용자 단독 그룹 자동 생성 후 챌린지 생성.

```typescript
// (app)/challenge/new/_actions.ts (수정)
import { createGroup } from "@/app/(app)/group/new/_actions";
// ...
export const createChallenge = withUser<CreateChallengeInput, { id: string }>(
  async (user, input): Promise<ActionResult<{ id: string }>> => {
    let { groupId } = input;
    if (!groupId) {
      // ADR-0003: 첫 챌린지 = 자동 그룹.
      const displayName = user.user_metadata?.display_name ?? user.email?.split("@")[0] ?? "사용자";
      const groupResult = await createGroup({ name: `${displayName}님과 친구들` });
      if (!groupResult.ok) return groupResult;
      groupId = groupResult.data.id;
    }
    // 이후 기존 챌린지 생성 로직 그대로
    // ...
  },
);
```

`CreateChallengeInput` 타입에서 `groupId` 를 optional 로 변경. zod 스키마(`src/lib/validators/challenge.ts` 또는 `_actions.ts` 내 입력 스키마)도 동일하게 `.optional()` 추가.

> **주의**: 이 변경이 `src/lib/validators/challenge.ts` 까지 닿으면 spec-required (AGENTS.md §4). 다만 본 변경은 입력 스키마 미세 조정 + ADR-0003 가 이미 정책 root → 새 spec 작성 불필요 (ADR로 충분). PR5 작업 시 reviewer 판단.

- [ ] **Step 2: `(app)/challenge/new/page.tsx`의 groupId 처리**

기존 `if (!groupId) toast.error(...)` 분기 제거. URL `?groupId=` 가 없어도 정상 진행.

- [ ] **Step 3: `(app)/group/new/page.tsx` → redirect 폐기**

```typescript
// (app)/group/new/page.tsx (전체 교체)
import { redirect } from "next/navigation";
// ADR-0003: 그룹 명시 UI 폐기. 외부 링크 보존을 위해 redirect.
export default function GroupNewRedirect() {
  redirect("/challenge/new");
}
```

`(app)/group/new/_actions.ts` 의 `createGroup` 함수는 `/group/[id]` settings 안 계좌 추가에서 재사용되므로 **유지** (PR7 Task 7.1 참조).

`_components/` 디렉토리는 사용처 없음 — 삭제:

```bash
rm -rf 'src/app/(app)/group/new/_components/'
```

### Task 5.7: `/pledge` · `/recap` sub-route 이동

ADR-0002 IA 변경: 별도 라우트로 떨어진 pledge·recap을 challenge sub-route로 이동.

- [ ] **Step 1: `/pledge` → `/challenge/[id]/pledge` 이동**

```bash
mkdir -p 'src/app/(app)/challenge/[id]/pledge'
git mv 'src/app/(app)/pledge/_actions.ts' 'src/app/(app)/challenge/[id]/pledge/_actions.ts'
git mv 'src/app/(app)/pledge/_components' 'src/app/(app)/challenge/[id]/pledge/_components'
```

`page.tsx` 는 `[id]` 동적 매개변수 받도록 시그니처 수정 후 이동:

```typescript
// (app)/challenge/[id]/pledge/page.tsx
type Params = Promise<{ id: string }>;
export default async function PledgePage({ params }: { params: Params }) {
  const { id: challengeId } = await params;
  // fetchPendingPledge 호출 시 challengeId 전달 — 시그니처 변경 필요할 수 있음
  // ...
}
```

옛 `/pledge` 라우트 처리:
- (a) 완전 삭제 (가드레일 §외과적 수정 — 사용처 없으면)
- (b) `/pledge` → `/home` redirect (외부 링크 보존)
- 추천 **(a)** — 옛 라우트 외부 사용처 grep 으로 확인 후 0건이면 삭제

- [ ] **Step 2: `/recap` → `/challenge/[id]/recap` 이동**

```bash
mkdir -p 'src/app/(app)/challenge/[id]/recap'
git mv 'src/app/(app)/recap/_components' 'src/app/(app)/challenge/[id]/recap/_components'
```

`page.tsx` 시그니처 변경:

```typescript
// (app)/challenge/[id]/recap/page.tsx
type Params = Promise<{ id: string }>;
export default async function RecapPage({ params }: { params: Params }) {
  const { id: challengeId } = await params;
  const recap = await fetchRecap(challengeId);  // 시그니처 변경 — challengeId 기반
  // ...
}
```

`fetchRecap(user.id)` → `fetchRecap(challengeId)` 시그니처 변경. PR5 작업 시 read 함수 호출 위치 grep + 갱신.

옛 `/recap` 라우트:
- 추천 **(b) redirect** — `/recap` 진입 시 가장 최근 ended challenge 찾아 `/challenge/[id]/recap` redirect, 없으면 `/home` redirect

```typescript
// (app)/recap/page.tsx (전체 교체)
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/require-user";
import { fetchRecap } from "@/lib/db/reads/recap";

// ADR-0002: recap 은 challenge sub-route. 옛 진입점 redirect.
export default async function RecapRedirect() {
  const user = await requireUser();
  const recap = await fetchRecap(user.id);  // 옛 휴리스틱 — "최근 ended challenge"
  if (!recap) redirect("/home");
  redirect(`/challenge/${recap.challengeId}/recap`);
}
```

### Task 5.8: PR5 검증·PR 생성

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm build
pnpm dev
# 1. wizard step 1: 챌린지 정보 입력 (FrequencyStepper · EndDatePicker · PenaltyPicker)
# 2. wizard step 2: PledgePreviewCard + PledgeSigningCanvas 그리기 (3-C 모킹업 매핑)
# 3. submit → step 3 (CreationCompleteSheet, 3-D 모킹업 매핑)
# 4. groupId 없이 챌린지 생성 → 자동 그룹 "{nickname}님과 친구들" 생성 확인 (Supabase Studio)
# 5. 챌린지 생성 → /challenge/[id]/pledge 서명 → /challenge/[id]?just_joined=1 redirect + 보너스 배너 + 도장 1회
# 6. 종료된 챌린지 있을 때 /recap → /challenge/[id]/recap redirect 확인
# 7. 옛 /group/new → /challenge/new redirect 확인
# 8. /challenge/[id] 진입 시 3-탭 셸 + 피드 placeholder + 정보 탭 본문 + 운영자 안내 카드 확인
# 9. EndDatePicker 캘린더에서 < 7일 disabled / > 90일 disabled 확인
# 10. PenaltyPicker "없음" 선택 → DB row.penalty_amount = 0 확인
pnpm test:e2e tests/a11y/foundation.spec.ts
```

**기술 점검 (T2·T3 사용 시점 검증)**:

- [ ] **T2: `react-day-picker/style.css` Tailwind 4 충돌**
  - 모바일 viewport 393×852 캡처 — 캘린더 day cell·헤더 정상 렌더
  - `--rdp-*` CSS 변수가 `--color-*` 토큰과 충돌하면 컴포넌트 안 `classNames` prop override 로 해결
- [ ] **T3: KST timezone 동작**
  - 디바이스 timezone Asia/Seoul 일 때 EndDatePicker 가 표시한 종료일 == 사용자 의도 종료일 일치
  - 클라 종료일 "5/21" 표시 → 서버 `created_at + 7일` 이 KST 5/21 23:59:59 까지 인정되는지 확인
  - dev 환경에서 디바이스 timezone 을 America/Los_Angeles 등으로 변경 후 동작 확인 (POC 한국 외 사용자 없지만 회귀 방어)
- [ ] **signature 보관 방식 결정** (PR5 작업 시): (c) boolean signed 만 — 추천. signature_data_url 은 사용 후 폐기 (서버 전송하지만 보관 안 함). 또는 (a) Storage 도입 — migration 동반

---

## PR6: Feed + Action 모달

**Branch:** `feat/ui-feed-action` · **Base:** `develop` (PR5 머지 후)
**Mockup sections:** §8 (845~905), §10 (969~1053)

### Task 6.1: `/feed` 폐기 + Feed 탭을 challenge 안으로 이동 (§8)

ADR-0002 IA 변경: `/feed` 별도 라우트 폐기, challenge 상세의 "인증 피드" 탭으로 흡수.

- [ ] **Step 1: 기존 feed 컴포넌트 이동**

```bash
git mv 'src/app/(app)/feed/_components/feed-card.tsx' 'src/app/(app)/challenge/[id]/_components/feed-card.tsx'
git mv 'src/app/(app)/feed/_components/feed-card.spec.tsx' 'src/app/(app)/challenge/[id]/_components/feed-card.spec.tsx'
# unread-badge 는 헤더 알림으로 이동 (PR2에서 처리) — 사용처 grep 후 결정
```

- [ ] **Step 2: `(app)/challenge/[id]/_components/feed-tab.tsx` 신설** — PR5의 placeholder를 본문으로 교체

```typescript
import { ChallengeFeed } from "./challenge-feed";  // 기존 컴포넌트 재사용

interface FeedTabProps {
  challengeId: string;
  viewerId: string;
  participantCount: number;
  todayDoneCount: number;  // 모킹업 §8-A "오늘 N/N명 인증" 배너
  todayMissingNames: string[];
}

export function FeedTab({ challengeId, viewerId, participantCount, todayDoneCount, todayMissingNames }: FeedTabProps) {
  return (
    <div className="flex flex-col gap-3">
      {/* §8-A 라인 856~859 "오늘 N/N명 인증" 배너 */}
      <Card padding="sm" className="flex items-center justify-between">
        <div>
          <div className="text-[11px] font-semibold">오늘 {todayDoneCount} / {participantCount}명 인증</div>
          {todayMissingNames.length > 0 && (
            <div className="t-sub text-[10px]">{todayMissingNames.join(" · ")} 남음</div>
          )}
        </div>
        <Chip tone="primary">오늘</Chip>
      </Card>
      <ChallengeFeed challengeId={challengeId} viewerId={viewerId} participantCount={participantCount} />
    </div>
  );
}
```

- [ ] **Step 3: `feed-card.tsx` 시각 교체** — 모킹업 `.feed-card` (라인 860~866):
  - 아바타·이름·시간·DAY 칩 → `<header>` flex row
  - 사진 → 16:9 ratio container
  - 태그 칩 → `<Chip tone="neutral">` 사용
  - 일기 본문 → `t-body` 클래스
  - 리액션 바 → kudos 이모지 카운트 (B11 충돌 — 아래 명시)
  - 자기 글 분기: `bg-muted/60` + "편집" 링크 (#25 C 보류 항목 — UI는 모킹업 그대로, 편집 동작은 PR6 작업 시 PO 확인)

- [ ] **Step 4: §8 카메라 FAB 중앙** — challenge 상세 안에서만 FAB 노출

```typescript
// challenge/[id]/page.tsx 하단
<Fab href={`/challenge/${id}/action`} label="인증하기" icon={Camera} className="fixed bottom-6 left-1/2 -translate-x-1/2 z-20" />
```

active 탭이 "인증 피드" 또는 "현황판" 일 때만 노출 (모킹업 §9-A "초대 · 정보" 탭엔 카메라 FAB 제거 명시 — 라인 909).

- [ ] **Step 5: 옛 `(app)/feed/page.tsx` · `_actions.ts` 처리**

`_actions.ts` 의 `markFeedSeen` 은 헤더 unread dot 처리에서 호출 — 어디로 이동? AppHeader 또는 알림 페이지 진입 시 호출. 일단 `(app)/_actions.ts` 신설 또는 `src/lib/db/writes/feed.ts` 신설로 이동.

```bash
# 옛 라우트 삭제 또는 redirect
# 추천: 삭제 + 외부 진입 보존 위해 (a)/feed 가 아니라 challenge 의 첫 탭으로 redirect 가 어려움 (chId 모름)
# → /feed 진입 시 가장 최근 active challenge 의 피드 탭으로 redirect
```

```typescript
// (app)/feed/page.tsx (전체 교체)
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/require-user";
import { fetchActiveChallenge } from "@/lib/db/reads/active-challenge";

// ADR-0002: 피드는 challenge 안 탭. 옛 진입점 redirect.
export default async function FeedRedirect() {
  const user = await requireUser();
  const active = await fetchActiveChallenge(user.id, { statuses: ["active"] });
  if (!active) redirect("/home");
  redirect(`/challenge/${active.id}#feed`);  // 또는 ?tab=feed
}
```

- [ ] **Step 6: 현황판 탭 (§8-B) — `dashboard-tab.tsx` 신설**

모킹업 §8-B (라인 877~903): primary bg status-card (누적 벌금·통계 pill row) + 멤버 row 리스트.

```typescript
// (app)/challenge/[id]/_components/dashboard-tab.tsx
import { Card } from "@/components/ui/card";
import { MemberStrip } from "./member-strip";

interface DashboardTabProps {
  totalPenalty: number;
  totalActions: number;
  totalFailures: number;
  daysRemaining: number;
  members: ChallengeMemberView[];
  goalCount: number;
}

export function DashboardTab({ totalPenalty, totalActions, totalFailures, daysRemaining, members, goalCount }: DashboardTabProps) {
  return (
    <div className="flex flex-col gap-3">
      <Card tone="primary" padding="lg" className="text-center">
        <div className="text-[12px] opacity-85">누적 벌금</div>
        <div className="mt-1 text-[32px] font-extrabold tabular-nums">
          {totalPenalty.toLocaleString()}<sub className="text-[14px] font-semibold opacity-90 ml-1">원</sub>
        </div>
        <div className="mt-3 flex flex-wrap justify-center gap-1.5">
          <Chip tone="neutral" className="bg-white/15 text-white">총 인증 {totalActions}회</Chip>
          <Chip tone="neutral" className="bg-white/15 text-white">실패 {totalFailures}회</Chip>
          <Chip tone="neutral" className="bg-white/15 text-white">남은 {daysRemaining}일</Chip>
        </div>
      </Card>
      <MemberStrip goalCount={goalCount} members={members} />
    </div>
  );
}
```

신규 read 함수 `src/lib/db/reads/challenge-dashboard.ts` 또는 기존 `fetchChallengeDetail` 확장:
- `totalPenalty` — sum of per-head penalty across members
- `totalActions` — count(action_logs)
- `totalFailures` — count(missed days) — #35 인증 실패 감지에 종속 (C 보류 — placeholder 0)
- `daysRemaining` — challenge.endAt - now

> **주의**: #35(인증 실패 감지) 결정 전이면 `totalFailures = 0`으로 placeholder. PR6 작업 시 PO 결정 따라 채움.

- [ ] **Step 7: Kudos 이모지 처리 (B11 결정 잠금 — Q8 grill)**

**결정**: PRD §7.3 AC-1 그대로 `🔥` `💪` `👏` 3개 유지. 데이터 모델·RLS·migration 무변경. 모킹업 §8-A 의 `👍` 는 `💪` 의 시각 표현으로 매핑, "+" 버튼 제거.

```typescript
// (app)/challenge/[id]/_components/feed-card.tsx kudos bar 부분
import { Flame, ... } from "lucide-react";

const KUDOS_EMOJIS = ["🔥", "💪", "👏"] as const;
type KudosEmoji = (typeof KUDOS_EMOJIS)[number];

interface KudosBarProps {
  counts: Record<KudosEmoji, number>;
  myKudos: Record<KudosEmoji, boolean>; // 내가 눌렀는지
  onToggle: (emoji: KudosEmoji) => void;
  selfDisabled: boolean;                  // PRD §7.3 AC-4: 본인 인증엔 kudos 불가
}

export function KudosBar({ counts, myKudos, onToggle, selfDisabled }: KudosBarProps) {
  return (
    <div className="flex items-center gap-2.5 mt-2">
      {KUDOS_EMOJIS.map((emoji) => {
        const count = counts[emoji];
        const mine = myKudos[emoji];
        return (
          <button
            key={emoji}
            type="button"
            disabled={selfDisabled}
            aria-pressed={mine}
            aria-label={`${emoji} 응원 ${count}${mine ? " · 내가 누름" : ""}`}
            onClick={() => onToggle(emoji)}
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 transition-transform duration-[var(--motion-fast)]",
              "active:scale-90 disabled:opacity-50 disabled:pointer-events-none",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
            )}
          >
            <span className="text-[14px] leading-none">{emoji}</span>
            <span className={cn(
              "text-[11px] tabular-nums",
              mine ? "font-bold text-foreground" : "font-normal text-muted-foreground",
            )}>
              {count}
            </span>
          </button>
        );
      })}
    </div>
  );
}
```

특징:
- 3개 항상 노출 (PRD 3종) — 카운트 0이어도 표시
- 내가 누른 emoji = 카운트 굵게 + foreground 색 (`font-bold text-foreground`)
- 안 누른 emoji = 카운트 일반 + muted 색 (`font-normal text-muted-foreground`)
- 본인 인증엔 disabled (PRD §7.3 AC-4)
- "+" 버튼 제거 — 모킹업 §8-A "+" 는 의도 불명확이라 미반영
- 모킹업 `👍` 는 `💪` 의 시각 표현으로 매핑

**PR8 PRD 갱신 (B11)**: PR8 Task 8.1 §7 갱신 시 AC-1 옆에 주석 추가:
> 모킹업 §8-A 의 `👍` 는 `💪` 의 시각 표현으로 매핑됨. "+" 버튼은 의도 불명확으로 미반영. 디자이너 컨펌 시 변경 가능.

### Task 6.2: `/action` → `/challenge/[id]/action` sub-route 이동 + 4-상태 모달 (§10)

ADR-0002 IA 변경: `/action` 별도 라우트 폐기, challenge sub-route로 이동.

- [ ] **Step 1: 라우트 이동**

```bash
mkdir -p 'src/app/(app)/challenge/[id]/action'
git mv 'src/app/(app)/action/_actions.ts' 'src/app/(app)/challenge/[id]/action/_actions.ts'
git mv 'src/app/(app)/action/_components' 'src/app/(app)/challenge/[id]/action/_components'
```

`page.tsx` 시그니처 변경 — `params: { id: string }` 사용, `fetchActiveChallenge` 휴리스틱 제거하고 명시 challengeId 사용.

옛 `/action` 라우트:
- 추천 **redirect** — `/action` 진입 시 가장 최근 active challenge 의 action 으로 redirect
- 없으면 `/home` redirect

§10에는 4가지 상태:
- 10-A: AI 운동일기 (사진 + AI 텍스트 + 등록)
- 10-B: 오늘 운동 인증 완료 (check 아이콘 + 슬라이드 카운터)
- 10-C: 첫 운동 인증 성공 (🎉 + 격려)
- 10-D: 오늘 인증 실패 (😢 + 벌금 추가 표시)

- [ ] **Step 2a: 사진 입력 dual entry — 디자인 시스템 기반 (Q12 #78 결정 반영)**

모킹업 §10-A는 사진 업로드 후 상태만 표시. 진입점은 OS 위임 + 명시 보조 링크. 사진 미선택 상태에서 ActionForm은 다음 UI:

```typescript
// (app)/challenge/[id]/action/_components/action-form.tsx (사진 미선택 상태)
import { Camera } from "lucide-react";
import { useRef } from "react";
import { Fab } from "@/components/ui/fab";

// ... 컴포넌트 안에서:
const cameraInputRef = useRef<HTMLInputElement>(null);
const libraryInputRef = useRef<HTMLInputElement>(null);

function openCamera() {
  cameraInputRef.current?.click();
}
function openLibrary() {
  libraryInputRef.current?.click();
}

// 사진 미선택 시 빈 상태 UI
return (
  <div className="flex flex-col items-center justify-center gap-4 py-12">
    <div className="flex flex-col items-center gap-2 text-center">
      <h2 className="t-h2">오늘의 운동을 인증하세요</h2>
      <p className="t-sub">사진 한 장으로 시작할 수 있어요</p>
    </div>
    <Fab onClick={openCamera} label="사진 찍기" icon={Camera} />
    <button
      type="button"
      onClick={openLibrary}
      className="t-sub text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded"
    >
      사진에서 선택
    </button>

    {/* hidden inputs — UI 에 노출 안 됨 */}
    <input
      ref={cameraInputRef}
      type="file"
      accept={`${ALLOWED_PHOTO_MIME.join(",")},image/heic,image/heif`}
      capture="environment"
      onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
      className="sr-only"
      aria-hidden="true"
      tabIndex={-1}
    />
    <input
      ref={libraryInputRef}
      type="file"
      accept={`${ALLOWED_PHOTO_MIME.join(",")},image/heic,image/heif`}
      onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
      className="sr-only"
      aria-hidden="true"
      tabIndex={-1}
    />
  </div>
);
```

특징:
- **Fab primitive 재사용** (PR1 Task 1.4) — 카메라 진입점이 시각적 핵심
- **`capture="environment"`** 카메라 input — iOS Safari·Android Chrome에서 후면 카메라 우선
- **capture 없는 input** 라이브러리 — `image/*` accept로 라이브러리·파일 picker 띄움
- **`sr-only`** 두 input 모두 화면 미노출, 클릭만 트리거
- **접근성**: 두 진입점 모두 키보드 접근 가능, focus ring 적용
- **카피**: "사진 찍기"(Fab aria-label) / "사진에서 선택"(텍스트 링크) — 모킹업 톤 일치
- 모션: Fab의 `active:scale-95` 자동, 텍스트 링크 hover underline

기술 이슈 검증 결과 (모두 해결됨):
- ✓ EXIF orientation: `createImageBitmap({ imageOrientation: "from-image" })` 자동 회전
- ✓ HEIC (iPhone): `heic2any` 라이브러리·카메라 모두 변환
- ✓ 파일 크기: long edge 1920px clamp + quality 0.85
- ✓ 권한: OS 위임 (iOS 14+ PHPicker)
- ✓ MIME 다층 방어: client `ALLOWED_PHOTO_MIME` + Storage bucket policy

사진 선택 후엔 모킹업 §10-A 디자인으로 전환 — Step 2b 참조.

- [ ] **Step 2b: `action-form.tsx` 시각 교체 (10-A) — diary-bot 안내 포함** (모킹업 라인 980~982)

```tsx
{/* 모킹업 §10-A diary-bot 안내 — AI 일기 위 */}
<div className="flex items-start gap-2 rounded-[12px] bg-brand-primary-soft p-3">
  <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs">
    🤖
  </div>
  <p className="t-sub text-[12px]">
    AI가 사진을 보고 짧은 일기를 만들었어요.<br />
    마음에 안 들면 다시 생성하거나 직접 수정할 수 있어요.
  </p>
</div>

{/* 헤더 row: 라벨 + "다시 생성" 우측 (모킹업 라인 983~986) */}
<div className="flex items-center justify-between">
  <span className="t-caption">오늘의 일기</span>
  <RerollButton ... />
</div>
```

- [ ] **Step 3: action 결과 모달들** — `_components/action-result-dialog.tsx` 신설 (shadcn Dialog 사용)

```typescript
type ActionResultVariant = "completed" | "first-success" | "failed";

interface ActionResultDialogProps {
  variant: ActionResultVariant;
  // variant별 props (continuousDays · totalDays · todayCount · penaltyAdded · penaltyTotal)
}
```

`continuousDays` (연속 인증일 streak) — 백로그 #34 C 보류. PR6 작업 시 PO 결정 전이면 placeholder 또는 모달에서 숨김.

- [ ] **Step 4: 슬라이드 day 카운터 — `day-slider.tsx`**

모킹업 §10-B 라인 1005~1009: 1~30 day 가로 슬라이드, 오늘 day 중앙 정렬. 모킹업 메모 "9초 hold→slide→hold 무한 루프" (라인 1014).

```typescript
// (app)/challenge/[id]/action/_components/day-slider.tsx
"use client";
import { useEffect, useRef } from "react";

interface DaySliderProps {
  totalDays: number;
  currentDay: number;
}

export function DaySlider({ totalDays, currentDay }: DaySliderProps) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // reduced-motion 시 즉시 currentDay 위치로 점프, 루프 없음
    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const el = ref.current;
    if (!el) return;
    // 9초 hold→slide→hold 무한 루프 — 1~currentDay 까지 등장
    // 컴파일러 친화: transform translate3d 만 사용
    if (prefersReduced) {
      // 즉시 currentDay 중앙 정렬, 정적
      return;
    }
    // setInterval 또는 CSS keyframe + animationiteration 이벤트
    // 자세 구현은 PR6 작업 시 결정
  }, [currentDay, totalDays]);

  return (
    <div className="overflow-hidden rounded-[12px] bg-muted px-2 py-3">
      <div
        ref={ref}
        className="flex gap-1.5 transition-transform duration-[var(--motion-slow)] ease-[var(--ease-out-soft)]"
      >
        {Array.from({ length: totalDays }, (_, i) => i + 1).map((d) => (
          <span
            key={d}
            data-active={d === currentDay}
            className="inline-flex size-7 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-muted-foreground data-[active=true]:bg-primary data-[active=true]:text-primary-foreground tabular-nums"
          >
            {d}
          </span>
        ))}
      </div>
    </div>
  );
}
```

> **모션 정책 재확인** (Q6 결정): 도장은 "마운트당 1회" 인데 day slider는 모킹업 메모 "무한 루프". 충돌 — POC dogfood 사용자에게 무한 루프는 시선 산만 우려. 추천 **마운트당 1회 슬라이드 → 정지** (모킹업 의도 일부 보존, 시선 산만 회피). reduced-motion 시 즉시 정적. PR6 작업 시 PO 확인 가능.

- [ ] **Step 5: 실패 시 벌금 표시 (10-D)** — `<Card tone="muted">` 안에 "벌금 추가 +5,000원" / "누적 벌금 5,000원"

#35 인증 실패 감지 결정 전이면 10-D 모달 자체가 트리거 불가 — PR6 작업 시 (a) action 등록 직후 자정 지난 미인증 day 감지 (b) 별도 cron 두 방식 중 PO 결정.

**F7·F8 — 모달 CTA destination**:

```typescript
// 10-A "등록하기" 클릭 → 결과 모달 분기
function handleSubmit() {
  // ... 등록 후 결과 type 판단
  const variant = isFirstAction ? "first-success" : "completed";
  setResult(variant);
}

// 10-B "확인" (인증 완료) / 10-C "확인" (첫 인증)
function handleConfirm() {
  router.replace(`/challenge/${challengeId}`);  // F7: 챌린지 상세 피드 탭 (default)
}

// 10-D "닫기" / "내 현황 보기"
function handleClose() {
  router.replace(`/challenge/${challengeId}`);  // 피드 탭
}
function handleViewDashboard() {
  router.replace(`/challenge/${challengeId}?tab=dashboard`);  // F8: 현황판 탭
}
```

**ChallengeTabs query param sync** (F8 지원):

```typescript
// (app)/challenge/[id]/_components/challenge-tabs.tsx 변경
"use client";
import { useSearchParams, useRouter, usePathname } from "next/navigation";

export function ChallengeTabs({ feed, dashboard, info }: ChallengeTabsProps) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const activeFromQuery = (searchParams.get("tab") ?? "feed") as TabKey;
  const [active, setActiveLocal] = useState<TabKey>(activeFromQuery);

  function setActive(next: TabKey) {
    setActiveLocal(next);
    // URL sync — shallow router replace (re-render 안 함)
    const params = new URLSearchParams(searchParams.toString());
    if (next === "feed") params.delete("tab");  // default
    else params.set("tab", next);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }
  // ... 나머지 동일
}
```

**F9 — 사진 picker 취소 처리** (PR6 Task 6.2 Step 2a):

이미 현 코드의 `handleFile(e.target.files?.[0] ?? null)` 가 cancel 시 null 받음 → ActionForm 빈 상태 유지. plan에 명시:

```typescript
// (app)/challenge/[id]/action/_components/action-form.tsx
function handleFile(file: File | null) {
  if (!file) {
    clearPhoto();  // 사용자 취소 / clear — 빈 상태 유지, 토스트 없음
    return;
  }
  // ... 기존 검증
}
```

**F10 — 등록 실패 시 입력값 보존 (PRD §4.4 "로컬 draft 1시간 보관")**:

```typescript
// (app)/challenge/[id]/action/_components/action-form.tsx
const DRAFT_KEY = (challengeId: string) => `withkey:action-draft:${challengeId}`;
const DRAFT_TTL_MS = 60 * 60 * 1000; // 1시간

function saveDraft(challengeId: string, state: ActionDraft) {
  localStorage.setItem(DRAFT_KEY(challengeId), JSON.stringify({
    ...state,
    savedAt: Date.now(),
  }));
}

function loadDraft(challengeId: string): ActionDraft | null {
  const raw = localStorage.getItem(DRAFT_KEY(challengeId));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (Date.now() - parsed.savedAt > DRAFT_TTL_MS) {
      localStorage.removeItem(DRAFT_KEY(challengeId));
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function clearDraft(challengeId: string) {
  localStorage.removeItem(DRAFT_KEY(challengeId));
}

// 사용:
// 1. ActionForm mount 시 loadDraft → 있으면 state 복원 + "이전 작성을 불러왔어요" toast
// 2. submitActionLog 실패 시 saveDraft (현 state)
// 3. submit 성공 시 clearDraft
```

**주의**: 사진 file 자체는 localStorage 보관 불가 (size·serialize). 사용자에게 사진은 재선택 안내. 키워드·메모·activity_type 만 보존.

**F11 — AI reroll 5회 초과 UX**:

모킹업 메모 "남은 횟수 텍스트 제거" 해석:
- (a) 카운터 텍스트 제거, 5회 도달 시 disabled + 작은 helper "다시 생성은 5회까지" — 모킹업 의도와 미세 충돌 (helper 도 텍스트)
- (b) 카운터·helper 모두 제거, 5회 도달 시 disabled 만 — 사용자가 왜 비활성인지 모름
- (c) 카운터 제거, 5회 도달 시 disabled + tooltip on hover/long-press

추천 **(a)** — 5회 도달 시점에만 한 줄 helper, 도달 전엔 카운터 없이 깔끔. 모킹업 의도 일부 보존.

```typescript
// (app)/challenge/[id]/action/_components/reroll-button.tsx
"use client";
import { RotateCcw } from "lucide-react";

interface RerollButtonProps {
  count: number;
  max: number;
  onReroll: () => void;
}

export function RerollButton({ count, max, onReroll }: RerollButtonProps) {
  const atMax = count >= max;
  return (
    <div className="flex flex-col items-end gap-0.5">
      <button
        type="button"
        onClick={onReroll}
        disabled={atMax}
        className={cn(
          "inline-flex items-center gap-1 rounded-full border border-border/60 px-2.5 py-1 text-[12px] font-semibold",
          "transition-transform duration-[var(--motion-fast)]",
          "active:scale-95 hover:bg-muted",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
          "disabled:opacity-50 disabled:pointer-events-none",
        )}
      >
        <RotateCcw className="size-3" aria-hidden="true" /> 다시 생성
      </button>
      {atMax && <span className="text-[10px] text-muted-foreground">다시 생성은 {max}회까지</span>}
    </div>
  );
}
```

- [ ] **Step 6: PRD §6.3 AC-7 푸시 권한 모달 — 디자인 시스템 갱신** (모킹업 명시 없음, PRD 명시)

기존 `StartActionButton` 또는 새 action 진입 흐름에서 푸시 권한 미허용 시 1회 권한 요청 모달 노출 — shadcn Dialog 시각 갱신 (모킹업 디자인 시스템 토큰 적용).

```tsx
<Dialog open={showPermission} onOpenChange={setShowPermission}>
  <DialogContent>
    <DialogHeader>
      <DialogTitle className="t-h3">알림으로 챌린지 진행을 도와줄게요</DialogTitle>
      <DialogDescription className="t-sub">
        친구들의 인증·마감 임박을 놓치지 않도록 푸시 알림을 켜주세요.
      </DialogDescription>
    </DialogHeader>
    <DialogFooter className="gap-2">
      <Button variant="ghost" onClick={dismiss}>다음에</Button>
      <Button onClick={requestPermission}>알림 켜기</Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

- [ ] **Step 7: PRD §9.1 이벤트 영향 검토 — `action_started`·키워드 이벤트**

PRD §9.1의 `action_started` 트리거가 "운동 시작 탭" — 모킹업에는 "운동 시작" 별도 버튼이 없음. 현 코드 `StartActionButton` 이 이 이벤트 송신 위치.

옵션:
- (a) `action_started` 이벤트를 "FAB 카메라 클릭" 시점으로 재정의
- (b) 이벤트 폐기 (PRD §9.1 갱신 — PR8)
- (c) `StartActionButton` 동작을 카메라 FAB 안에 흡수

추천 **(a)** — 이벤트 보존, 트리거 위치만 이동. PRD §9.1 의 "발생 시점" 컬럼 PR8에서 갱신.

키워드 이벤트(`keywords_shown` / `keywords_reroll` / `keyword_selected`):
- 모킹업 §10-A에 키워드 칩 미노출 (AI 일기 결과만)
- 현 코드 `ActionForm` 에 keyword chip group 있음
- 추천 — **키워드 선택 UI는 §10-A 진입 전 별도 step** (모킹업 누락). PR6 작업 시 PO 확인:
  - (i) 모킹업처럼 키워드 없이 사진만 → AI 일기 → 키워드 이벤트 폐기
  - (ii) 키워드 칩 UI 유지 — §10-A 이전에 별도 step 추가
- 결정 전이면 **(ii)** 유지 (이벤트·데이터 보존)

- [ ] **Step 8: AnalyticsEvent 위치 변경 확인 — spec 동반 검토**

`/feed` 폐기 + `/action` sub-route 이동 → 다음 이벤트의 송신 위치만 변경:
- `feed_view` — `/feed/page.tsx` → `/challenge/[id]/_components/feed-tab.tsx` (탭 활성화 시 `useEffect` 또는 server-side)
- `action_started` — `/action/page.tsx` → FAB 클릭 시점 (위 옵션 (a))

**이벤트 schema(`src/lib/analytics/schema.ts`) 변경 없음** 확인 후 spec 불필요. 변경 발견 시 spec-required (AGENTS.md §4).

```bash
# PR6 작업 시 검증
grep -n "feed_view\|action_started" src/ -r --include="*.ts" --include="*.tsx"
# schema.ts diff 가 없으면 PR 본문에 "AnalyticsEvent schema 변경 없음, 송신 위치만 이동" 명시
```

### Task 6.3: PR6 검증·PR 생성

**기술 점검 (T4 사용 시점 검증)**:

- [ ] **T4: iOS Safari `capture="environment"` + `sr-only` input 클릭 트리거**
  - 실 iPhone Safari PWA 설치 후 `/challenge/[id]/action` 진입
  - Fab "사진 찍기" 클릭 → 카메라 native 진입 확인
  - 텍스트 링크 "사진에서 선택" 클릭 → 사진 라이브러리 native picker 확인
  - 두 input 모두 `sr-only` 인 상태에서 ref `.click()` 정상 동작 확인
  - Android Chrome PWA 동일 확인
  - 실패 시 fallback: `sr-only` 대신 `opacity-0 absolute pointer-events-none` 사용

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm build
pnpm dev
# /feed 진입 → 자기 글/타인 글 / 빈 / 에러 / 현황판 탭
# /action 진입 → AI 일기 → 등록 → 4가지 모달 시나리오
```

---

## PR7: Recap + Settings + Group + Notifications

**Branch:** `feat/ui-recap-settings-group` · **Base:** `develop` (PR6 머지 후)
**Mockup sections:** §9 (907~967), §11 (1055~1106), §12 (1108~1164), §13 (1166~끝)

### Task 7.1: Group / Challenge 정보 탭 (§9) + 그룹 선택 sheet + group/[id] 신설

ADR-0003 후속 구현: `/group/[id]` 라우트 신설 + 그룹 선택 sheet 본문 채움.

- [ ] **Step 1: `(app)/group/[id]/page.tsx` 신설**

페이지 구성:
- 헤더: 그룹 이름 (편집 가능 — `(app)/group/new/_actions.ts`의 `createGroup` updateGroup 변형 또는 별도 action)
- 멤버 리스트
- 이 그룹의 챌린지 리스트 (active + closed)
- 계좌 카드 (lazy 입력 — ADR-0003)
  - 미설정이면 `<Card>` 안에 "정산용 계좌가 아직 없어요" + 입력 trigger
  - 설정됨이면 마스킹된 last4 + "변경" 버튼

```typescript
// (app)/group/[id]/page.tsx
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/require-user";
import { fetchGroupDetail } from "@/lib/db/reads/group-detail"; // 신규 read
import { GroupHeader } from "./_components/group-header";
import { GroupMembers } from "./_components/group-members";
import { GroupChallengesList } from "./_components/group-challenges-list";
import { GroupAccountCard } from "./_components/group-account-card";

type Params = Promise<{ id: string }>;
export default async function GroupDetailPage({ params }: { params: Params }) {
  const { id } = await params;
  const user = await requireUser();
  const detail = await fetchGroupDetail(id, user.id);
  if (!detail) notFound();
  return (
    <div className="flex flex-col gap-3 p-4">
      <GroupHeader name={detail.name} isOwner={detail.ownerId === user.id} />
      <GroupAccountCard
        groupId={detail.id}
        bankCode={detail.bankCode}
        accountHolder={detail.accountHolder}
        accountNumberLast4={detail.accountNumberLast4}
        isOwner={detail.ownerId === user.id}
      />
      <GroupMembers members={detail.members} />
      <GroupChallengesList challenges={detail.challenges} />
    </div>
  );
}
```

신규 read `src/lib/db/reads/group-detail.ts`:

```typescript
export type GroupDetailView = {
  id: string;
  name: string;
  ownerId: string;
  bankCode: string | null;
  accountHolder: string | null;
  accountNumberLast4: string | null;
  members: { id: string; displayName: string; joinedAt: string }[];
  challenges: { id: string; title: string; status: string; endAt: string | null }[];
};
```

- [ ] **Step 2: `GroupAccountCard` — 계좌 lazy 입력 (ADR-0003)**

```typescript
// 모킹업에 없는 자체 디자인 — Card primitive 활용
import { Wallet, ChevronRight } from "lucide-react";

interface GroupAccountCardProps {
  groupId: string;
  bankCode: string | null;
  accountHolder: string | null;
  accountNumberLast4: string | null;
  isOwner: boolean;
}

export function GroupAccountCard({ groupId, bankCode, accountHolder, accountNumberLast4, isOwner }: GroupAccountCardProps) {
  const hasAccount = bankCode && accountHolder && accountNumberLast4;
  if (!hasAccount) {
    return (
      <Card padding="lg" className="flex items-center gap-4">
        <div className="flex size-10 items-center justify-center rounded-full bg-brand-secondary-soft">
          <Wallet className="size-5 text-secondary-foreground" aria-hidden="true" />
        </div>
        <div className="flex flex-1 flex-col">
          <div className="t-h3">정산용 계좌가 아직 없어요</div>
          <div className="t-sub">{isOwner ? "챌린지 종료 후 정산에 사용해요" : "그룹 운영자가 추가할 수 있어요"}</div>
        </div>
        {isOwner && (
          <AccountInputSheet groupId={groupId} />
        )}
      </Card>
    );
  }
  return (
    <Card padding="lg" className="flex items-center gap-4">
      <div className="flex size-10 items-center justify-center rounded-full bg-brand-primary-soft">
        <Wallet className="size-5 text-primary" aria-hidden="true" />
      </div>
      <div className="flex flex-1 flex-col">
        <div className="t-h3">{accountHolder} · {bankCode}</div>
        <div className="t-sub tabular-nums">****-****-{accountNumberLast4}</div>
      </div>
      {isOwner && <ChevronRight className="size-5 text-muted-foreground" aria-hidden="true" />}
    </Card>
  );
}
```

- [ ] **Step 2b: `AccountInputSheet` — 계좌 lazy 입력 sheet 본문 (G2)**

`GroupAccountCard` "추가" 버튼 클릭 시 노출. shadcn Dialog 사용. 운영자만 진입.

```typescript
// (app)/group/[id]/_components/account-input-sheet.tsx
"use client";

import { useId, useState, useTransition } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BANK_CODES, BANK_NAMES, type BankCode } from "@/lib/bank/codes";
import { updateGroupAccount } from "../_actions"; // 신규 — createGroup 변형

interface AccountInputSheetProps {
  groupId: string;
  // 기존 계좌가 있으면 변경, 없으면 추가 — 두 모드 동일 UX
  initialBankCode?: string | null;
  initialAccountHolder?: string | null;
  trigger?: React.ReactNode;
}

export function AccountInputSheet({ groupId, initialBankCode, initialAccountHolder, trigger }: AccountInputSheetProps) {
  const bankId = useId();
  const holderId = useId();
  const numberId = useId();
  const [open, setOpen] = useState(false);
  const [bankCode, setBankCode] = useState<BankCode | "">((initialBankCode as BankCode) ?? "");
  const [accountHolder, setAccountHolder] = useState(initialAccountHolder ?? "");
  const [accountNumber, setAccountNumber] = useState("");
  const [pending, start] = useTransition();
  const isEdit = !!initialBankCode;

  function submit() {
    if (!bankCode || !accountHolder.trim() || !accountNumber.match(/^[0-9]{8,16}$/)) {
      toast.error("모든 필드를 정확히 입력해주세요");
      return;
    }
    start(async () => {
      const res = await updateGroupAccount({ groupId, bankCode, accountHolder, accountNumber });
      if (!res.ok) { toast.error("계좌 저장에 실패했어요"); return; }
      toast.success("계좌 정보가 저장됐어요");
      setOpen(false);
      // accountNumber 평문은 메모리 즉시 제거 — 서버에서 AES-256-GCM 암호화 완료
      setAccountNumber("");
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <button
            type="button"
            className="rounded-full bg-primary px-3 py-1.5 text-[12px] font-semibold text-primary-foreground active:scale-95 transition-transform"
          >
            {isEdit ? "변경" : "추가"}
          </button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="t-h3">정산용 계좌</DialogTitle>
          <DialogDescription className="t-sub">
            챌린지 종료 후 멤버들이 벌금을 송금할 계좌예요.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <label htmlFor={bankId} className="t-caption">은행</label>
            <select
              id={bankId}
              value={bankCode}
              onChange={(e) => setBankCode(e.target.value as BankCode | "")}
              className="rounded-lg border border-border bg-card px-3 py-2 text-[13px]"
            >
              <option value="">선택</option>
              {BANK_CODES.map((c) => (
                <option key={c} value={c}>{BANK_NAMES[c]}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor={holderId} className="t-caption">예금주</label>
            <Input id={holderId} value={accountHolder} onChange={(e) => setAccountHolder(e.target.value)} maxLength={30} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor={numberId} className="t-caption">계좌번호</label>
            <Input
              id={numberId}
              value={accountNumber}
              onChange={(e) => setAccountNumber(e.target.value.replace(/\D/g, ""))}
              inputMode="numeric"
              maxLength={16}
              placeholder="숫자만 8~16자리"
            />
            <p className="text-[10px] text-muted-foreground">계좌번호는 서버에서 암호화되어 저장돼요</p>
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>취소</Button>
          <Button onClick={submit} disabled={pending}>
            {pending ? "저장 중..." : isEdit ? "변경 저장" : "계좌 추가"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

**`updateGroupAccount` Server Action** — `(app)/group/[id]/_actions.ts` 에 추가 (또는 기존 `(app)/group/new/_actions.ts` `createGroup` 함수 재활용):

```typescript
// 운영자만. RLS 가 owner_id 검증.
// (app)/group/new/_actions.ts 의 createGroup 패턴 재사용 — 이미 계좌 암호화 로직 보유
export const updateGroupAccount = withUser<UpdateGroupAccountInput, { id: string }>(
  async (user, input) => {
    // 1. groupInputSchema 의 계좌 3-필드 묶음 검증
    // 2. AES-256-GCM 암호화 (encryptAccountNumber)
    // 3. supabase.from("groups").update({...}).eq("id", input.groupId).eq("owner_id", user.id)
    // 4. account_copied 이벤트는 송금자 측 — 여기 X
    return success({ id: input.groupId });
  },
);
```

특징:
- ADR-0003 lazy 입력 정책 — 정산 시점 + group 설정 두 곳에서 노출 (모킹업 미상, 자체 디자인)
- 계좌 평문은 클라이언트 메모리에서 즉시 제거 (`setAccountNumber("")` after submit)
- 서버 측 AES-256-GCM 암호화 (`src/lib/crypto/account-cipher.ts` 기존 사용)
- 모든 필드 동시 입력 (PRD §8.2 D-020 묶음 CHECK 정합)

**`/challenge/[id]/recap` 정산 prompt 연결**:
PR7 Task 7.2 Step 5 의 inline prompt 카드에서 운영자라면 `<AccountInputSheet groupId={...} trigger={<button>지금 추가</button>} />` 로 변경 — 정산 시점 lazy 입력 흐름 완성.

- [ ] **Step 3: 그룹 선택 sheet — AppHeader chevron-down 연결 (F15 1개 그룹 처리 포함)**

`components/app-shell/group-switcher-sheet.tsx` 신설. shadcn Sheet 또는 base-ui Dialog 사용. 사용자가 속한 모든 그룹 리스트 + 현재 active 그룹 표시 + 클릭 시 `/group/[id]` 이동.

**F15 — 그룹 수 ≤ 1 일 때 처리**:
- 그룹 0개: 챌린지·그룹 데이터 없는 첫 사용자 — 헤더에서 `from. with` 로고 + chevron 안 보임
- 그룹 1개: chevron 안 보임 또는 disabled — sheet 의미 없음. 그룹명만 표시
- 그룹 ≥ 2개: chevron 활성 + 클릭 시 sheet 노출

```typescript
// components/app-shell/app-header.tsx 수정 (F15)
interface AppHeaderProps {
  groupLabel?: string;
  multipleGroups?: boolean;  // 추가
  unreadNotifications?: boolean;
}

export function AppHeader({ groupLabel = "from. with", multipleGroups = false, unreadNotifications = false }: AppHeaderProps) {
  return (
    <header className="sticky top-0 z-30 flex items-center justify-between bg-background/90 px-4 py-3 backdrop-blur">
      {multipleGroups ? (
        <GroupSwitcherTrigger label={groupLabel} />  // chevron 노출 + sheet 열기
      ) : (
        <div className="t-h3">{groupLabel}</div>  // 단순 텍스트 라벨, chevron 없음
      )}
      {/* ... 우측 알림·마이 아이콘 */}
    </header>
  );
}
```

`(app)/layout.tsx` 에서 `multipleGroups` prop 계산:

```typescript
const { count } = await supabase
  .from("group_members")
  .select("group_id", { count: "exact", head: true })
  .eq("user_id", user.id);
const multipleGroups = (count ?? 0) >= 2;

<AppHeader multipleGroups={multipleGroups} unreadNotifications={...} />
```

PR2의 AppHeader stub (`groupHref="/group"`) 을 다음 분기로 교체:
- 그룹 1개: `<Link href="/group/${onlyGroupId}">` 로 그룹 상세 직진입 — sheet 우회
- 그룹 2개+: sheet 트리거 (위 코드)

- [ ] **Step 4: challenge 상세 "정보" 탭 본문 채움 — PR5에서 만든 셸의 `<InfoTab>` 컴포넌트 본문**

모킹업 §9-B (라인 940~956):
- 서약서 미리보기 카드 (SIGNED 뱃지)
- 챌린지 정보 info-row (기간·인증빈도·벌금·인원·운영자)
- 초대 링크 복사 버튼 + (운영자만) 서약서 전체 보기 모달 트리거

```typescript
// (app)/challenge/[id]/_components/info-tab.tsx
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";

interface InfoTabProps {
  detail: ChallengeDetailView;
  pledgePreview: string;       // 첫 2-3줄 발췌
  inviteUrl: string | null;     // null 이면 운영자 아님
  onOpenFullPledge: () => void;
}

export function InfoTab({ detail, pledgePreview, inviteUrl, onOpenFullPledge }: InfoTabProps) {
  return (
    <div className="flex flex-col gap-3">
      {/* §9-B 서약서 미리보기 */}
      <Card padding="lg" tone="muted">
        <div className="flex items-center justify-between">
          <span className="font-semibold">서약서</span>
          <Chip tone="success">SIGNED</Chip>
        </div>
        <p className="t-body mt-2 whitespace-pre-line">{pledgePreview}</p>
        <button onClick={onOpenFullPledge} className="t-sub mt-2 text-primary underline-offset-4 hover:underline">
          서약서 전체 보기 →
        </button>
      </Card>
      {/* §9-B 챌린지 정보 5-row */}
      <Card padding="none">
        <InfoRow label="기간" value={`${detail.startAt} ~ ${detail.endAt}`} />
        <InfoRow label="인증 빈도" value={goalCountLabel(detail.goalCount).detail} />
        <InfoRow label="벌금" value={`회당 ${detail.penaltyAmount.toLocaleString()}원`} />
        <InfoRow label="참여 인원" value={`${detail.members.length}명`} />
        <InfoRow label="운영자" value={detail.group.ownerName} />
      </Card>
      {inviteUrl && (
        <button onClick={() => navigator.share?.({ url: inviteUrl })} className="rounded-full bg-primary py-3 text-primary-foreground font-semibold active:scale-95">
          초대 링크 복사
        </button>
      )}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-border/60 px-4 py-3 last:border-b-0">
      <span className="t-sub">{label}</span>
      <span className="t-body font-semibold">{value}</span>
    </div>
  );
}
```

서약서 전체 보기 모달은 백로그 #43 — shadcn Dialog 사용.

### Task 7.1a: 챌린지 운영자 ⋯ 메뉴 (G1 — #42·#68 구체화)

모킹업 §6/§8/§9 상단 ⋯ (라인 766·853·880·915·938). 운영자에게만 노출. PR5에서 셸(`<ChallengeOwnerMenu visible={isOwner} />`) 만들었으니 본 task에서 본문 채움.

```typescript
// (app)/challenge/[id]/_components/challenge-owner-menu.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { MoreHorizontal } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { endChallenge, deleteChallenge } from "../_actions";

interface ChallengeOwnerMenuProps {
  challengeId: string;
  isOwner: boolean;
  status: "pending" | "accepted" | "active" | "closed";
}

export function ChallengeOwnerMenu({ challengeId, isOwner, status }: ChallengeOwnerMenuProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  if (!isOwner) return null;

  // 상태별 액션 가시성
  const canEnd = status === "active";        // 진행 중만 종료 가능
  const canDelete = status !== "closed";      // 종료됨 외 모두 삭제 가능 (회복 안 됨)

  async function handleEnd() {
    const res = await endChallenge({ challengeId });
    if (!res.ok) { toast.error("종료에 실패했어요"); return; }
    setConfirmEnd(false);
    setOpen(false);
    router.replace(`/challenge/${challengeId}/recap`);  // 종료 후 recap 진입
  }

  async function handleDelete() {
    const res = await deleteChallenge({ challengeId });
    if (!res.ok) { toast.error("삭제에 실패했어요"); return; }
    setConfirmDelete(false);
    router.replace("/me/challenges");  // 삭제 후 관리 화면
  }

  return (
    <>
      <button
        type="button"
        aria-label="챌린지 메뉴"
        onClick={() => setOpen(true)}
        className="t-h3 active:scale-95 transition-transform"
      >
        <MoreHorizontal className="size-5" aria-hidden="true" />
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>챌린지 관리</DialogTitle>
          </DialogHeader>
          <ul className="flex flex-col gap-1">
            {canEnd && (
              <li>
                <button type="button" onClick={() => setConfirmEnd(true)} className="w-full rounded-md py-3 text-left hover:bg-muted px-3">
                  챌린지 종료
                </button>
              </li>
            )}
            {canDelete && (
              <li>
                <button type="button" onClick={() => setConfirmDelete(true)} className="w-full rounded-md py-3 text-left text-destructive hover:bg-destructive/10 px-3">
                  챌린지 삭제
                </button>
              </li>
            )}
          </ul>
        </DialogContent>
      </Dialog>
      {/* AlertDialog — 종료 confirm */}
      <ConfirmDialog
        open={confirmEnd}
        onOpenChange={setConfirmEnd}
        title="챌린지를 종료하시겠어요?"
        description="진행 중인 챌린지가 즉시 종료되고 정산 화면으로 이동합니다."
        confirmLabel="종료"
        confirmTone="primary"
        onConfirm={handleEnd}
      />
      {/* AlertDialog — 삭제 confirm */}
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="챌린지를 삭제하시겠어요?"
        description="삭제된 챌린지는 복구할 수 없어요. 멤버 인증 기록·피드도 함께 삭제됩니다."
        confirmLabel="삭제"
        confirmTone="destructive"
        onConfirm={handleDelete}
      />
    </>
  );
}
```

**`ConfirmDialog` 재사용 컴포넌트** (`/me/challenges` 의 종료/삭제/나가기에서도 사용):

```typescript
// src/components/ui/confirm-dialog.tsx (≥2 라우트 사용 → ui/ 승격)
"use client";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  confirmLabel: string;
  confirmTone: "primary" | "destructive";
  onConfirm: () => void | Promise<void>;
}

export function ConfirmDialog({ open, onOpenChange, title, description, confirmLabel, confirmTone, onConfirm }: ConfirmDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="t-h3">{title}</DialogTitle>
          {description && <DialogDescription className="t-sub">{description}</DialogDescription>}
        </DialogHeader>
        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>취소</Button>
          <Button
            onClick={onConfirm}
            className={confirmTone === "destructive" ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : ""}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

**`endChallenge` · `deleteChallenge` Server Actions** (`(app)/challenge/[id]/_actions.ts`에 추가):

```typescript
// 운영자 전용. RLS 가 owner_id 검증.
export const endChallenge = withUser<{ challengeId: string }, null>(async (user, input) => {
  // status='closed' + closed_at=now() 갱신
  // PRD §3.3 AC-6 freeze 영향 없음 (active → closed)
});

export const deleteChallenge = withUser<{ challengeId: string }, null>(async (user, input) => {
  // CASCADE: action_logs · kudos · pledge_signatures · challenge_members 함께 삭제
  // BE_SCHEMA 의 FK on delete cascade 의존
});
```

**G3 — 그룹 해산 처리 (PRD §3.4)**:
- `deleteChallenge` 는 챌린지 1개만 삭제. 그룹 row 는 보존
- 단 그룹의 챌린지가 0개가 되면 → 자동 그룹 해산? 또는 그룹 빈 채 유지?
- 추천 **그룹 빈 채 유지** — 사용자가 `/group/[id]` 진입 가능, "이 그룹에 챌린지가 없어요" + "챌린지 만들기" CTA. ADR-0003 자동 그룹과 정합 (사용자 1인 그룹은 항상 존재)
- 그룹 자체 삭제는 백로그 #105 또는 POC 후 v1
- PRD §3.4 "그룹장 이탈 → 그룹 해산" 은 그룹 멤버 leave 시점 정책 — `/me/challenges` 의 "나가기" 와 다른 개념. PR8 PRD §3.4 갱신 시 명확화 필요

**`ChallengeOwnerMenu` 사용 위치**:
- PR5 Task 5.2 Step 1 에서 `<ChallengeOwnerMenu visible={...} status={detail.status} />` placeholder 만 두고
- 본 task(7.1a)에서 코드 본문 채움 — 즉 컴포넌트 신설 시점은 PR5, 본문 구현은 PR7

> **순서**: PR5 시점에 ChallengeOwnerMenu 코드 본문도 같이 만들 수 있으나, `endChallenge`·`deleteChallenge` Server Action 이 PR7 시점 결정에 의존 (자동 종료 cron 등 #37 관련) → PR7 으로 미루는 게 안전

### Task 7.1b: 챌린지 종료 시각 표시 (F17 — lazy 갱신)

Q11 #37 결정 — `endAt < now()` 이면 클라이언트가 시각적으로 "종료" 표시 (서버 status 갱신은 후속 cron). 챌린지 상세 진입 시:

```typescript
// (app)/challenge/[id]/page.tsx
import { ChallengeEndedBanner } from "./_components/challenge-ended-banner";
// ...
const isEnded = detail.status === "closed" || (detail.endAt && new Date(detail.endAt) < new Date());
const showRecapCta = isEnded;

return (
  <div className="flex flex-col gap-4 p-4">
    {showRecapCta && <ChallengeEndedBanner challengeId={id} />}
    <StatusCard ... />
    <ChallengeTabs ... />
  </div>
);
```

```typescript
// (app)/challenge/[id]/_components/challenge-ended-banner.tsx
import Link from "next/link";
import { Trophy, ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/card";

export function ChallengeEndedBanner({ challengeId }: { challengeId: string }) {
  return (
    <Link href={`/challenge/${challengeId}/recap`} className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-[14px]">
      <Card tone="muted" padding="lg" className="flex items-center gap-3 active:scale-[0.99] transition-transform">
        <div className="flex size-10 items-center justify-center rounded-full bg-brand-secondary-soft">
          <Trophy className="size-5 text-secondary-foreground" aria-hidden="true" />
        </div>
        <div className="flex-1">
          <div className="t-body font-semibold">챌린지가 종료되었어요</div>
          <div className="t-sub">결과 보기 →</div>
        </div>
        <ChevronRight className="size-5 text-muted-foreground" aria-hidden="true" />
      </Card>
    </Link>
  );
}
```

특징:
- challenge 상세 최상단 노출 (StatusCard 위)
- Trophy 아이콘 + brand-secondary-soft tone (Stamp 와 동일 secondary 톤)
- 클릭 → `/challenge/[id]/recap` sub-route
- F18 (종료 푸시) 결정 전이라 클라이언트 자동 redirect 없음 — 사용자가 진입 시 발견

### Task 7.2: Recap (§11) — `/challenge/[id]/recap` sub-route 본문

PR5 Task 5.7에서 라우트 이동 완료. PR7는 본문 시각 교체.

- [ ] **Step 1: `recap-hero.tsx` 시각 교체** — 🏁 썸네일 (메인 컬러 배경) + "챌린지가 종료되었어요!" + 메타 카드 3-row

- [ ] **Step 2: `end-card.tsx` 신설** — primary bg Card, "최종 벌금 15,000원" — `<Card tone="primary">` 활용

- [ ] **Step 3: 참여자별 정산 리스트** — `recap-members-list.tsx` 시각 교체

- [ ] **Step 4: §11-A 액션 버튼 — "결과 공유" / "정산 요청"** (모킹업 라인 1075~1078)

```tsx
<div className="flex gap-2 mt-auto">
  <button onClick={shareResult} className="flex-1 rounded-full border border-border/60 bg-card py-3 text-[13px] font-semibold active:scale-95">
    결과 공유
  </button>
  <button onClick={requestSettlement} className="flex-1 rounded-full bg-primary py-3 text-[13px] font-semibold text-primary-foreground active:scale-95">
    정산 요청
  </button>
</div>
```

"결과 공유" 동작:
- Web Share API 시도 (모바일 native share intent) → fallback Clipboard.writeText(공유 메시지)
- 공유 메시지: `"{챌린지 이름} 종료! 최종 벌금 {amount}원 · with-key"`

"정산 요청" 동작 (백로그 #38 C 보류):
- 현 POC 정책: 표시만, 실제 송금 없음
- 추천 **(a) 카카오톡 공유 메시지** — Web Share API 시도, share intent 가 카카오톡 선택 가능. fallback Clipboard
- 또는 **(b) Disabled placeholder + toast** "정산 기능은 다음 버전에서 제공돼요"
- PR7 작업 시 PO 확인. 결정 전이면 (b) — `disabled={true}` + 옆에 작은 텍스트

- [ ] **Step 5: 그룹 계좌 lazy 입력 prompt (ADR-0003)** — 모킹업 §11-B 정산 시점에 그룹 계좌 미설정이면 inline prompt 노출

```tsx
{!group.accountNumberLast4 && (
  <Card tone="muted" padding="lg" className="flex items-center gap-3">
    <Wallet className="size-5 text-muted-foreground" aria-hidden="true" />
    <div className="flex-1">
      <div className="t-body font-semibold">정산용 계좌가 아직 없어요</div>
      <div className="t-sub">운영자가 그룹 설정에서 계좌를 추가하면 정산할 수 있어요</div>
    </div>
  </Card>
)}
```

### Task 7.3: 챌린지 관리 (§12) — `/me/challenges` 본문

`/me/challenges/page.tsx` (PR7 Task 7.4 Step 10 에서 라우트 합의됨). 모킹업 §12 본문 채움.

- [ ] **Step 1: `(app)/me/challenges/page.tsx` 신설**

```typescript
import { requireUser } from "@/lib/auth/require-user";
import { fetchMyChallengeCounts } from "@/lib/db/reads/my-challenge-counts";
import { fetchMyChallenges } from "@/lib/db/reads/my-challenges"; // 신규 read - status 별 분리
import { ManageCardList } from "./_components/manage-card-list";
import { ChallengeLimitChart } from "./_components/challenge-limit-chart";

export default async function MyChallengesPage() {
  const user = await requireUser();
  const counts = await fetchMyChallengeCounts(user.id);
  const challenges = await fetchMyChallenges(user.id);
  const ownerLimit = 5; // POC 정책 (모킹업 §12-B)
  const totalAny = challenges.owner.length + challenges.member.length;

  // F20: 빈 상태 EmptyState
  if (totalAny === 0) {
    return (
      <div className="flex flex-col gap-4 p-4">
        <h1 className="t-h1">챌린지 관리</h1>
        <EmptyState
          icon={Trophy}
          title="아직 챌린지가 없어요"
          description="새 챌린지를 만들거나 친구의 초대를 받아보세요"
          action={
            <Link href="/challenge/new" className="inline-flex items-center gap-1 rounded-full bg-primary px-4 py-2 text-[13px] font-semibold text-primary-foreground active:scale-95 transition-transform">
              <Plus className="size-4" aria-hidden="true" /> 챌린지 만들기
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <h1 className="t-h1">챌린지 관리</h1>
      <ChallengeLimitChart current={counts.owner} max={ownerLimit} />
      <ManageCardList title="운영 중" challenges={challenges.owner} role="owner" />
      <ManageCardList title="참여 중" challenges={challenges.member} role="member" />
    </div>
  );
}
```

- [ ] **Step 2: `_components/manage-card-list.tsx`** — 운영 중/참여 중 분리, 각 카드에 종료/삭제(운영) 또는 나가기(참여) 액션

```typescript
// (app)/me/challenges/_components/manage-card-list.tsx
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";

interface ManageCardListProps {
  title: string;
  challenges: ManageItem[];
  role: "owner" | "member";
}

export function ManageCardList({ title, challenges, role }: ManageCardListProps) {
  if (challenges.length === 0) return null;
  return (
    <section className="flex flex-col gap-2">
      <h2 className="t-caption">{title} ({challenges.length}개)</h2>
      {challenges.map((c) => (
        <Card key={c.id} padding="md" className="flex items-center gap-3">
          <div className={`flex size-7.5 items-center justify-center rounded-lg ${c.toneClass}`}>
            <span className="text-sm">{c.emoji}</span>
          </div>
          <div className="flex flex-1 flex-col min-w-0">
            <Link href={`/challenge/${c.id}`} className="t-body font-semibold truncate hover:underline">
              {c.title}
            </Link>
            <span className="t-sub text-[11px]">{c.dDay} · {role === "owner" ? "운영자" : "참여자"}</span>
          </div>
          {role === "owner" ? (
            <div className="flex gap-1.5">
              <ChallengeEndButton challengeId={c.id} />
              <ChallengeDeleteButton challengeId={c.id} />
            </div>
          ) : (
            <ChallengeLeaveButton challengeId={c.id} />
          )}
        </Card>
      ))}
    </section>
  );
}
```

`ChallengeEndButton`·`ChallengeDeleteButton`·`ChallengeLeaveButton` — shadcn AlertDialog 사용 confirm 다이얼로그 (백로그 #46·#47).

- [ ] **Step 3: `ChallengeLimitChart` — 최대 5개 진행 차트 (§12-B 라인 1153 `.seg`)**

모킹업 §12-B는 별도 빈 상태 화면. 우리는 `/me/challenges` 상단에 진행 게이지로 통합 (모킹업과 다른 위치지만 의미상 같음 — PO 컨펌 대상).

```typescript
// (app)/me/challenges/_components/challenge-limit-chart.tsx
import { cn } from "@/lib/utils";

interface ChallengeLimitChartProps {
  current: number;
  max: number;
}

export function ChallengeLimitChart({ current, max }: ChallengeLimitChartProps) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <span className="t-sub">운영 가능 슬롯</span>
        <span className="t-body font-semibold tabular-nums">{current} / {max}</span>
      </div>
      <div className="flex gap-1">
        {Array.from({ length: max }, (_, i) => (
          <div
            key={i}
            className={cn(
              "h-2 flex-1 rounded-full transition-colors duration-[var(--motion-base)]",
              i < current ? "bg-primary" : "bg-muted",
            )}
          />
        ))}
      </div>
      {current >= max && (
        <p className="t-sub text-[11px] text-destructive">
          최대 {max}개까지 운영할 수 있어요. 진행 중 챌린지를 종료해주세요.
        </p>
      )}
    </div>
  );
}
```

`current >= max` 정책 enforce는 백로그 #5 C 보류 — `createChallenge` Server Action 에서 차단. 결정 전이면 UI 안내만, 서버 enforce 없음. PR7 작업 시 PO 확인.

### Task 7.4: 마이페이지 (`/me`) — 디자인 시스템 기반 신설

> 모킹업에 마이페이지 화면이 그려져 있지 않음(헤더 user 아이콘은 진입점 메모만). 디자인 시스템(PR1 토큰·primitive) 기반으로 자체 구성. PR7 작업 시 PO에게 캡처 확인.

**Files:**
- Create: `src/app/(app)/me/page.tsx`
- Create: `src/app/(app)/me/_components/profile-card.tsx`
- Create: `src/app/(app)/me/_components/notification-card.tsx` (기존 `PushSettings` 재사용)
- Create: `src/app/(app)/me/_components/my-challenges-card.tsx`
- Create: `src/app/(app)/me/_components/legal-links.tsx`
- Create: `src/app/(app)/me/_components/logout-button.tsx`
- Create: `src/app/(app)/me/_actions.ts` (logout server action)
- Move/Redirect: 기존 `src/app/(app)/settings/page.tsx` → `/me`로 redirect 또는 통합

- [ ] **Step 1: `_actions.ts` — 로그아웃**

```typescript
"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
```

- [ ] **Step 2: `_components/profile-card.tsx`** — 사용자 프로필 헤더

```typescript
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";

interface ProfileCardProps {
  displayName: string;
  email: string;
  joinedAt: string; // YYYY-MM
  challengeCount: number; // 참여 누적
}

export function ProfileCard({ displayName, email, joinedAt, challengeCount }: ProfileCardProps) {
  const initial = displayName.slice(0, 1).toUpperCase();
  return (
    <Card padding="lg" className="flex items-center gap-4">
      <div className="flex size-14 shrink-0 items-center justify-center rounded-full bg-brand-primary-soft text-primary text-xl font-bold">
        {initial}
      </div>
      <div className="flex flex-1 flex-col gap-1 min-w-0">
        <div className="t-h3 truncate">{displayName}</div>
        <div className="t-sub truncate">{email}</div>
        <div className="flex items-center gap-1.5 mt-1">
          <Chip tone="primary">{joinedAt}부터 함께</Chip>
          {challengeCount > 0 && (
            <Chip tone="neutral">챌린지 {challengeCount}회</Chip>
          )}
        </div>
      </div>
    </Card>
  );
}
```

- [ ] **Step 3: `_components/notification-card.tsx`** — 알림 설정 (기존 `PushSettings` 래핑)

```typescript
import { Bell } from "lucide-react";
import { Card } from "@/components/ui/card";
import { PushSettings } from "@/app/(app)/settings/_components/push-settings";
import type { NotificationPrefs } from "@/lib/db/reads/notification-prefs";

interface NotificationCardProps {
  initialPrefs: NotificationPrefs;
  initialSubscribedEndpoint: string | null;
  vapidPublicKey: string;
}

export function NotificationCard(props: NotificationCardProps) {
  return (
    <Card padding="lg" className="flex flex-col gap-4">
      <header className="flex items-center gap-2">
        <Bell className="size-4 text-primary" aria-hidden="true" />
        <h3 className="t-h3">알림 설정</h3>
      </header>
      <PushSettings {...props} />
    </Card>
  );
}
```

- [ ] **Step 4: `_components/my-challenges-card.tsx`** — 챌린지 관리 진입

```typescript
import Link from "next/link";
import { ChevronRight, Trophy } from "lucide-react";
import { Card } from "@/components/ui/card";

interface MyChallengesCardProps {
  ownerCount: number; // 운영 중
  memberCount: number; // 참여 중
}

export function MyChallengesCard({ ownerCount, memberCount }: MyChallengesCardProps) {
  return (
    <Link
      href="/me/challenges"
      className="block transition-transform active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-[14px]"
    >
      <Card padding="lg" className="flex items-center gap-4">
        <div className="flex size-10 items-center justify-center rounded-full bg-brand-secondary-soft text-secondary-foreground">
          <Trophy className="size-5" aria-hidden="true" />
        </div>
        <div className="flex flex-1 flex-col gap-1">
          <div className="t-h3">내 챌린지 관리</div>
          <div className="t-sub">
            운영 중 <span className="text-foreground font-semibold tabular-nums">{ownerCount}</span> ·
            참여 중 <span className="text-foreground font-semibold tabular-nums">{memberCount}</span>
          </div>
        </div>
        <ChevronRight className="size-5 text-muted-foreground" aria-hidden="true" />
      </Card>
    </Link>
  );
}
```

- [ ] **Step 5: `_components/legal-links.tsx`** — 약관·정책 그룹

```typescript
import Link from "next/link";
import { ChevronRight, FileText, Shield } from "lucide-react";
import { Card } from "@/components/ui/card";

const LINKS = [
  { href: "/legal/terms", label: "이용약관", icon: FileText },
  { href: "/legal/privacy", label: "개인정보처리방침", icon: Shield },
] as const;

export function LegalLinks() {
  return (
    <Card padding="none" className="overflow-hidden">
      <ul>
        {LINKS.map(({ href, label, icon: Icon }, i) => (
          <li key={href} className={i > 0 ? "border-t border-border/60" : ""}>
            <Link
              href={href}
              className="flex items-center gap-3 px-4 py-3.5 hover:bg-muted/60 active:bg-muted focus-visible:outline-none focus-visible:bg-muted"
            >
              <Icon className="size-4 text-muted-foreground" aria-hidden="true" />
              <span className="t-body flex-1">{label}</span>
              <ChevronRight className="size-4 text-muted-foreground" aria-hidden="true" />
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}
```

- [ ] **Step 6: `_components/logout-button.tsx`** — 로그아웃 (destructive 톤)

```typescript
"use client";

import { useTransition } from "react";
import { LogOut } from "lucide-react";
import { toast } from "sonner";
import { signOut } from "../_actions";

export function LogoutButton() {
  const [pending, start] = useTransition();
  function handle() {
    start(async () => {
      try {
        await signOut();
      } catch (err) {
        console.error("[signOut]", err);
        toast.error("로그아웃에 실패했어요. 잠시 후 다시 시도해 주세요.");
      }
    });
  }
  return (
    <button
      type="button"
      onClick={handle}
      disabled={pending}
      className="flex w-full items-center justify-center gap-2 rounded-[14px] border border-destructive/30 bg-destructive/5 px-4 py-3.5 text-sm font-semibold text-destructive transition-colors hover:bg-destructive/10 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive/40 disabled:opacity-60"
    >
      <LogOut className="size-4" aria-hidden="true" />
      {pending ? "로그아웃 중…" : "로그아웃"}
    </button>
  );
}
```

- [ ] **Step 7: `page.tsx` — 조합 + 데이터 fetch**

```typescript
import { requireUser } from "@/lib/auth/require-user";
import {
  fetchActiveSubscriptionEndpoint,
  fetchNotificationPrefs,
} from "@/lib/db/reads/notification-prefs";
import { fetchMyChallengeCounts } from "@/lib/db/reads/my-challenge-counts"; // 신규 read 함수
import { ProfileCard } from "./_components/profile-card";
import { NotificationCard } from "./_components/notification-card";
import { MyChallengesCard } from "./_components/my-challenges-card";
import { LegalLinks } from "./_components/legal-links";
import { LogoutButton } from "./_components/logout-button";

// 모킹업 미상 화면 — 디자인 시스템 기반 자체 구성 (PR7 PO 컨펌 대상)
export default async function MePage() {
  const user = await requireUser();
  const [prefs, endpoint, counts] = await Promise.all([
    fetchNotificationPrefs(user.id),
    fetchActiveSubscriptionEndpoint(user.id),
    fetchMyChallengeCounts(user.id),
  ]);
  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";
  const displayName = user.user_metadata?.display_name ?? user.email?.split("@")[0] ?? "사용자";
  const joinedAt = new Date(user.created_at).toLocaleDateString("ko-KR", { year: "numeric", month: "long" });

  return (
    <div className="flex flex-col gap-3 p-4">
      <h1 className="t-h1">마이페이지</h1>
      <ProfileCard
        displayName={displayName}
        email={user.email ?? ""}
        joinedAt={joinedAt}
        challengeCount={counts.totalParticipated}
      />
      <MyChallengesCard ownerCount={counts.owner} memberCount={counts.member} />
      <NotificationCard
        initialPrefs={prefs}
        initialSubscribedEndpoint={endpoint}
        vapidPublicKey={vapidPublicKey}
      />
      <LegalLinks />
      <LogoutButton />
    </div>
  );
}
```

- [ ] **Step 8: 신규 read 함수 `src/lib/db/reads/my-challenge-counts.ts`**

```typescript
import { createClient } from "@/lib/supabase/server";

export type MyChallengeCounts = {
  owner: number;       // 내가 운영자인 진행 중 챌린지
  member: number;      // 내가 참여자인 진행 중 챌린지
  totalParticipated: number; // 누적 (종료된 것 포함)
};

export async function fetchMyChallengeCounts(userId: string): Promise<MyChallengeCounts> {
  const supabase = await createClient();
  // RLS 가 group membership 으로 자동 필터링 — 추가 join 불필요
  const [{ count: ownerCount }, { count: memberCount }, { count: totalCount }] = await Promise.all([
    supabase
      .from("challenges")
      .select("id", { count: "exact", head: true })
      .eq("owner_id", userId)
      .in("status", ["pending", "accepted", "active"]),
    supabase
      .from("challenge_members")
      .select("challenge_id", { count: "exact", head: true })
      .eq("user_id", userId),
    supabase
      .from("challenge_members")
      .select("challenge_id", { count: "exact", head: true })
      .eq("user_id", userId),
  ]);
  return {
    owner: ownerCount ?? 0,
    member: (memberCount ?? 0) - (ownerCount ?? 0),
    totalParticipated: totalCount ?? 0,
  };
}
```

> **주의**: 위 쿼리는 실제 테이블 컬럼명·관계에 맞춰 PR7 작업 시 조정. `challenge_members` 테이블 정확한 이름은 `pnpm db:types` 또는 BE_SCHEMA §5 확인 후 사용.

- [ ] **Step 9: 옛 `/settings` 처리**

`src/app/(app)/settings/page.tsx`를 redirect로 변경:

```typescript
import { redirect } from "next/navigation";
export default function SettingsRedirect() {
  redirect("/me");
}
```

또는 완전 삭제하고 `(app)/me/page.tsx`만 둠 (가드레일 §외과적 수정 시 후자). 다만 외부 링크·푸시 deeplink가 `/settings`를 참조할 수 있어 redirect가 안전.

- [ ] **Step 10: `/me/challenges/page.tsx` 신설** — §12 화면 흡수

이 단계는 PR7 Task 7.3 (관리/제한 화면)을 `/me/challenges` 경로로 colocate. 즉 PR7 Task 7.3과 7.4가 한 디렉토리 트리(`(app)/me/`)에 모임.

### Task 7.4b: PushSettings 컴포넌트 이동 (A10)

기존 `(app)/settings/_components/push-settings.tsx` 는 `/me` Task 7.4 Step 3 의 `NotificationCard`에서 import. `/settings/page.tsx`를 `/me`로 redirect하면 `_components/`는 어디로?

옵션:
- (a) `(app)/settings/_components/` 그대로 두고 `/me`에서 import — 옛 라우트 폴더 잔존
- (b) `(app)/me/_components/push-settings.tsx`로 git mv — 콜로케이션 명확
- (c) `src/components/notifications/push-settings.tsx` 같은 공용 위치로 — 다른 라우트도 사용 가능

**추천 (b)** — 가드레일 §"route colocation 유지". 다음 단계:

```bash
git mv 'src/app/(app)/settings/_components/push-settings.tsx' 'src/app/(app)/me/_components/push-settings.tsx'
git mv 'src/app/(app)/settings/_components/push-settings.spec.tsx' 'src/app/(app)/me/_components/push-settings.spec.tsx'
# 빈 (app)/settings/_components 디렉토리 제거
rm -rf 'src/app/(app)/settings/_components'
```

Task 7.4 의 `NotificationCard` import 경로 갱신:

```typescript
// (app)/me/_components/notification-card.tsx
import { PushSettings } from "./push-settings";  // 상대 경로
```

`(app)/settings/page.tsx` 를 redirect 페이지로 교체:

```typescript
// (app)/settings/page.tsx
import { redirect } from "next/navigation";
export default function SettingsRedirect() {
  redirect("/me");
}
```

### Task 7.5: Notifications 신규 라우트 (§13) — IDB 캐시 (#1·#15 결정 잠금)

**결정 (Q7 grill round)**: 옵션 **(C) 클라이언트 IndexedDB 캐시**. POC 후 (A) Supabase 테이블 확장 가능 (아래 §"POC 후 확장 경로" 참조).

- [ ] **Step 1: `idb` 라이브러리 추가**

```bash
pnpm add idb
```

- [ ] **Step 2: `src/lib/notifications/store.ts` — IDB 스토어 신설**

```typescript
import { openDB, type IDBPDatabase } from "idb";

export type NotificationCategory = "reminder" | "friend_action" | "penalty";
export type NotificationType =
  | "start"              // 운동 시작 (PRD §6.2)
  | "deadline"           // 마감 24h 전 (PRD §6.2)
  | "missed_yesterday"   // 어제 미인증 (Q6 추가)
  | "friend_action"      // 친구 인증 완료
  | "penalty_added";     // 벌금 누적

export interface StoredNotification {
  id: string;             // push payload id 또는 uuid
  type: NotificationType;
  category: NotificationCategory;
  title: string;
  body: string;
  targetUrl: string;
  receivedAt: string;     // ISO timestamp
  readAt: string | null;
}

const DB_NAME = "with-key-notifications";
const STORE = "notifications";
const VERSION = 1;

async function getDb(): Promise<IDBPDatabase> {
  return openDB(DB_NAME, VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE)) {
        const s = db.createObjectStore(STORE, { keyPath: "id" });
        s.createIndex("byReceivedAt", "receivedAt");
        s.createIndex("byCategory", "category");
      }
    },
  });
}

export async function addNotification(n: StoredNotification): Promise<void> {
  const db = await getDb();
  await db.put(STORE, n);
}

export async function listNotifications(category?: NotificationCategory): Promise<StoredNotification[]> {
  const db = await getDb();
  const all = (await db.getAllFromIndex(STORE, "byReceivedAt")).reverse();
  if (!category) return all;
  return all.filter((n) => n.category === category);
}

export async function markAllRead(): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(STORE, "readwrite");
  const all = await tx.store.getAll();
  const now = new Date().toISOString();
  for (const n of all) {
    if (!n.readAt) await tx.store.put({ ...n, readAt: now });
  }
  await tx.done;
}
```

- [ ] **Step 2b: 푸시 payload `targetUrl` 표 (F14)**

각 푸시 type 별 deep link URL — `dispatch.ts` 발송 위치에서 명시:

| Type | Category | targetUrl 형식 | 진입 후 동작 |
|---|---|---|---|
| `start` | reminder | `/challenge/${id}` | 챌린지 상세 피드 탭 |
| `deadline` | reminder | `/challenge/${id}/action` | 인증 sub-route 진입 |
| `missed_yesterday` | penalty | `/challenge/${id}?tab=dashboard` | 현황판 탭 — 누적 벌금 확인 |
| `friend_action` | friend_action | `/challenge/${id}#action-log-${logId}` | 챌린지 피드 + 해당 인증 scroll |
| `penalty_added` | penalty | `/challenge/${id}/recap` | 챌린지 recap (종료 후) |

`StoredNotification.targetUrl` 도 동일 형식. payload data 에서 빌드:

```typescript
// src/lib/push/dispatch.ts
function buildTargetUrl(type: NotificationType, params: { challengeId?: string; actionLogId?: string }): string {
  switch (type) {
    case "start": return `/challenge/${params.challengeId}`;
    case "deadline": return `/challenge/${params.challengeId}/action`;
    case "missed_yesterday": return `/challenge/${params.challengeId}?tab=dashboard`;
    case "friend_action": return `/challenge/${params.challengeId}#action-log-${params.actionLogId}`;
    case "penalty_added": return `/challenge/${params.challengeId}/recap`;
  }
}
```

- [ ] **Step 3: `public/sw.js` (service worker) — push receive 시 IDB 적재**

기존 SW에 push handler 추가:

```javascript
// public/sw.js (기존 PWA register 코드 옆에 추가)
self.addEventListener("push", async (event) => {
  const payload = event.data?.json();
  if (!payload) return;
  const id = payload.data?.id ?? crypto.randomUUID();
  const category = payload.data?.category ?? "reminder";

  // IDB 저장 (모듈 import 어려우므로 raw indexedDB API 사용)
  event.waitUntil((async () => {
    // 1. 알림 표시 (기존 동작)
    await self.registration.showNotification(payload.title, {
      body: payload.body,
      data: payload.data,
    });
    // 2. IDB 적재 (raw indexedDB)
    const db = await new Promise((resolve, reject) => {
      const req = indexedDB.open("with-key-notifications", 1);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
      req.onupgradeneeded = () => {
        const s = req.result.createObjectStore("notifications", { keyPath: "id" });
        s.createIndex("byReceivedAt", "receivedAt");
        s.createIndex("byCategory", "category");
      };
    });
    const tx = db.transaction("notifications", "readwrite");
    tx.objectStore("notifications").put({
      id,
      type: payload.data?.type ?? "reminder",
      category,
      title: payload.title,
      body: payload.body,
      targetUrl: payload.data?.targetUrl ?? "/",
      receivedAt: new Date().toISOString(),
      readAt: null,
    });
    await new Promise((resolve) => { tx.oncomplete = resolve; });
  })());
});
```

- [ ] **Step 3b: SW `notificationclick` 핸들러 — deep link (F12)**

사용자가 native push notification 탭 시 SW가 적절한 URL 로 navigate:

```javascript
// public/sw.js 추가
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.targetUrl ?? "/";
  event.waitUntil((async () => {
    const allClients = await clients.matchAll({ type: "window", includeUncontrolled: true });
    // 이미 열린 앱 탭 있으면 그쪽으로 navigate
    for (const client of allClients) {
      const url = new URL(client.url);
      if (url.origin === self.location.origin) {
        await client.navigate(targetUrl);
        return client.focus();
      }
    }
    // 없으면 새 창 열기
    await clients.openWindow(targetUrl);
  })());
});
```

- [ ] **Step 4: `src/lib/push/dispatch.ts` payload 확장 — `data.category` · `data.type` 필드 추가**

기존 `lib/push/dispatch.ts` 의 payload format을 확장. type-safe하게:

```typescript
// src/lib/push/dispatch.ts (기존)
interface PushPayload {
  title: string;
  body: string;
  data: {
    id?: string;
    type: NotificationType;       // 추가
    category: NotificationCategory; // 추가
    targetUrl?: string;            // 추가
  };
}
```

각 발송 위치(start / deadline / 신규 missed_yesterday)에서 type·category 명시.

**spec-required 검토**: `src/lib/push/*` 는 spec-required 경로 아님(AGENTS.md §4) → spec 미동반 가능. 단 `src/lib/analytics/track.ts` 의 `notification_sent` 이벤트 props 가 `type`만 받음 — 변경 없음 (`type` 필드 그대로 사용, category는 derived).

- [ ] **Step 5: `(app)/notifications/page.tsx` 본문 + 카테고리 탭**

```typescript
"use client";

import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { listNotifications, markAllRead, type StoredNotification, type NotificationCategory } from "@/lib/notifications/store";

const TABS: { key: NotificationCategory | "all"; label: string }[] = [
  { key: "all", label: "전체" },
  { key: "reminder", label: "리마인더" },
  { key: "friend_action", label: "친구 인증" },
  { key: "penalty", label: "벌금" },
];

export default function NotificationsPage() {
  const [tab, setTab] = useState<NotificationCategory | "all">("all");
  const [items, setItems] = useState<StoredNotification[]>([]);

  useEffect(() => {
    listNotifications(tab === "all" ? undefined : tab).then(setItems);
  }, [tab]);

  useEffect(() => {
    void markAllRead();
  }, []);

  return (
    <div className="flex flex-col gap-3 p-4">
      <header className="flex items-center justify-between">
        <h1 className="t-h1">알림</h1>
        <button onClick={markAllRead} className="t-sub hover:underline">모두 읽음</button>
      </header>
      <div role="tablist" className="flex gap-1 rounded-full bg-muted p-1">
        {TABS.map(({ key, label }) => {
          const on = tab === key;
          return (
            <button
              key={key}
              role="tab"
              aria-selected={on}
              onClick={() => setTab(key)}
              className={cn(
                "flex-1 rounded-full px-2.5 py-1.5 text-[11px] font-semibold transition-colors",
                on ? "bg-card text-foreground shadow-[0_1px_2px_rgba(20,24,36,0.06)]" : "text-muted-foreground",
              )}
            >
              {label}
            </button>
          );
        })}
      </div>
      {items.length === 0 ? (
        <EmptyState icon={Bell} title="아직 알림이 없어요" description="친구 인증·마감 알림이 여기 모여요" />
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((n) => (
            <li key={n.id}>
              <NotificationItem item={n} onRead={() => markRead(n.id).then(refresh)} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// F13: 카드 클릭 = navigate + markRead
function NotificationItem({ item, onRead }: { item: StoredNotification; onRead: () => void }) {
  return (
    <Link
      href={item.targetUrl}
      onClick={onRead}
      className="block rounded-[14px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      <Card padding="md" className="flex items-start gap-3 active:scale-[0.99] transition-transform">
        <div className="flex flex-1 flex-col gap-0.5 min-w-0">
          <div className="t-body font-semibold truncate">{item.title}</div>
          <div className="t-sub line-clamp-2">{item.body}</div>
          <div className="text-[10px] text-muted-foreground mt-1">{formatRelativeTime(item.receivedAt)}</div>
        </div>
        {!item.readAt && (
          <div aria-hidden="true" className="mt-1 size-2 shrink-0 rounded-full bg-destructive" />
        )}
      </Card>
    </Link>
  );
}
```

추가 함수 `markRead(id)` 를 `lib/notifications/store.ts` 에 추가:

```typescript
export async function markRead(id: string): Promise<void> {
  const db = await getDb();
  const n = await db.get(STORE, id);
  if (n && !n.readAt) {
    await db.put(STORE, { ...n, readAt: new Date().toISOString() });
  }
}
```

- [ ] **Step 6: AppHeader `unreadNotifications` dot 갱신** — IDB 기반

PR2에서 AppHeader의 `unreadNotifications` prop은 `unreadKudosCount > 0` 으로 처리 중. IDB 도입 시:
- (i) AppHeader는 Client Component 화 — 진입 시 `listNotifications()` 호출, `n.readAt == null` 카운트
- (ii) 또는 Service worker가 unread badge API (`navigator.setAppBadge`) 사용 — PWA 표준

추천 **(i)** — 모킹업의 시각 dot 매칭. PR7 작업 시 AppHeader.tsx 수정.

- [ ] **Step 7: Q6 "어제 미인증 푸시" 추가 — 새 cron 또는 기존 확장**

기존 `api/cron/deadline-push` (마감 24h 전 리마인더) 옆에 새 cron 추가:

```typescript
// src/app/api/cron/missed-yesterday/route.ts (신규)
//
// 매일 00:30 KST에 실행. 어제(YYYY-MM-DD KST) 인증 안한 active 챌린지 참여자에게
// type="missed_yesterday" / category="penalty" 푸시 발송.

import { dispatchMissedYesterdayPush } from "@/lib/push/dispatch";

export async function GET(req: Request) {
  // Vercel cron auth
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  await dispatchMissedYesterdayPush();
  return new Response("ok");
}
```

`vercel.json` cron 추가:

```json
{
  "crons": [
    { "path": "/api/cron/deadline-push", "schedule": "0 23 * * *" },
    { "path": "/api/cron/missed-yesterday", "schedule": "30 0 * * *" }
  ]
}
```

`dispatch.ts` 에 `dispatchMissedYesterdayPush()` 함수 추가 — 어제 자정~오늘 자정 사이 `action_logs` 없는 active 챌린지 참여자 조회 후 push 발송.

**PRD §6.2 영향 (PR8)**: 알림 종류 POC 2종 → 3종 (`start`·`deadline`·`missed_yesterday`). PR8 Task 8.1 §6 갱신 명시.

### POC 후 (A) 확장 경로 — `notifications` 테이블 도입

본 plan은 (C) IDB 캐시로 가지만, dogfood 결과에 따라 v1에서 **(A) Supabase `notifications` 테이블**로 확장. 분리 plan으로 진행:

**확장 시 작업 (별도 plan)**:

1. **신규 마이그레이션** `supabase/migrations/00XX_notifications.sql`:
   ```sql
   create table notifications (
     id uuid primary key default gen_random_uuid(),
     user_id uuid not null references users(id) on delete cascade,
     type text not null check (type in ('start','deadline','missed_yesterday','friend_action','penalty_added')),
     category text not null check (category in ('reminder','friend_action','penalty')),
     title text not null,
     body text not null,
     target_url text,
     read_at timestamptz,
     created_at timestamptz default now()
   );
   create index notifications_user_received on notifications (user_id, created_at desc);
   alter table notifications enable row level security;
   create policy "user reads own notifications" on notifications
     for select using (auth.uid() = user_id);
   ```

2. **`dispatch.ts` 발송 시점에 DB insert 동시 수행** — IDB 적재는 옛 로직 유지 또는 폐기

3. **`src/lib/notifications/store.ts`를 IDB → server fetch 로 교체** — 인터페이스(`listNotifications`·`markAllRead`) 유지하여 호출처 무변경

4. **AppHeader unread dot** — IDB 카운트 → server unread count read 로 교체

5. **ADR 추가** — `docs/adr/00XX-notifications-server-storage.md`. 결정 근거: dogfood에서 다중 디바이스 동기 요청 / 푸시 미수신 알림 누락 마찰 / 분석가 카테고리별 분석 요청 등 evidence

6. **이벤트 표 확장** — `notification_opened` props 에 `category` 추가 (옵션)

확장 시 spec-required 경로: `supabase/migrations/**` (ADR 동반) + `src/lib/validators/notification.ts` (신규, spec 동반).

**확장 트리거 (POC 후 evidence 기준)**:
- 사용자 다중 디바이스 사용률 > 30%
- 또는 dogfood 사용자 5명 중 2명 이상이 "알림 누락" 피드백
- 또는 분석가가 알림 카테고리별 open rate 비교 요청

위 evidence 없으면 (C) IDB 유지 — POC v1 출시까지.

### Task 7.6: PR7 검증·PR 생성

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm build
pnpm dev
# /me, /me/challenges, /recap, /group/[id], /notifications 진입
# /settings 진입 시 /me로 redirect 확인
```

**기술 점검 (T5 사용 시점 검증)**:

- [ ] **T5: Service Worker raw IndexedDB API push receive 동작**
  - dev 환경에서 푸시 발송 (`api/cron/deadline-push` 수동 트리거 또는 dev seed script)
  - SW console 로그 또는 DevTools Application → IndexedDB → `with-key-notifications` 확인 — row 적재 성공
  - `/notifications` 진입 → IDB 항목 목록 표시 확인
  - "모두 읽음" 클릭 → `read_at` 갱신 + 헤더 dot 사라짐
  - 카테고리 탭 전환 (전체/리마인더/친구인증/벌금) — 각 필터 정상 동작
  - SW upgrade 시 (`VERSION` 변경) — 기존 데이터 보존 확인 (POC 는 1차 버전이라 deferred OK)
- [ ] **PWA install 후 native push 수신** — iOS 16.4+ Safari · Android Chrome
- [ ] **Q6 missed_yesterday cron 동작**: dev 환경에서 어제 미인증 시 푸시 발송 + IDB 적재 확인

---

## PR8: PRD / BE_SCHEMA cleanup

**Branch:** `docs/ui-revision-prd-sync` · **Base:** `develop` (PR7 머지 후)

### Task 8.1: PRD 섹션별 정밀 갱신

PR0~PR7 머지 결과 + ADR-0002·0003 반영. 다음 PRD 섹션별로 정확한 변경:

- [ ] **§3 그룹 서약서 — ADR-0003 자동 그룹 반영**
  - §3.2 UX 흐름: "그룹 생성 → 초대 → 챌린지 생성" → "챌린지 생성(자동 그룹) → 초대"
  - §3.3 AC: 그룹 명시 폼 관련 AC 삭제 또는 갱신
  - §3.4 Edge Cases: "그룹 없이 챌린지 생성 시 자동 그룹" 케이스 추가

- [ ] **§4 운동 인증 — IA 변경 반영**
  - §4.2 UX 흐름: `/action` → `/challenge/[id]/action` sub-route
  - §4.6 키워드 풀 정책 변경 없음 (POC freeze 유지)

- [ ] **§5 AI 일기 — 모달 분리**
  - §5.2 UX 흐름: AI 일기 결과 → 모달 4상태 (10-A/B/C/D)
  - §5.6 프롬프트 시스템 변경 없음

- [ ] **§6 알림 — 카테고리 확장 (B12)**
  - §6.2 POC 한정 2종 → 4 카테고리 (전체/리마인더/친구인증/벌금) — 백로그 #1 결정 반영
  - §6.3 AC-7 푸시 권한 모달 디자인 갱신 (모킹업 명시 없음, PRD AC 유지)
  - PR7 Task 7.5 결정이 (c)였다면 §6.2 그대로 유지

- [ ] **§7 Kudos 이모지 충돌 결정 반영 (B11)**
  - §7.3 AC-1: 모킹업 §8-A 와 충돌 결정 결과 반영
  - 옵션 (a) AC-1 그대로 (`🔥 💪 👏`), 모킹업 라벨만 갱신
  - 옵션 (b) 모킹업 따라 — `kudos.emoji` enum 변경 시 BE_SCHEMA §8.2 갱신 + 별도 spec-required PR

- [ ] **§8.2 데이터 모델 — 컬럼 변경 반영 (B14·B15)**
  - `challenges.duration_days` 비고: "POC 고정: 7" → **"7~90 (Q13 결정 ADR-0004)"** (B14)
  - `challenges.penalty_amount` 비고: "1천 단위" → "0~10,000 KRW, 0 또는 1천 단위" (B15, #58)
  - `challenges.start_at` / `end_at` 계산식: "+ 7일" → "+ duration_days"
- [ ] **§3.3 AC-1 갱신 (Q13 결정)**
  - 기간 "(주 단위, POC 고정: 1주)" → "(7~90일, 사용자 종료일 선택 + 최소 1주)"
  - 예정 벌금 "(1,000~20,000원, 1천 단위)" → "(0~10,000원, 0 또는 1천 단위)"
- [ ] **§4.3 AC-3 사진 크기 갱신 (C5)**
  - "최대 10MB, 업로드 시 자동 압축 → 1MB 이하" → 실제 코드 "최대 5MB, 1920px long-edge clamp + quality 0.85"

- [ ] **§9.1 이벤트 표 — 트리거 위치 변경 (B16)**
  - `action_started`: "운동 시작 탭" → "FAB 카메라 클릭 (challenge action sub-route 진입)"
  - `feed_view`: "피드 진입" → "challenge 상세 피드 탭 활성화"
  - 다른 이벤트는 변경 없음. `keywords_*` 이벤트는 PR6 #60 결정에 따라 보존/폐기

- [ ] **§10 화면 인벤토리 — 라우트 1:1 매핑 갱신**

| PRD # | 모킹업 § | 라우트 (신) |
|---|---|---|
| 1 온보딩/로그인 | §1 | `/login` |
| 2 그룹 생성/초대 | §3 (생성) + §4 (공유) | `/challenge/new` + `/share/[id]` OG |
| 3 서약서 서명 | §6 | `/challenge/[id]/pledge` (sub-route) |
| 4 홈 | §2 | `/home` |
| 5 인증 화면 | §10-A | `/challenge/[id]/action` (sub-route) |
| 6 피드 | §8 | `/challenge/[id]` (피드 탭) |
| 7 일기 상세/편집 | §10-A | `/challenge/[id]/action` (등록 후 결과 모달) |
| 8 정산 | §11 | `/challenge/[id]/recap` (sub-route) |
| 9 설정/마이 | §12 + 자체 디자인 | `/me` + `/me/challenges` |
| 신규 | §13 | `/notifications` |
| 신규 | §9-A·9-B | `/group/[id]` |

- [ ] **§11.1 happy path "민지의 2주" 시나리오 — 라우트 변경 반영 (B18)**
  - 옛 `/feed`, `/action`, `/pledge`, `/recap` 진입 경로를 모두 challenge sub-route 또는 자동 그룹 흐름으로 갱신
  - 스크린샷/와이어프레임 캡션 갱신

- [ ] **§12 NFR**: 변경 없음

- [ ] **§14 Out of Scope**: 정산 송금 / 카카오 SSO / 다중 알림 카테고리(결정에 따라) 명시 외인지 확인

### Task 8.2: AnalyticsEvent schema 무변경 확인 (B16)

`src/lib/analytics/schema.ts` 의 `analyticsEventSchema` 유니온이 PR1~7 작업으로 변경됐다면 spec-required 위반:

```bash
git log --oneline -- src/lib/analytics/schema.ts
# PR1~7 동안 schema.ts 변경 commit 있으면 spec 누락 — PR8과 별도 PR로 spec 작성
```

송신 위치 변경(`/feed`, `/action` 라우트 이동)은 schema 변경 아님 — schema 무변경 확인되면 PR8 안에서 PRD §9.1 표 갱신만으로 충분.

### Task 8.3: BE_SCHEMA 갱신

- [ ] **§5.5 challenges 컬럼 — penalty CHECK 갱신 (#58 결정)**
  - `penalty_amount`: 1000~10000 → 0~10000
  - migration `0024_challenge_penalty_allow_zero.sql` 명시 (PR5 Task 5.1 Step 5b)
  - D-007 갱신
- [ ] **§5.5 challenges — duration_days POC 고정 표현 제거** (B14)
- [ ] **§5.x Kudos emoji enum** — #B11 결정 (b) 일 때만 갱신
- [ ] **§5.x notifications 테이블 신설** — PR7 Task 7.5 결정 (a) 일 때만 갱신

### Task 8.4: 검증·PR

```bash
pnpm validate:docs
pnpm check:spec-required
```

---

## 전체 검증 체크리스트

PR1~7 매 PR 공통:

- [ ] `pnpm typecheck`
- [ ] `pnpm lint`
- [ ] `pnpm test`
- [ ] `pnpm build`
- [ ] `pnpm test:e2e tests/a11y/foundation.spec.ts`
- [ ] 모바일 viewport 393×852 + 360×740 캡처
- [ ] 모킹업 해당 섹션과 나란히 비교 캡처
- [ ] 빈·로딩·에러 상태 각각 캡처
- [ ] 키보드 포커스 Tab 확인
- [ ] IA 변경 PR은 "스코프 외 — PRD 갱신은 PR8" 명시

---

## 모킹업에 있는데 프로젝트에 없는 것 — 향후 계획 백로그

> 이 섹션은 PR1~7 작업 중 발견·확정될 항목들의 작업 후보 목록.
> 각 항목은 PR1~7 작업 시 다음 처리:
> - **A. 이 plan에 흡수 가능**: 해당 PR 안에서 즉시 구현
> - **B. 다음 plan으로 분리**: `docs/superpowers/plans/2026-05-xx-<topic>.md` 신설
> - **C. PO 결정 보류**: ADR 또는 spec-required 검토 필요
>
> 처리 기준: 시각 변경 + 기존 라우트 안에서 끝나면 A · 라우트 신설 / 비즈니스 로직 / DB 변경이 동반되면 B 또는 C.

### 신규 라우트 / 페이지

| # | 항목 | 모킹업 | 현 코드 | 분류 | 비고 |
|---|---|---|---|---|---|
| 1 | `/notifications` 인박스 페이지 | §13 (1166~) | 라우트 없음 (push API만) | **C** | 알림 데이터 source 결정 필요 (`notifications` 테이블 신설 vs push 로그 read-model vs 클라이언트 캐시). PR7 Task 7.4에서 PO 확인 |
| 2 | `/share/[challengeId]` 다이나믹 OG | §4 (679~710) | 라우트 없음 (`invite/share-url.ts`만) | **A** | PR5 Task 5.5에 포함 (`opengraph-image.tsx`) |
| 3 | `/challenge/[id]?just_joined=1` 보너스 배너 | §7 (825~843) | 별도 라우트로 분리되어 있을 가능성 | **A** | PR5 Task 5.4 redirect 흡수에 포함 |
| 4 | 챌린지 관리 화면 — 운영 중 / 참여 중 분리 | §12-A (1113~1143) | `(app)/settings/page.tsx` 27줄 (얇음) | **A** | PR7 Task 7.3에 포함 |
| 5 | "최대 5개 챌린지 제한" 빈 상태 | §12-B (1145~1161) | 코드 미존재 | **C** | 5개 제한은 비즈니스 룰 — `src/lib/validators/challenge.ts` 또는 RLS에 enforce 필요. PR7 작업 시 PO 확인 |

### 신규 컴포넌트 / 인터랙션 (모킹업에 명시되나 코드 없음)

| # | 항목 | 모킹업 | 분류 | 비고 |
|---|---|---|---|---|
| 6 | 4-슬라이드 온보딩 (1-C/D/E/F) | §1 (444~487) | **A** | PR3 Task 3.2. 단, 온보딩 1회만 보이고 재방문 시 건너뛰는 로직 (`localStorage` 또는 `users.onboarding_completed_at`) — 어디에 저장할지 PR3 작업 시 결정. localStorage면 A, DB면 C (마이그레이션) |
| 7 | 초대 진입 1-B (외부에서 invite 링크 클릭 후 로그인 페이지) | §1 (404~430) | **A** | PR3에서 invite_token cookie 또는 query param 유지 후 로그인 후 자동 redirect — 기존 매직링크 로직과 어떻게 결합할지 확인 |
| 8 | 점(...) wave 로딩 애니메이션 | §5-B (741~753) | **A** | PR3 Task 3.3에 포함 (`invite-loading-dots.tsx`) |
| 9 | 4개 컬러 stats grid (진행중·완료·미인증·총벌금) | §2-B (528~533) | 미존재 | **A** | PR4 Task 4.1 `home/_components/stats-grid.tsx`. 데이터는 기존 `lib/db/reads/*`에서 집계 — 새 read 함수 1~2개 필요할 수 있음 |
| 10 | 인증 빈도 stepper (− / 매일 / +) | §3-A (574~581) | `duration-picker`는 있으나 빈도는 미확인 | **C** | "매일/주 N번" 비즈니스 룰 새 모델 — `src/lib/validators/challenge.ts` 변경 시 spec-required |
| 11 | 슬라이드 day 카운터 (1→17, 9초 루프) | §10-B (1005~1009) | 미존재 | **A** | PR6 Task 6.2 Step 3 `day-slider.tsx`. 모션·성능 주의 (compositor-friendly properties만) |
| 12 | 인증 실패 모달 — 벌금 추가/누적 row | §10-D (1031~1050) | 미존재 | **A** | PR6 Task 6.2 Step 4. 단 PRD §1.2는 POC에서 "벌금 표시만" — 누적값을 어디서 가져올지 확인 (`computePerHeadPenalty` 활용) |
| 13 | 챌린지 종료 시 결과 공유 / 정산 요청 버튼 | §11-A (1075~1078) | recap 페이지에 결과 공유 없음 | **A** | PR7 Task 7.2. "정산 요청"이 단순 카카오톡 공유 메시지인지, 또는 백엔드 액션 필요한지 PR 작업 시 확인 |
| 14 | 잠금화면 알림 미리보기 (Lock-screen notification mockup) | §13 후반부 (1186~) | 미존재 (실제 push는 구현됨) | **B 또는 X** | 모킹업은 push payload 디자인 의도. 실제 push notification은 OS가 렌더하므로 UI 컴포넌트로 옮기는 게 부적절. PR7에서 push payload 텍스트·아이콘 디자인만 갱신, 미리보기 컴포넌트는 만들지 않음 |
| 15 | 알림 카테고리 탭 (전체/리마인더/친구인증/벌금) | §13 (1175) | 미존재 | **C** | 1번 항목에 종속 (notifications 데이터 source 결정 필요) |

### 비즈니스 로직 / 백엔드 영향

| # | 항목 | 모킹업 | 현 코드 | 분류 | 비고 |
|---|---|---|---|---|---|
| 16 | "이미 N명이 함께했어요" — 챌린지 상세 헤더 사회증명 | §6-A (770) | 코드에 명시 없음 | **A** | challenge 상세 페이지에서 멤버 카운트 read 필요 (이미 멤버 strip이 있으면 재사용) |
| 17 | "최소 2명이 참여하면 챌린지 자동 시작" | §9-A (924~926) | 활성화 조건 코드 위치 확인 필요 | **C** | 현재 활성화 트리거(`challenge_activated` 이벤트)의 조건이 모킹업과 일치하는지 PRD §3·BE_SCHEMA와 대조. 불일치 시 ADR |
| 18 | 운영 중 vs 참여 중 챌린지 구분 | §12-A (1117·1130) | settings/page.tsx 미구현 가능 | **A** | role(owner/member) 필드는 기존에 있을 것. read만 추가 |
| 19 | "균등 분할 정산" 안내 | §3 메모 (551) | settlement.ts는 per-head 모델 | **A** | PR5 Task 5.1에서 UX 안내만 추가. 실제 분할 계산 코드는 변경 없음(POC 표시만) |
| 20 | 카카오 SSO 시작 버튼 (`btn-kakao`) | §1-A (395) | 매직링크만 구현 | **C** | 카카오 OAuth 도입은 큰 작업 — POC 범위 결정 필요. PR3에서 PO 확인. 미도입 시 버튼은 시각만 두고 disabled 또는 "준비 중" 토스트 |
| 21 | 이용약관·개인정보처리방침 링크 | §1-A (397) | 미존재 | **B** | 페이지/외부 링크 결정 필요. POC 안에서는 placeholder `#` |
| 22 | 챌린지 운영자만 보이는 ⋯ 메뉴 | §6/§8/§9 상단 ⋯ (라인 766·853·880·915·938) | 미존재 | **A** | 운영자/참여자 분기, 종료·삭제·나가기 액션 시트 — PR5/PR7에 분산 |
| 23 | 멤버 응원 reaction 확장 (🔥 카운트·👍·+) | §8-A (865) | `kudos`는 emoji enum 1개일 가능성 | **C** | `kudos.emoji` 컬럼 enum 변경 필요하면 spec-required. PR6 작업 시 PO 확인 |
| 24 | "오늘 N/N명 인증" 일일 배너 | §8-A (856~859) | 코드 미확인 | **A** | feed read 모델에 daily aggregate 추가 |
| 25 | 글 편집 (자기 글 — "편집" 링크) | §8-A (868) | action 수정 코드 미확인 | **C** | "인증 후 수정 가능" 비즈니스 규칙 — RLS·이벤트 영향 확인. PR6에서 PO 확인 |
| 26 | 서약서 전체 보기 모달 (`more` 링크) | §9-B (948) | 미존재 | **A** | challenge 상세 정보 탭의 서약서 미리보기 → Dialog로 전체 보기 |

### 모킹업에 없는데 코드에 있는 것 (정보 참고용 — 이 plan은 건드리지 않음)

| # | 항목 | 위치 | 비고 |
|---|---|---|---|
| - | HEIC 자동 변환 (iPhone 사진) | `src/lib/image/` | 모킹업은 결과만 — 변환 진행 UI 없음. 현 코드 유지 |
| - | Quiet Hours KST 푸시 억제 | `src/lib/push/send.ts` | 사용자 설정 UI 없음 (POC: 하드코딩). 모킹업 §13에 표시 안 됨 |
| - | AI cost 추적 / 월별 budget | `src/lib/ai/cost.ts` | 백엔드 로직, UI 없음 |
| - | Reroll keyword button | `action/_components/reroll-button.tsx` | 모킹업 §10-A "다시 생성"이 AI reroll인지 keyword reroll인지 모호 — PR6 Task 6.2 작업 시 확인 |
| - | Bank account 암호화 (`account-cipher.ts`) | `src/lib/crypto/` | 모킹업 §3에서 "균등 분할" 메모만, 계좌번호 입력 UI 명시 없음 |
| - | Magic link rate limit (429) UX | `2026-05-04-magic-link-429-ux.md` plan | 모킹업 §1에 에러 상태 없음 — 이미 별도 plan 있음 |
| - | 멀티 그룹·계좌 / Group 전환 | `home/_components/group-strip.tsx` · `2026-05-06-multi-group-bank-account.md` | 모킹업 §2-B에는 단일 챌린지 시각만 |

### 라우트 / IA 구조적 갭 (코드 면밀 검토 추가)

| # | 항목 | 모킹업 | 현 코드 | 분류 | 비고 |
|---|---|---|---|---|---|
| 27 | `/group/[id]/page.tsx` 라우트 누락 | AppHeader의 그룹 셀렉터 클릭 시 갈 곳 | `_components/`·`_actions.ts`만 있고 `page.tsx` 없음 | **C** | 모킹업도 그룹 상세를 별도 라우트로 보여주지 않음 → AppHeader 그룹 클릭 시 (a) 그룹 선택 sheet (b) `/challenge/[id]` redirect 중 결정. PR2에서 PO 확인 |
| 28 | challenge 상세 3-탭 (인증 피드 / 현황판 / 정보) | §6·§8·§9 모두 challenge 상세 안 탭으로 구성 (라인 855·882·917·940의 `.tabs` 마크업) | `(app)/challenge/[id]/page.tsx`가 feed + member-strip + pot + 초대 트리거를 한 페이지에 인라인 | **A** | PR5에 흡수. 세 탭을 `_components/challenge-tabs.tsx`로 통합, 각 탭 컨텐츠는 server component로 분리 |
| 29 | `/feed` 라우트의 운명 | 모킹업 §8은 challenge 상세의 "인증 피드" 탭 — 별도 `/feed` 라우트 디자인 없음 | `/feed`가 BottomNav 탭으로 존재, 단일 active 챌린지의 피드만 보여줌 | **C** | 큰 IA 결정. (a) `/feed` 폐기 → BottomNav `/feed` 탭 제거 (b) `/feed`는 "다중 챌린지 통합 피드"로 재정의. PR2 BottomNav가 `/feed` 탭을 포함하기로 했으니 (b) 방향이 자연스럽지만 모킹업 매핑이 없음. **PR6 착수 전 PO 확인 필수** |
| 30 | 챌린지 생성 wizard 2-step | §3-A "1/2" — 이름/기간/빈도/벌금, §3-B "2/2" — (서약서 본문) | `(app)/challenge/new/page.tsx`가 단일 페이지에 모두 | **A** | PR5 Task 5.1에서 단일 페이지를 2-step state 또는 별도 sub-route(`/challenge/new?step=2`)로 분리 |
| 31 | "그룹" 개념의 UX 노출 | 모킹업에서 "그룹"이라는 단어는 BottomNav 탭 라벨에만 등장. 챌린지 생성 시 그룹 생성/선택 UI 없음 | `(app)/group/new/page.tsx`로 그룹을 명시적으로 분리, 계좌 입력 등 | **C** | 매우 큰 IA 결정. 옵션: (i) 첫 챌린지 생성 시 자동 그룹 생성 (ii) BottomNav "그룹" 탭이 챌린지 리스트의 다른 뷰. 데이터 모델·`createGroup` 액션·계좌 입력 위치를 전부 좌우. **PR5 착수 전 PO 확인 필수**, ADR 가능성 ↑ |

### 신규 비즈니스 데이터 / 비즈니스 로직 (코드 면밀 검토 추가)

| # | 항목 | 모킹업 | 현 코드 | 분류 | 비고 |
|---|---|---|---|---|---|
| 32 | 홈 4-stats read 함수 | §2-B (라인 528~533): 진행 중·오늘 완료·미인증·총 벌금 | `fetchCurrentChallenges`만, 4-stats 집계 없음 | **A** | PR4 Task 4.1에서 `src/lib/db/reads/home-stats.ts` 신설. RLS 영향 없음(read-only) |
| 33 | "이미 N명이 함께했어요" 사회증명 | §6-A 라인 770 | `MemberStrip`은 있으나 사회증명 카피 없음 | **A** | PR5 Task 5.2 — challenge 상세 헤더에 멤버 카운트 + 카피 |
| 34 | 연속 인증일 streak | §10-B "연속 인증 17일째에요 🔥" | streak 계산 코드 없음 | **C** | `src/lib/db/reads/streak.ts` 신규. POC 범위 결정 필요 — "이번 챌린지 연속" vs "사용자 전체 연속". PR6에서 PO 확인 |
| 35 | 인증 실패 감지·트리거 | §10-D "오늘 인증 실패" 모달 — "5월 13일 인증 마감을 놓쳤어요" 자동 표시 | `api/cron/deadline-push` 리마인더 푸시만, 실패 감지·표시 UI 없음 | **C** | (a) 자정 지나면 클라이언트가 `last_action_at` 보고 추론 (b) 서버 cron이 `action_failures` row 생성 → 신규 테이블 + RLS + migration = spec-required + ADR. PR6에서 PO 확인 |
| 36 | 챌린지 자동 시작 조건 ("최소 2명") | §9-A 라인 924~926 | 솔로 허용 (`isSolo` 분기), `accepted` → `active` 전환 트리거 위치 미확인 | **C** | 솔로 정책 충돌. (i) 솔로 챌린지 폐기 (ii) 솔로 허용 유지 (모킹업 카피만 톤다운). PR5 또는 PR7 결정 |
| 37 | 챌린지 자동 종료 (endAt → closed) | §11 화면 진입 = "챌린지가 종료되었어요!" | `closed` 상태 있음, 전환 트리거 위치 미확인 | **C** | (a) Postgres cron / (b) Vercel cron / (c) lazy 갱신. 현재 방식 코드 확인 후 없으면 추가 cron + ADR. PR7 확인 |
| 38 | "정산 요청" 버튼 동작 | §11-A 라인 1077 | recap 페이지에 settlement request 액션 없음 | **C** | POC "표시만"이라 실제 송금 트리거 X. (i) 카카오톡 공유 메시지 (ii) 인앱 알림 (iii) 미구현 disabled. PR7 결정 |
| 39 | AI "다시 생성" 횟수 정책 | §10-A 메모 "남은 횟수 텍스트 제거" | `reroll-button.tsx` 존재, 횟수 제한 코드 확인 필요 | **C** | (i) 제한 있으나 UI 숨김 (ii) 제한 자체 폐기. `src/lib/ai/cost.ts` 비용 영향. PR6 결정 |
| 40 | 솔로 챌린지 정책 명확화 | 모킹업이 "친구들과 함께" 카피 일색 | 코드는 `isSolo` 분기로 솔로 허용 | **C** | 36번과 동일 결정 |
| 41 | 그룹 계좌 입력 위치 | 모킹업에 `/group/new` 화면 없음 | 현 `/group/new`에 bankCode·accountHolder·accountNumber 3-필드 | **C** | 31번 결정에 종속. 그룹 숨김이면 계좌는 챌린지 생성 wizard 또는 first-time setup으로 |

### 신규 다이얼로그 / 시트 / 인터랙션 (코드 면밀 검토 추가)

| # | 항목 | 모킹업 | 현 코드 | 분류 | 비고 |
|---|---|---|---|---|---|
| 42 | 챌린지 운영자 ⋯ 메뉴 | §6·§8·§9 상단 우측 ⋯ (라인 766·853·880·915·938) | 미존재 | **A** | 운영자만 보이는 액션 시트 — 종료/공지/삭제. shadcn DropdownMenu 또는 Sheet. PR5/PR7 분산 |
| 43 | 서약서 전체 보기 모달 | §9-B 라인 948 "서약서 전체 보기 →" | 서약서 전체 보기 UI 없음 | **A** | PR5 Task 5.2 또는 PR7 Task 7.1 — shadcn Dialog로 풀 서약서 |
| 44 | 카카오톡 공유 시트 / native intent | §4·§9-A·§11-B | `lib/invite/share-url.ts`로 URL만, 공유 UX 미명시 | **C** | (a) Web Share API + URL fallback (마찰 최소) (b) Kakao SDK. PR5/PR7 |
| 45 | "그룹 선택 sheet" — AppHeader 클릭 | §2 헤더 좌측 chevron-down | 미존재 | **A 또는 C** | 27번에 종속. 모킹업 의도가 (a) 단순 이동 (b) 활성 챌린지 전환 (c) 장식. PR2 결정 |
| 46 | 챌린지 종료 confirm 다이얼로그 | §12-A "챌린지 종료" / "삭제" 버튼 (라인 1120·1124·1128) | 미존재 | **A** | shadcn AlertDialog. PR7 Task 7.3 |
| 47 | "나가기" confirm 다이얼로그 (참여자) | §12-A 라인 1134·1139 | 미존재 | **A** | 진행 중 나가기 정책 — 벌금 영향? PR7 카피·정책 |
| 48 | PWA install prompt UX | 모킹업에 명시 없음, dogfood 시작 시 안내 필요 | `pwa-register.tsx` 존재, install prompt UI 없음 | **B** | dogfood-specific, 이 plan 범위 외 |
| 61 | **마이페이지 (`/me`) — 모킹업 미상 화면, 디자인 시스템 기반 자체 구성** | 헤더 user 아이콘 진입점만 명시 (라인 494·502·518), 화면 자체는 모킹업 13개 섹션 어디에도 없음 | `(app)/settings/page.tsx`가 푸시 알림 1개만 | **A** | PR7 Task 7.4에 흡수. 5-블록 카드 리스트(ProfileCard·MyChallengesCard·NotificationCard·LegalLinks·LogoutButton) + 신규 read `fetchMyChallengeCounts`. PR7 작업 시 PO 캡처 컨펌 |
| 62 | `/me/challenges` (옛 §12) | 모킹업 §12 "챌린지 관리" (라인 1108~1164) | 미존재 | **A** | PR7 Task 7.3 + 7.4 통합 — `/me/challenges` 경로로 colocate |
| 63 | `signOut` server action | `/me`의 로그아웃 액션 | 미존재 (auth는 매직링크 전용, signOut 호출 위치 없음) | **A** | PR7 Task 7.4 Step 1. `(app)/me/_actions.ts`에 supabase.auth.signOut + redirect("/login") |
| 64 | `fetchMyChallengeCounts` read 함수 | `/me`의 운영중/참여중 카운트 | 미존재 (`fetchCurrentChallenges`는 그룹 단위) | **A** | PR7 Task 7.4 Step 8. owner_id 필터 + challenge_members join. RLS는 자동 |
| 65 | `/legal/terms` · `/legal/privacy` 페이지 | 모킹업 §1-A 라인 397 "이용약관 · 개인정보처리방침" 링크만 | 미존재 | **B** | LegalLinks 컴포넌트는 PR7에 들어가지만 실제 약관 본문 페이지는 dogfood 사용자에게 외부 Notion 또는 임시 페이지로 대응 가능 — 별도 plan |
| 66 | `ChallengeTabs` 탭 셸 (3-탭 컨테이너) | §6/§8/§9 모든 challenge 상세에 동일 탭 마크업 | 미존재 | **A** | PR5 Task 5.2 Step 1 — 디자인 시스템 기반 코드 명시됨 |
| 67 | `FeedTab` · `DashboardTab` · `InfoTab` 탭 본문 분리 | §8-A·§8-B·§9-B 세 탭의 본문 | 단일 페이지 인라인 | **A** | PR5 셸 + placeholder → PR6 피드/현황판 본문 → PR7 정보 탭 본문 |
| 68 | `ChallengeOwnerMenu` ⋯ 액션 시트 | §6/§8/§9 상단 ⋯ (라인 766·853·880·915·938) | 미존재 | **A** | shadcn DropdownMenu — 운영자만 노출. PR5 또는 PR7에 분산 |
| 69 | `GroupSwitcherSheet` — AppHeader chevron-down | §2 헤더 좌측 그룹 셀렉터 chevron-down | 미존재 | **A** | PR2 stub (단순 `/group/[id]` 이동) + PR7 본문 (다중 그룹 sheet) |
| 70 | `GroupAccountCard` — 계좌 lazy 입력 | 모킹업에 명시 없음, ADR-0003 lazy 입력 정책 | 미존재 | **A** | PR7 Task 7.1 Step 2 — 디자인 시스템 기반 코드 명시됨. 미설정/설정됨 두 상태 |
| 71 | `ChallengeLimitChart` — 5-슬롯 게이지 | §12-B 라인 1153 `.seg` | 미존재 | **A** | PR7 Task 7.3 Step 3 — 디자인 시스템 기반 코드 명시됨. enforce는 백로그 #5 결정 종속 |
| 72 | `DaySlider` — 1~30 day 슬라이드 카운터 | §10-B 라인 1005~1009 | 미존재 | **A** | PR6 Task 6.2 Step 4 — 디자인 시스템 기반 + 모션 토큰 적용. "무한 루프 vs 마운트당 1회" PO 확인 필요 |
| 73 | `ActionResultDialog` — 4-variant 모달 | §10-B/C/D 결과 모달 3종 + §10-A AI 일기 | 미존재 | **A** | PR6 Task 6.2 Step 3 — variant prop으로 분기 |
| 74 | §11 "결과 공유" · "정산 요청" 버튼 동작 | §11-A 라인 1075~1078 | recap 페이지에 액션 버튼 없음 | **A (결과공유) + C (정산요청)** | PR7 Task 7.2 Step 4 — Web Share API + Clipboard fallback (결과공유) / disabled placeholder + toast (정산요청, 백로그 #38) |
| 75 | "균등 분할 정산" 안내 카피 (모킹업 §3 메모) | §3 메모 "균등 분할" | 미존재 | **A** | PR5 Task 5.1 Step 6 — Card tone="muted" + 작은 텍스트 |
| 76 | §6-A "다음 단계에서 운영자가 작성한 서약서..." 안내 (라인 785~787) | §6-A 라인 785 | 미존재 | **A** | PR5 Task 5.2 Step 5 — destructive/10 bg Card |
| 77 | §10-A diary-bot 챗봇 안내 (라인 980~982) | §10-A diary-bot 마크업 | 미존재 | **A** | PR6 Task 6.2 Step 2b — brand-primary-soft bg + 🤖 emoji + 2줄 안내 |
| 78 | 사진 입력 dual entry (Fab 카메라 + 라이브러리 텍스트 링크) | 모킹업은 사진 업로드 후 상태만 표시 (§10-A 라인 978 "user_upload.jpg") — 진입점 UI 미상 | 단일 `<input capture="environment">` 으로 OS 시트 위임 | **A** | PR6 Task 6.2 Step 2a — Fab(카메라) + 텍스트 링크(라이브러리) + 2개 hidden input. Q12 grill 결정 잠금. 기술 이슈 검증 완료 (EXIF·HEIC·권한·크기 모두 처리됨) |
| 79 | `EndDatePicker` — 종료일 캘린더 선택 + 최소 1주 | §3-A 라인 564~573 pill grid + calendar 아이콘 | 미존재 (기존 `DurationPicker` 는 number input만) | **A** | PR5 Task 5.1 Step 4 — react-day-picker 도입 + Card primitive 재사용. Q13 grill 결정 잠금. ADR-0004 + spec 동반 |
| 80 | **Wizard step 2 (§3-C 서약서 + 운영자 자가 서명)** | §3-C 라인 634~654 — "서약서 작성 2/2" | plan에 단순 "2-step state" 만 명시, 본문 없었음 | **A** | PR5 Task 5.1 Step 7b 추가. `PledgePreviewCard` + `PledgeSigningCanvas` 디자인 시스템 컴포넌트 신설. `createChallenge` Server Action 이 운영자 자가 서명 동시 처리 |
| 81 | **Wizard step 3 (§3-D 생성 완료 + 초대 링크)** | §3-D 라인 657~673 — 🎉 + 초대 링크 + 카카오 공유 | plan에 매핑 없음 (챌린지 상세로 직접 redirect 가정) | **A** | PR5 Task 5.1 Step 7c 신설. `CreationCompleteSheet` 디자인 시스템 컴포넌트. Web Share API + Clipboard fallback (Q11 #44) |
| 82 | `PledgePreviewCard` 재사용 컴포넌트 (운영자 wizard + 멤버 pledge + 정보 탭) | §3-C + §6-B + §9-B 세 위치 동일 마크업 | 미존재 | **A** | PR5 Task 5.1 Step 7b 신설. 3 위치 사용으로 Q3 hybrid 룰 → `src/components/ui/` 승격 PR5 후반 평가 |
| 83 | `PledgeSigningCanvas` 재사용 (운영자 + 멤버) | §3-C sign-area + §6-B sign-area | 미존재 | **A** | PR5 Task 5.1 Step 7b 신설. Canvas + Pointer Events API. DPR-safe sizing, 모바일 touch-action 처리 |
| 84 | KST timezone 명시 (T3 기술 점검) | 모킹업 미명시, PRD §6.3 AC-5 Quiet Hours 만 KST | EndDatePicker 클라이언트 `new Date()` device timezone 의존 | **A** | EndDatePicker helper 카피 + PR5 검증에 timezone 시나리오 추가. dogfood 한국 가정으로 충분, v1 에서 `date-fns-tz` 도입 검토 |
| 85 | 기술 점검 체크리스트 (T1~T5) | — | plan 검증 섹션에 산발적 | **A** | PR1 Task 1.10 (T1·T2 사전) · PR5 Task 5.8 (T2·T3) · PR6 Task 6.3 (T4) · PR7 Task 7.6 (T5) 명시. dogfood 직전 회귀 게이트 |
| 86 | PRD §4.3 AC-3 사진 크기 갱신 (C5) | 모킹업 무관 — PRD stale | PRD: 10MB → 1MB / 실제 코드: 5MB → 1920px clamp + q 0.85 | **A** | PR8 Task 8.1 §4 갱신 명시. PRD 후행 cleanup |
| 87 | F1 wizard step 3 back 처리 | 모킹업 §3-D | plan: history.replaceState(`/challenge/[id]/created`) | **A** | PR5 Task 5.1 Step 7c 인접 — wizard 갇힘 방지 |
| 88 | F2 온보딩 트리거·종료 destination | §1-C/D/E/F | plan: localStorage `withkey:onboarded` flag + 종료 시 /home | **A** | PR3 Task 3.2 Step 4 |
| 89 | F3 온보딩 CTA 색상 | 모킹업 라인 441 `opacity:.6` | plan: 1~3 다음 opacity-60 / 마지막 시작하기 opacity-100 | **A** | PR3 Task 3.2 Step 5 |
| 90 | F4 invite token cookie 보존 + magic link callback | PRD §3.3 AC-3 | plan: cookie maxAge 72h + auth/callback 분기 | **A** | PR3 Task 3.3 Step 3 |
| 91 | F5 §5-A 이모지 제거 | 모킹업 라인 738 | plan: 카피만 변경 | **A** | PR3 Task 3.3 Step 4 |
| 92 | F6 pledge active 분기 카피 (JustJoinedBanner) | PRD §3.3 AC-5 | plan: activated boolean prop + Stamp tone 분기 | **A** | PR5 Task 5.4 Step 1·2 |
| 93 | F7·F8 결과 모달 CTA destination | §10-B/C/D | plan: router.replace + ChallengeTabs query param sync | **A** | PR6 Task 6.2 Step 5 |
| 94 | F9 사진 picker 취소 처리 | 모킹업 미명시 | plan: handleFile(null) → clearPhoto 빈 상태 유지 | **A** | PR6 Task 6.2 Step 2a |
| 95 | F10 등록 실패 시 draft localStorage 보존 | PRD §4.4 1시간 보관 | plan: `withkey:action-draft:<id>` + 1h TTL | **A** | PR6 Task 6.2 Step 5 |
| 96 | F11 AI reroll 5회 초과 helper | 모킹업 메모 "남은 횟수 텍스트 제거" | plan: 5회 도달 시 disabled + 한 줄 helper | **A** | PR6 Task 6.2 Step 5 |
| 97 | F12 SW notificationclick 핸들러 | 모킹업 미명시 (PWA 표준) | plan: clients.openWindow + 기존 탭 navigate | **A** | PR7 Task 7.5 Step 3b |
| 98 | F13 알림 카드 클릭 navigate + markRead | 모킹업 §13 | plan: NotificationItem 컴포넌트 + Link + onClick markRead | **A** | PR7 Task 7.5 Step 5 |
| 99 | F14 푸시 targetUrl 표 | 모킹업 §13 | plan: type별 destination 5종 + buildTargetUrl 헬퍼 | **A** | PR7 Task 7.5 Step 2b |
| 100 | F15 그룹 수 ≤ 1 chevron 처리 | 모킹업 §2 | plan: multipleGroups prop + AppHeader 분기 | **A** | PR7 Task 7.1 Step 3 |
| 101 | F17 챌린지 종료 시각 표시 + recap CTA | 모킹업 §11 | plan: ChallengeEndedBanner + lazy derived status | **A** | PR7 Task 7.1b 신설 |
| 102 | F20 /me/challenges 빈 상태 | 모킹업 미명시 | plan: totalAny === 0 시 EmptyState + 챌린지 만들기 CTA | **A** | PR7 Task 7.3 Step 1 |
| 103 | F16 activeGroupId 세션 저장 | 모킹업 미명시 | 미적용 — POC 후 v1 검토 | **B** | dogfood에서 다중 그룹 사용자 미발생 시 보류. cookie 또는 localStorage `withkey:active-group` |
| 104 | F18 챌린지 종료 푸시 | 모킹업 미명시 | 미적용 — POC 후 결정 | **B** | PRD §6 신규 type `challenge_ended` 추가 검토. PR8 PO 확인 |
| 105 | F19 로그아웃 시 IDB notifications 정리 | 모킹업 미명시 | 미적용 — 유지가 기본 | **B** | 단일 디바이스 단일 사용자 가정. 회사·공용 기기 등 우려 시 검토 |
| 106 | G1 ChallengeOwnerMenu ⋯ 메뉴 본문 + endChallenge/deleteChallenge 액션 + destination | §6/§8/§9 상단 ⋯ | plan: PR7 Task 7.1a — DropdownMenu·ConfirmDialog·재사용 + 종료 후 recap, 삭제 후 /me/challenges | **A** | ConfirmDialog `src/components/ui/` 승격 — `/me/challenges` 와 ⋯ 메뉴 둘 다 사용 |
| 107 | G2 `AccountInputSheet` 본문 — 계좌 lazy 입력 sheet | 모킹업 미상 | plan: PR7 Task 7.1 Step 2b — shadcn Dialog + AES-256-GCM 암호화 위임 | **A** | `/group/[id]` + `/challenge/[id]/recap` 정산 prompt 두 곳 사용 |
| 108 | G3 챌린지 삭제 시 그룹 보존 정책 (PRD §3.4 정합) | PRD §3.4 "그룹장 이탈 → 그룹 해산" | plan: 챌린지만 CASCADE 삭제, 그룹 빈 채 유지. 그룹 자체 해산은 POC 후 | **A** | ADR-0003 자동 그룹과 정합. PR8 PRD §3.4 갱신 명시 |

### 카피 / 마이크로 텍스트 (코드 면밀 검토 추가)

| # | 항목 | 모킹업 카피 | 현 코드 카피 | 분류 |
|---|---|---|---|---|
| 49 | 홈 인사말 | "5월 14일 · 화요일 / 안녕, {name} 👋" | "오늘도 수고하셨어요" | **A** PR4 |
| 50 | 챌린지 생성 제목 | "어떤 약속을 만들어 볼까요?" | "새로운 서약서 만들기" | **A** PR5 |
| 51 | 챌린지 생성 부제 | "운동이 아닌 다른 습관도 OK" | 없음 | **A** PR5 |
| 52 | 챌린지 입력 라벨 | "챌린지 이름" / "진행 기간" / "인증 빈도" / "1회 실패 벌금" | "서약서 제목" / "주 목표 횟수" / DurationPicker / PenaltyPicker | **A** PR5 — IA 일부 변경 ("주 목표 횟수" → "인증 빈도" stepper) |
| 53 | 빈 챌린지 카피 | "아직 진행 중인 챌린지가 없어요 / 친구들과 함께 첫 챌린지를 만들어보세요" | "현재 진행 중인 챌린지가 없어요. 챌린지가 시작되면 인증 피드가 여기에 모입니다." | **A** PR4 |
| 54 | 인증 실패 카피 풀세트 | "오늘 인증 실패 / 5월 13일 인증 마감을 놓쳤어요 / 벌금 추가 +5,000원 / 누적 벌금 5,000원" | 미존재 | **A** PR6 — 35번과 함께 |
| 55 | 챌린지 종료 카피 | "챌린지가 종료되었어요! / 30일 헬스장 출석 · 5/14 ~ 6/12" | "주간 정산 / 아직 끝난 챌린지가 없어요" | **A** PR7 |

### PRD / 코드 vs 모킹업 충돌 (PR8 cleanup 필수)

| # | 항목 | PRD/현 코드 | 모킹업 | 분류 | 비고 |
|---|---|---|---|---|---|
| 56 | "주 N회" vs "매일 N회/주 N번" | `challengeInputSchema.goalCount` (1~7, "주 목표 횟수") | "인증 빈도 — 매일/주 7번" stepper | **C** | 의미 충돌. (a) PRD 모델 유지 + UX만 매핑 (b) frequency type 추가 = spec + migration. PR5 PO 확인 |
| 57 | 기간 옵션 | `durationDays` 1~90 | §3-A 7일/14일/30일 pill + 커스텀 "최대 3개월" | **A** | 일치 (90일=3개월). UX만 pill grid로 |
| 58 | 벌금 옵션 | `penaltyAmount` 1000~10000 (1000원 단위) | §3-A "없음 / 3천원 / 5천원 / 만원" 4 pill | **C** | "없음(0원)"이 코드 검증 min=1000과 충돌. (a) 시각 더미 (b) nullable validators 변경 = spec-required. PR5 PO 확인 |
| 59 | 챌린지 상태 매핑 | `pending|accepted|active|closed` | D-N 시간 표현만, 상태명 미명시 | **A** | 상태는 코드 유지, UX는 D-N + 시각 분기 |
| 60 | 키워드 풀 vs AI 일기 흐름 | PRD §4.6 키워드 풀 freeze. `ACTIVITY_TYPES` 4개 | §10-A에 키워드 칩 미노출 — AI 일기 텍스트만 | **A** | 키워드 선택 화면은 §10 이전. 모킹업 누락이거나 §10이 결과만. PR6 확인 |

---

### PO 결정 5개 잠금 완료 (2026-05-14 grill round)

PR1 착수 전 grill round로 처리. 결과:

| # | 결정 | 채택 옵션 | 영향 |
|---|---|---|---|
| #31 | 그룹 UX 노출 | **(A) 자동 그룹 + 명시 UI 폐기** | ADR-0003 (PR0-B) · `/group/new` 폐기 (PR5) · `/group/[id]` 신설 (PR7) · 계좌 lazy 입력 |
| #29 + BottomNav | `/feed` 운명 + 네비 모델 | **(A) BottomNav 폐기 + 모든 라우트 challenge sub-route화** | PR2 재정의, `/feed`·`/action`·`/pledge`·`/recap` 폐기 → `/challenge/[id]/{...}` sub-route, `/me` 신설 |
| #36+#40 | 솔로 챌린지 | **(B) 허용 유지 + 카피 톤다운** | 데이터 모델 무손상, PR5에서 솔로/멀티 카피 분기 |
| #56 | 인증 빈도 모델 | **(A) Validators 무변경 + UX stepper + `goalCountLabel` 헬퍼** | PR5 Task 5.1 `FrequencyStepper` + `src/lib/challenge/frequency.ts` |
| #58 | 벌금 "없음(0원)" | **(A) Validators 변경 `min(0)` + spec + migration check** | PR5 Task 5.1 Step 5b — `src/lib/validators/challenge.ts` spec, `0024_challenge_penalty_allow_zero.sql` migration (필요 시) |

### 분류 재요약 (108 항목 — 최종 유저 플로우 점검 반영)

- **A (이 plan에 흡수, 94건)**: 기존 항목 + Q6~Q13 결정 잠금 + 재검토 추가 (#79~#86) + 유저 플로우 patch (#87~#102) + 최종 점검 (#106·#107·#108)
- **B (다음 plan으로, 8건)**: 14·21·48·65 + POC 후 (A) notifications 테이블 확장 + 103(activeGroupId)·104(종료 푸시)·105(IDB 정리)
- **C (PO 결정 여전히 필요, 0건)** — 모든 결정 잠금 완료
- **PRD 갱신 필수 (PR8 Task 8.1·8.3)**:
  - §3.3 AC-1 기간·벌금 갱신 (Q13)
  - §3.4 솔로 정식 모드 — 이미 명시됨
  - §4.3 AC-3 사진 크기 (C5)
  - §6.2 알림 종류 2종 → 3+종 (Q6·Q7)
  - §6.3 AC-7 푸시 권한 모달 (B13)
  - §7.3 AC-1 Kudos 이모지 모킹업 매핑 주석 (B11)
  - §8.2 challenges.duration_days·penalty_amount 갱신 (B14·B15·Q13)
  - §9.1 이벤트 표 트리거 위치 (B16)
  - §10 화면 인벤토리 라우트 매핑 (B17)
  - §11.1 happy path 시나리오 라우트 (B18)

---

## Self-Review

**1. Spec coverage** — grill-me 결정 8개 매핑:
- [x] 전략 (A) → PR1~7 시퀀스
- [x] 토큰 (A) → Task 1.2
- [x] 컴포넌트 (C) hybrid → File Structure + Task 1.4~1.7
- [x] PR 슬라이싱 vertical + value-ordered → 9 PRs
- [x] 검증 manual + 토큰 단위 + PR 템플릿 → Task 1.3·1.9
- [x] SoT 모킹업 우선 → ADR-0002 (PR0)
- [x] 모션 (B) + reduced motion + 토큰 → Task 1.5 + globals.css
- [x] 상태 (γ) → Task 1.6
- [x] ADR 선행 + PRD 후행 → PR0 + PR8

**2. Placeholder scan** — TBD 없음. PR3~7의 "기존 코드 시각 교체"는 화면 코드를 읽고 모킹업과 매핑해야 구체화되므로, plan은 패턴·검증만 명시하고 구체 코드는 PR 작업 시점에 작성.

**3. Type consistency** — Card/Chip/Fab/Stamp/ShareCard props 시그니처 PR1 Task 1.4~1.7에서 정의, 이후 PR에서 동일 시그니처 사용.

**4. 가드레일 매핑**:
- `AGENTS.md §3`: 데이터 흐름 변경 없음 (Server Action 유지)
- `AGENTS.md §4 spec-required 경로`: 이 plan은 직접 건드리지 않음. PR6/PR7에서 분석 이벤트·키워드 풀·validators 영향 발생 시 spec 동반 분리 (Task 8.1, 그리고 백로그 §C 항목들)
- `AGENTS.md §6`: PR 단위 작은 배치, 외과적 수정

---

## 실행 핸드오프

**Plan saved to `docs/superpowers/plans/2026-05-14-ui-revision.md`.**

두 가지 실행 옵션:

1. **Subagent-Driven (recommended)** — 매 task마다 fresh subagent dispatch, task 사이 review. PR0(ADR)·PR1(foundation) 먼저 실행하고 머지된 결과 보고 이후 진행.
2. **Inline Execution** — 현 세션에서 executing-plans skill, checkpoint마다 사용자 review.

**제 추천: Subagent-Driven**. dogfood 일정 압박 + 9 PR 명확히 분리됨 + 매 PR 끝에 PO review가 자연스러운 checkpoint.

다음 결정:
1. Subagent-Driven vs Inline
2. PR0(ADR) 지금 바로 시작 vs plan만 머지 후 별 세션
