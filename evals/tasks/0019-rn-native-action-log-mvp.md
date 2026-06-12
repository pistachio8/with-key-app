---
Task: EVAL-0019
Track: port
Kind: migration
Status: blocked
Blocked-by: [task:EVAL-0018] — G9 challenge lifecycle mutations complete 선행. 00 §13.4 D-7 submitActionLog BFF contract spec 은 미해소 시 추가 선행(조건부 — 토큰 제외, D-7 spec 착수 확정 시 spec 토큰 추가).
Parent: docs/PRD.md, docs/stories/2026-06-02-photo-verification-job-stories.md, docs/stories/2026-06-02-photo-verification-test-scenarios.md, docs/migration/00-rn-conversion-plan.md
---

# EVAL-0019: G10 Native action log MVP — photo upload + AI diary + feed reflection

> 00 §8 G10. 챌린지 생성·활성화 이후 핵심 인증 경로를 RN으로 포팅한다.

## Parent Links

[PRD §4·§5](../../docs/PRD.md) · [TS-1.1~1.12, 2.1~2.4, 3.1](../../docs/stories/2026-06-02-photo-verification-test-scenarios.md) · [Story 1·2](../../docs/stories/2026-06-02-photo-verification-job-stories.md) · [00 §9 BFF](../../docs/migration/00-rn-conversion-plan.md) · [04 §7 Native](../../docs/migration/04-rn-architecture.md) · WP: `feat/rn-native-action-log` (G10).

## Goal

RN 사진 인증 MVP를 end-to-end로 완성: 선택/촬영→압축→Storage 업로드→AI 일기→`action_logs` insert→feed 반영. 서버 시크릿 미노출, PWA feed 정상 표시.

## Source Files to Inspect

- `docs/PRD.md`
- `docs/stories/2026-06-02-photo-verification-job-stories.md`
- `docs/stories/2026-06-02-photo-verification-test-scenarios.md`
- `docs/migration/00-rn-conversion-plan.md`
- `docs/migration/03-rn-migration-rules.md`
- `docs/migration/04-rn-architecture.md`
- `apps/web/src/app/(app)/challenge/[id]/action`
- `apps/web/src/lib/image`
- `apps/web/src/lib/storage`
- `apps/web/src/lib/ai`
- `packages/domain/src/keywords`
- `packages/domain/src/validators/action-log.ts`

## Target Files

- `apps` — native action-log, camera/image
- `apps/web/src/app/api` — BFF `submitActionLog`, D-7 결정
- `apps/web/src/lib/storage` — BFF 경유 재사용
- `packages/domain` — validators, keyword pool, upload policy, challenge day logic

## Requirements

- `expo-camera`/image picker: permission denied·재시도 UI. 업로드: 5MB/1920px/JPEG 0.85/HEIC.
- `@withkey/domain` validators/keyword. 키워드 풀·`KEYWORD_POOL_VERSION` 불변.
- `submitActionLog`: Storage·diary·analytics·push·cleanup → BFF/RPC 트랜잭션 안에서만. 서버 시크릿 미노출.
- AI diary: 4.5s 타임아웃, 커버리지 부족 → fallback. 본문 로그 미기록.
- KST 날짜 web 공유. 2차 인증 피드 남되 `doneCount` 미증가. RN·PWA feed signed private photo URL.
- 업로드/RPC 실패: orphaned 정리 또는 BFF 계약 복구 상태.

## Non-goals

P2 사기 검증·피어 반려·사진 교체 / 챌린지 lifecycle mutations(EVAL-0018) / push 토큰 migration / AI 프롬프트·키워드 풀·analytics 유니온·버킷 변경 / 오프라인 업로드 큐.

## Acceptance Criteria

| 기준                 | 검증 방법                                 |
| -------------------- | ----------------------------------------- |
| native photo flow    | 선택/촬영·preview·permission denied       |
| upload policy parity | 5MB/1920px/JPEG·oversized/HEIC/normal     |
| server BFF boundary  | secrets 서버만; mobile API/RPC            |
| AI diary fallback    | timeout/저커버리지 → 일기 채움·metadata만 |
| action log insert    | photo+keywords로 action_log 생성          |
| doneCount parity     | KST 첫 인증 증가; 2차 미증가              |
| feed reflection      | RN·PWA signed private photo 표시          |
| harness traceability | `pnpm harness:check` passes               |

## Verification Commands

```bash
pnpm harness:context EVAL-0019
pnpm -r typecheck
pnpm -r lint
pnpm -r test
pnpm --filter @withkey/mobile test -- action-log
pnpm harness:check
pnpm validate:docs
# manual/dev-build + PWA smoke: active challenge -> native photo action -> AI diary -> RN/PWA feed
```

## Expected Output Summary

native 사진 경로·BFF submit·upload/AI fallback·doneCount parity·feed·secret boundary를 한국어로 요약한다.

## Harness Impact Questions

1. 폴더? Maybe — action-log·image. 2. 명명? Maybe — native upload adapter. 3. 의존? Yes — camera/image picker/manipulator. 4. 검증 커맨드? Yes(native test/Maestro 시). 5. 하네스 outdated? Maybe(실기기 smoke 문구). 6. `.agents/`? 검증 방식 변경 시만.

## Stop Condition

RN 참가자 사진 인증 1회 후 RN/PWA feed 확인, secret boundary·AI fallback·doneCount parity 검증 완료. pass@3 불가 시 native photo / BFF submit / feed reflection split.
