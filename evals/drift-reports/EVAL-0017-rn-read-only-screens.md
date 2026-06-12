# Drift Report — EVAL-0017 Home + challenge read-only screens

- Task: **EVAL-0017** (Track: port · Kind: migration)
- Branch: `feat/rn-read-only-screens`
- Date: 2026-06-12
- Trigger: G8 — 홈·챌린지 feed/dashboard/info 가 실 Supabase 데이터로 렌더되는 첫 read-only 화면 세트. EVAL-0016 계약(@withkey/domain read-contracts + features/\*/api read service)을 소비하는 화면·컴포넌트 레이어가 처음 생겼다.

## Harness Impact Questions — 답변

1. **New folder structure? YES** — 04 §5.1 이 예고한 슬롯의 lazy 첫 사용:
   - `apps/mobile/src/features/challenge/components/` (`home-overview` · `challenge-scaffold` · `member-progress-list`)
   - `apps/mobile/src/features/feed/components/` (`feed-card`)
   - `apps/mobile/src/shared/hooks/` (`use-async-read`) · `apps/mobile/src/shared/theme/` (`colors` — mobile 토큰 최소셋)
   - `features/challenge/index.ts` · `features/feed/index.ts` 공개 API barrel 도입(기존 auth/invite 패턴 동일).
2. **New naming convention? YES(경미)** — 화면 단위 spec 파일명에 `read-only` 를 포함(`*.read-only.spec.tsx`, `read-only-screens.spec.tsx`)해 task 의 `pnpm --filter @withkey/mobile test -- read-only` 필터와 정렬. 후속 화면 task(EVAL-0018+)도 같은 필터 가능한 이름을 권장.
3. **New dependency? NO** — TanStack Query 는 spec 미확정(03 §0.3 권장→spec)이라 도입하지 않고 `shared/hooks/use-async-read.ts` 최소 훅으로 대체. spec 확정 시 keys.ts factory 와 함께 교체 예정(코드에 "결정 필요" 주석).
4. **Verification commands changed? NO(단 주의 1건)** — task 의 명령 그대로 green. 단 `jest read-only` 의 testPathPattern 은 **절대 경로 전체**에 매칭되므로, worktree 디렉토리명이 `*-read-only-*` 인 환경에서는 전 suite 가 매칭된다(이번 실행은 의도 집합의 superset — 15/15 suite green 이라 결과 동일). 일반 체크아웃에서는 read-only spec 3개만 선별된다.
5. **Harness outdated? NO** — mobile smoke(iOS/Android 실기기)는 여전히 manual/dev-build 핸드오프 항목. Maestro 등 자동화는 미도입(00 §8 G8 완료 조건에 불요).
6. **`.agents/` update? NO** — workflow 절차 변경 없음. 본 리포트는 evals/ 인스턴스 기록.

## 구현 노트 (후속 task 참조)

- **dashboard 주차 칩·링 미포팅**: web dashboard-tab 의 `buildWeekChips`/`currentWeekStatus` 는 viewer `doneByWeek`(서버 전용 `ReadonlyMap`, ADR-0037 §2 에서 RN 계약 제외)가 입력이라 read-only 범위에서 제외. AC(doneCount/goalCount/기간/penalty)는 `ChallengeDetailView` 로 충족. 주차 시각화가 필요해지면 계약 확장(직렬화 가능한 `doneByWeek: Record<number, number>` 등) 별도 결정 필요.
- **feed kudos 는 카운트 표시 전용** — toggle 은 mutation(EVAL-0018+). 정산 계좌도 마스킹 표시 전용(평문 reveal 은 BFF 단일 경로, D-016).
- **로그아웃 진입점 이전**: 홈 placeholder(EVAL-0012 로그인 확인 화면)가 실데이터 화면으로 교체되면서 signOut 버튼을 `/me` 로 이전 — login→logout 수동 검증 플로우 보존.
