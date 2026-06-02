---
plan: 2026-05-26-challenge-verification-count-per-day
title: Challenge Verification Count Per Day
author: pistachio8
date: 2026-05-26
status: draft
---

## 목표

챌린지 인증 카운트를 "피드 1행당 +1"에서 "**KST 자정 기준 distinct day count**"로 정정한다. 사용자는 하루에 피드를 여러 개 등록할 수 있되, 인증 횟수는 하루 1회로만 계산된다. 결과적으로 saung3754의 카운트가 다음 렌더부터 자동 정합화된다 (별도 데이터 패치 없음).

## 결정 요약 (grill-me 합의)

| #           | 결정                                                                                                    |
| ----------- | ------------------------------------------------------------------------------------------------------- |
| 기준 시각   | KST 자정 캘린더 일자 (`current-challenges.ts:108`의 기존 `verifiedToday` 정의와 일치)                   |
| 데이터 처리 | `action_logs` 행은 그대로 유지. 같은 날 중복 피드 삭제 X — 사용자 의도 "피드는 여러 개 OK"              |
| 구현 위치   | 공용 TS 헬퍼 1개(`src/lib/challenge/done-days.ts`) + 4곳 reads에서 호출. SQL VIEW / RPC 안 씀           |
| 소급 적용   | `closed` 챌린지 recap도 새 규칙으로 즉시 표시 (POC 단계, 영구 분기 회피)                                |
| UX          | `action` 페이지에 "오늘 이미 인증 — 추가 피드는 카운트되지 않음" 배너 1줄                               |
| Analytics   | `action_logged` contract 변경 없음. distinct-day는 downstream에서 derive                                |
| 테스트      | 헬퍼 unit spec 신규 + 기존 4 reads spec에 회귀 케이스 1개씩                                             |
| KST 키 산출 | `Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" })` — Temporal은 의존성 부담 대비 이득 작아 보류 |

## 영향 범위

- 변경 경로:
  - 신규: `src/lib/challenge/done-days.ts`, `src/lib/challenge/done-days.spec.ts`
  - 수정: `src/lib/db/reads/recap.ts` · `src/lib/db/reads/active-challenge.ts` · `src/lib/db/reads/current-challenges.ts` · `src/lib/db/reads/challenge-detail.ts`
  - 수정(UX): `src/app/(app)/challenge/[id]/action/page.tsx` 또는 `_components/action-form.tsx` — 배너 prop 추가
  - 회귀 케이스 추가: 위 4 reads 파일의 기존 spec (존재 시)
- 데이터/RLS 영향: 없음 (마이그레이션 0, RLS 변경 0, `action_logs` 데이터 무손실)
- 외부 서비스: 없음
- 재사용 후보: `current-challenges.ts`의 KST 자정 산출 로직 → 신규 헬퍼로 점진적 치환 (본 PR에서는 동작 동일성만 확보)
- spec-required 매핑: 어느 spec-required 경로에도 해당 없음 → spec/ADR 의무 없음. PR 본문에 "왜"만 명확히

## 작업 단계

1. 브랜치 분리 — `git checkout -b fix/challenge-verification-count-per-day` (베이스 `develop`)
   - 검증: `git status` 깔끔, base가 `develop` 최신
2. 헬퍼 `src/lib/challenge/done-days.ts` 작성
   - export `toKstDayKey(iso: string): string` (`Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" })` 기반)
   - export `countDoneDaysByUser(logs: ReadonlyArray<{ user_id: string; created_at: string }>): Map<string, number>`
   - 검증: 타입 inference OK, 컴파일 통과
3. 헬퍼 unit spec `done-days.spec.ts` 작성 (vitest)
   - 같은 날 N개 → 1
   - 다른 사용자 같은 날 → 각자 1
   - KST 자정 경계: `2026-05-26T14:59:59Z`(KST 23:59) vs `2026-05-26T15:00:00Z`(KST 00:00) → 다른 날 분류
   - 빈 입력 → 빈 Map
   - 검증: `pnpm vitest src/lib/challenge/done-days.spec.ts` 통과
4. `recap.ts` 수정 — `SELECT user_id, created_at` → 헬퍼로 집계
   - 검증: 기존 spec에 "같은 날 2개 피드 → doneCount=1" 케이스 추가 후 통과
5. `active-challenge.ts` 수정 — `count: exact, head: true` 제거 → user_id+created_at 로드 후 헬퍼
   - 검증: 회귀 케이스 추가 후 spec 통과
6. `current-challenges.ts` 수정 — `doneByChallenge` 채우는 루프를 헬퍼 결과로 교체. `verifiedToday`는 그대로 두되 가능하면 헬퍼 결과(`Map`에 viewerId 키가 있는지)로 derive 검토
   - 검증: 기존 동작 변화 없음 + 회귀 케이스 추가
7. `challenge-detail.ts` 수정 — `counts` Map 계산을 헬퍼로 위임
   - 검증: 회귀 케이스 추가
8. `action` 페이지 배너 추가
   - `verifiedToday` 신호를 page.tsx에서 read하여 form에 prop으로 전달
   - 카피: "오늘 이미 인증했어요. 추가로 올리는 피드는 기록되지만 인증 횟수는 늘지 않아요."
   - 검증: 모바일 viewport에서 노출/비노출 토글 확인
9. `pnpm typecheck && pnpm lint && pnpm test` — 전체 통과
10. 수동 검증 — saung3754 (또는 dogfood 계정) 챌린지 상세/홈/recap에서 카운트가 새 규칙으로 보이는지

## 검증

```bash
pnpm typecheck
pnpm lint
pnpm test
```

수동 확인 항목:

- [ ] 모바일 viewport — 챌린지 상세, 홈 카드, recap에서 doneCount가 distinct-day로 표시
- [ ] saung3754(또는 dogfood 계정)으로 새 규칙대로 카운트 노출 확인
- [ ] 같은 날 2번째 인증 시도 → action 페이지 상단 배너 노출
- [ ] closed 챌린지 recap 새 규칙 적용 확인 (영향받는 케이스 존재 시)

## 리스크 / 미해결

- **closed 챌린지 recap 소급 변경**: 이미 종료된 챌린지에서 같은 날 다회 피드를 올렸던 사용자는 doneCount가 줄어 달성/MVP/perHeadPenalty 표시가 바뀐다. 실제 송금/계좌 데이터는 영향 없음. POC dogfood 단계라 수용 가능.
- **TZ 회귀**: 한국은 DST 없어 안전. 단위테스트의 KST 자정 경계 케이스로 1차 방어.
- **헬퍼 SoT 이중화 가능성**: `current-challenges.ts:108-113`이 여전히 자체 KST 산출 로직을 가지면 SoT가 2곳이 된다. 본 PR에서 헬퍼로 통일하거나, 후속 PR로 분리 (현재 계획은 본 PR에서 가볍게 시도).
- **PROJECT_LOG**: `Decisions & Trade-offs` 카테고리에 "인증 카운트 distinct-by-day 정정" 항목 추가 (구현 단계 종료 시).
