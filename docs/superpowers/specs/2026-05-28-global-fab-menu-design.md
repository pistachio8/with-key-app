---
spec: 2026-05-28-global-fab-menu
title: 글로벌 플로팅 메뉴(speed-dial FAB) — 홈·사진 인증·그룹
author: pistachio8
date: 2026-05-28
status: draft
---

## Summary

챌린지 탭에만 있던 카메라 "인증하기" FAB(Floating Action Button)를 **(app) 로그인 후 전 화면에 뜨는 글로벌 speed-dial 메뉴**로 승격한다. 하단 중앙의 단일 FAB(닫힘=카메라 아이콘)를 탭하면 위쪽 부채꼴로 3개 자식 버튼(**홈 · 사진 인증 · 그룹**)이 spring 애니메이션으로 펼쳐지고, 메인 아이콘은 X로 모핑된다.

"사진 인증"은 **컨텍스트 인식** 동작이다 — 챌린지 화면 안이면 그 챌린지로, 밖이면 내 진행 중(active) 챌린지 수에 따라 직행/선택 시트/안내 토스트로 분기한다. 그룹 버튼은 기존 헤더의 그룹 스위처 기능을 그대로 이어받고, 헤더 우측에서는 그룹 아이콘만 제거한다(알림벨·마이는 유지).

dogfood 멤버 요청으로 진행하는 **POC 범위 외 UX 개선**이다. Supabase 스키마·RLS·AnalyticsEvent 변경은 없다.

## Why

- dogfood 피드백: 사진 인증 진입이 "챌린지 화면까지 들어가야" 가능해 진입 마찰이 크다. 어느 화면에서든 한 번에 인증을 시작하고 싶다.
- 홈·그룹 전환도 화면마다 위치가 달라(로고=홈, 헤더 우측=그룹) 엄지 도달 범위(하단)에서 일관되게 접근하고 싶다.
- 기존 per-challenge `ActionFab`은 챌린지 탭 2곳에만 존재 → 전역화하면 중복 컴포넌트를 하나로 통합할 수 있다.
- 쓰기 동작이 아닌 navigation/sheet 트리거이므로 Server Action·RLS·스키마 영향 없이 클라이언트 레이어에서 완결된다(가드레일 안전).

## Impact Scope

### 변경 경로

- 신규:
  - `src/components/app-shell/fab-menu.tsx` — speed-dial FAB 본체(client)
  - `src/components/app-shell/fab-photo-verify-sheet.tsx` — active 2개+ 일 때 챌린지 선택 시트(client)
  - `src/lib/challenge/resolve-verify-target.ts` — "사진 인증" 타깃 결정 순수 함수 + 단위 테스트(`*.spec.ts`)
- 수정:
  - `src/app/(app)/layout.tsx` — active 챌린지 목록 fetch 후 `<FabMenu>` 렌더, `<main>` 하단 패딩 추가
  - `src/components/app-shell/app-header.tsx` — 우측에서 그룹 스위처(및 0그룹 `/group/new` 분기) 제거, 알림벨·마이만 유지
  - `src/app/(app)/challenge/[id]/(tabs)/page.tsx` · `.../(tabs)/dashboard/page.tsx` — `<ActionFab>` 사용 제거
- 삭제:
  - `src/app/(app)/challenge/[id]/_components/action-fab.tsx` — 글로벌 FAB로 대체되어 미사용

### src/ 영향

위 경로. `src/components/ui/fab.tsx`(Fab primitive)는 `action-form.tsx`의 "사진 찍기" 버튼에서 계속 사용하므로 유지.

### Supabase / RLS / migration 영향

없음.

### 외부 서비스

없음.

## Design

### 컴포넌트 분해

**C1. `FabMenu` (client) — `src/components/app-shell/fab-menu.tsx`**

- props:
  - `activeChallenges: ReadonlyArray<{ id: string; title: string; groupName: string | null }>` — 내 active 챌린지(서버에서 도출)
  - `groups`·`newGroupNamePreview` — 기존 `GroupSwitcherSheet` 재사용용(헤더가 받던 것과 동일 타입)
- 내부 상태: `open`(펼침 여부), `pickerOpen`(선택 시트), `groupSheetOpen`.
- 현재 챌린지 컨텍스트: `usePathname()`으로 `/challenge/[id]/...` 매칭 → `currentChallengeId`.
- 구조: 하단 중앙 고정 컨테이너 안에 scrim(딤) + 자식 3개 + 메인 토글 버튼.
  - 메인: 닫힘=`Camera`, 열림=`X`(lucide). 두 아이콘 `position:absolute; inset:0; margin:auto`로 버튼 정중앙에 겹쳐 두고 opacity+rotate+scale로 cross-fade 모핑. **왜**: grid 단일 트랙은 세로 중앙이 깨질 수 있어 inset+margin auto가 가장 견고.
  - 자식: 좌상=홈, 정상=사진 인증, 우상=그룹. 닫힘은 메인 위치에서 `scale(.4)`+`opacity:0`, 열림은 각 부채꼴 좌표(좌우 ±약 1.4rem 비율, 확정 배치)로 이동.

