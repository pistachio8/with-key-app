---
plan: 2026-05-22-challenge-revalidate-and-header-cleanup
title: Challenge Revalidate And Header Cleanup
author: pistachio8
date: 2026-05-22
status: draft
---

## 목표

두 가지 사용자 보고 이슈 해소.

1. `/challenge/new` 진입 시 AppHeader 아래에 폼 내부 헤더(← · "새 챌린지" · `1/2`)가 한 줄 더 보여 chrome 이 중첩되어 보이는 문제 — wizard task flow 라는 라우트 성격에 맞춰 AppHeader 를 이 라우트에서 떼어낸다. 폼 내부 헤더(← · step indicator)는 유지하여 step 2 → step 1 회귀 경로를 보존.
2. 새 챌린지를 만든 뒤 "혼자 시작하기"(또는 종료·삭제·탈퇴)를 누르면 화면이 갱신되지 않고 새로고침해야 active 상태가 반영되는 문제 — `challenge/[id]/_actions.ts` 의 4개 write 액션이 `revalidatePath` 를 호출하지 않아 Router Cache 가 stale 인 것이 원인. PR #77 (`fix/group-list-revalidate-and-challenge-guard`) 가 createChallenge·createGroup 계열에 도입한 패턴과 동일하게 정렬.

## 영향 범위

- 변경 경로:
  - `src/app/(app)/challenge/new/**` → `src/app/(flow)/challenge/new/**` (route group 이동)
  - 신규 `src/app/(flow)/layout.tsx` (AppHeader 없는 wizard 컨테이너)
  - `src/components/pledge/{pledge-preview-card,pledge-signing-canvas}.tsx` (공용 추출)
  - `src/app/(app)/challenge/[id]/_actions.ts` (4개 액션에 `revalidatePath`)
  - `src/app/(app)/challenge/[id]/_actions.spec.ts` (`next/cache` mock 추가)
  - 3개 caller import path 갱신 — `(flow)/challenge/new/_components/new-challenge-form.tsx`, `(app)/challenge/[id]/pledge/_components/pledge-sheet.tsx`, `(app)/challenge/[id]/_components/info-tab.tsx`
- 데이터/RLS 영향: 없음
- 외부 서비스: 없음
- 재사용 후보: `src/components/pledge/` (이미 3개 caller 가 새로 참조)

## 작업 단계

1. pledge 공용 컴포넌트 추출 — `src/components/pledge/pledge-preview-card.tsx` · `src/components/pledge/pledge-signing-canvas.tsx` 로 `git mv`. 검증: `grep` 으로 caller 3곳 import 갱신 완료 확인.
2. 라우트 그룹 이동 — `src/app/(app)/challenge/new/` 전체를 `src/app/(flow)/challenge/new/` 로 `git mv`. 검증: `find src/app/(flow)/challenge/new -type f` 로 page · \_actions · \_components 모두 이동 확인.
3. `(flow)/layout.tsx` 신규 — `bg-background mx-auto flex min-h-svh w-full max-w-screen-sm flex-col` 컨테이너 + `<main id="main" className="flex-1">` 만. AppHeader 없음. 인증은 page.tsx 의 `requireUser()` 에 위임. 검증: 빌드 통과.
4. `challenge/[id]/_actions.ts` 4개 액션에 `revalidatePath('/', 'layout')` 추가 — `startChallengeWithSignedParticipants` · `endChallenge` · `deleteChallenge` · `leaveChallenge`. PR #77 의 createChallenge 와 동일하게 `return success` 직전에 호출. 검증: `pnpm test src/app/\(app\)/challenge/\[id\]/_actions.spec.ts`.
5. 위 spec 파일에 `vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));` 추가 — 기존 테스트가 import 변화로 깨지지 않게.
6. 전체 검증 — `pnpm typecheck && pnpm lint && pnpm test`.

## 검증

```bash
pnpm typecheck
pnpm lint
pnpm test
```

수동 확인 항목:

- [ ] 모바일 viewport 에서 `/challenge/new` 진입 — AppHeader 없이 폼 내부 헤더만 보임
- [ ] step 1 → step 2 → step 1 (← 버튼) 회귀 정상
- [ ] step 1 에서 edge swipe back — 호출자(`/home` 등)로 정상 이탈
- [ ] 새 챌린지 생성 → "혼자 시작하기" 클릭 → 새로고침 없이 active 상태 반영
- [ ] 종료·삭제·탈퇴 도 동일하게 새로고침 없이 반영

## 리스크 / 미해결

- `toggleKudos` · `markActionStarted` 도 `revalidatePath` 가 없으나 본 PR 범위에서 제외 — 사용자 인터랙션 빈도가 높아 광범위 revalidate 의 cost 가 다른 4개와 다름. 별도 PR 에서 검토.
- (app)/layout 의 `fetchOwnerGroupsForChallengeForm` 와 `/challenge/new` page.tsx 의 동일 호출이 라우트 그룹 분리로 자동 해소되어 소폭 perf 개선 — 의도된 부수 효과.
- pledge 컴포넌트의 spec 파일은 없음 (검색으로 확인). 신규 추가 안 함.