**C2. `FabPhotoVerifySheet` (client) — `src/components/app-shell/fab-photo-verify-sheet.tsx`**

- active 챌린지 2개 이상일 때 `FabMenu`가 여는 하단 시트. 기존 `src/components/ui/sheet.tsx` primitive 사용.
- 각 행: 챌린지 제목 + 메타(그룹명 등) + chevron. 탭 → `/challenge/{id}/action`로 이동.

**C3. `resolveVerifyTarget` (pure) — `src/lib/challenge/resolve-verify-target.ts`**

순수 함수로 분리해 단위 테스트 대상으로 삼는다. **왜**: 분기 로직이 UX의 핵심이라 컴포넌트와 독립 검증.

```ts
// src/lib/challenge/resolve-verify-target.ts
type ActiveChallenge = { id: string; title: string; groupName: string | null };
type VerifyTarget =
  | { kind: "navigate"; href: string } // 단일 타깃 직행
  | { kind: "picker" } // 선택 시트
  | { kind: "none" }; // 안내 토스트

export function resolveVerifyTarget(
  currentChallengeId: string | null,
  active: ReadonlyArray<ActiveChallenge>,
): VerifyTarget {
  // 1) 현재 챌린지가 내 active 목록에 있으면 그 챌린지로 직행
  if (currentChallengeId && active.some((c) => c.id === currentChallengeId)) {
    return { kind: "navigate", href: `/challenge/${currentChallengeId}/action` };
  }
  // 2) active 1개 → 직행
  if (active.length === 1) {
    return { kind: "navigate", href: `/challenge/${active[0].id}/action` };
  }
  // 3) active 2개+ → 선택 시트
  if (active.length >= 2) return { kind: "picker" };
  // 4) active 0개 → 토스트
  return { kind: "none" };
}
```

### 데이터 흐름

- `(app)/layout.tsx`(서버, 이미 `requireUser`·`fetchMyGroups` 호출 중)가 `fetchCurrentChallenges(user.id)`를 추가 호출하고 `status === "active" && userIsParticipant`만 필터해 `{id, title, groupName}[]`로 정규화 → `<FabMenu>`에 전달.
- 그룹 시트용 `groups`·`newGroupNamePreview`는 헤더가 이미 받던 값과 동일 — 같은 fetch 결과를 FabMenu에도 전달(중복 fetch 없음).
- 클라이언트 쓰기 경로 없음. 사진 인증/홈/그룹 모두 navigation 또는 sheet open. **왜**: Server Action 가드레일을 건드리지 않음.

### 동작 정의

- **홈** → `/home`로 이동(`next/link` 또는 `router.push`). 펼침 닫기.
- **그룹** → `groups.length >= 1`이면 `GroupSwitcherSheet` 열기, 0개면 `/group/new`로 이동. **왜**: 기존 헤더 그룹 스위처 동작 보존.
- **사진 인증** → `resolveVerifyTarget(currentChallengeId, activeChallenges)`:
  - `navigate` → 해당 href 이동
  - `picker` → `FabPhotoVerifySheet` 열기
  - `none` → `toast("진행 중인 챌린지가 없어요")`(sonner, 이미 전역 `<Toaster/>` 마운트됨)

### 노출 범위

- (app) 그룹 전체(홈·피드·챌린지 탭·그룹·마이·설정·알림 등).
- 예외: `/challenge/[id]/action`(사진 인증 작성 화면)에서는 숨김 — `usePathname`으로 분기. **왜**: 인증 작성 중에는 메뉴가 방해되고, 화면 자체에 "사진 찍기" Fab이 이미 있음.
- (auth)·(flow) 그룹에는 노출하지 않음(로그인/온보딩/챌린지 생성 흐름 방해 방지).

### 애니메이션 / 모션

- 토큰: `--motion-base`(200ms) 기반, 자식 펼침·시트 슬라이드는 spring 이징(`cubic-bezier(0.34,1.42,0.5,1)` 류, 약한 overshoot). stagger ~30/95/160ms.
- `prefers-reduced-motion: reduce`이면 transform 애니메이션을 생략하고 opacity만 즉시 전환. **왜**: globals.css의 기존 reduced-motion 정책과 일관, 멀미 유발 방지.
- 색/형태는 `2026-05-14-ui-revision-v3` 모킹업 팔레트 준수: 메인 FAB `primary(#8AA4FF)` + 흰 아이콘, 자식 흰 배경 + `primary-deep(#6F8DF5)` 아이콘, shadow `rgba(138,164,255,.45)` 계열. globals.css의 oklch 토큰(`--primary` 등)을 사용(하드코딩 금지).

### 접근성

- 메인 버튼: `aria-haspopup="menu"`·`aria-expanded`·`aria-label`(닫힘 "메뉴 열기" / 열림 "메뉴 닫기").
- 자식 버튼: 시각 라벨이 없으므로 `aria-label`(홈 / 사진 인증 / 그룹) 필수.
- 열림 시 첫 자식으로 포커스 이동, `Esc`·scrim 탭으로 닫고 포커스를 메인 버튼으로 복귀.
- z-index: 콘텐츠 위, shadcn Dialog/Sheet 오버레이 아래.

## Alternatives Considered

- **헤더 트리거 공유(B안)**: 헤더 그룹 스위처 상태를 FAB와 context로 공유. 배선이 늘고 POC 단순성 원칙에 어긋나 기각. FabMenu가 `GroupSwitcherSheet`를 직접 소유하는 편이 단순.
- **"사진 인증" 항상 선택 시트**: active 1개여도 시트를 띄워 일관성 확보. 다수 사용자가 단일 챌린지일 POC 단계에선 불필요한 1탭 추가라 기각(컨텍스트 인식 채택).
- **기존 per-challenge ActionFab과 공존**: 하단에 카메라 버튼이 2개 생길 수 있어 기각. 글로벌 FAB로 대체.
- **수직 스택 speed-dial**: Material 표준이나 사용자가 "iPhone 홈버튼 부채꼴"을 선호해 기각.

## Verification

### 명령

```bash
pnpm typecheck
pnpm lint
pnpm test
```

### 시나리오

- `resolveVerifyTarget` 단위:
  - 현재 챌린지가 active에 포함 → 그 챌린지 action href
  - active 0개 → none
  - active 1개(현재 챌린지 아님) → 그 1개 href
  - active 2개+ → picker
- 컴포넌트(RTL): 메인 탭 시 `aria-expanded` 토글·자식 3개 렌더(aria-label 확인), 그룹 0개일 때 `/group/new` 링크, scrim 탭 시 닫힘.
- 수동(모바일 viewport):
  - 홈·피드·그룹·마이에서 FAB 펼침/접힘, 홈/그룹/사진 인증 동작
  - active 0/1/2개 각 분기(토스트 / 직행 / 선택 시트)
  - `/challenge/[id]/action`에서 FAB 미노출
  - `prefers-reduced-motion`에서 애니메이션 생략
  - 헤더 우측에 그룹 아이콘 사라지고 알림벨·마이만 남음

## Rollout

- 단일 PR로 도입(브랜치 `feat/app-shell-global-fab-menu`, 베이스 `develop`). dogfood 멤버 요청 기반이므로 머지 후 즉시 dogfood에서 사용성 확인.
- 운영 후 재검토: 사진 인증 진입 마찰이 실제로 줄었는지 dogfood 피드백으로 확인. 필요 시 stagger·각도·토스트 카피 조정.

### 롤백

기능 추가형이라 해당 PR 1건 revert로 원복(헤더 그룹 스위처·per-challenge ActionFab 복귀). 스키마/데이터 변경이 없어 데이터 롤백 불필요.

## Out of scope

- 분석 이벤트(`fab_opened` 등) 추가 — AnalyticsEvent 유니온은 PRD §9.1과 1:1이고 PO 승인이 필요하므로 본 spec 범위 외.
- 알림벨·마이 페이지를 FAB로 이전 — 이번엔 그룹만 이동.
- (flow)·(auth) 화면 FAB 노출.
- 드래그로 FAB 위치 이동 같은 고급 인터랙션.

## 용어집

- **active 챌린지**: `status === "active"`이고 내가 참가자(`userIsParticipant`)인 챌린지.
- **FAB**: Floating Action Button — 화면 위에 떠 있는 둥근 액션 버튼.
- **RLS**: Row Level Security — Postgres 행 단위 접근 제어(본 변경 영향 없음).
- **speed-dial**: FAB를 탭하면 하위 액션 버튼들이 펼쳐지는 패턴.
- **스태거(stagger)**: 여러 요소를 약간씩 시차를 두고 순차 애니메이션하는 기법.
