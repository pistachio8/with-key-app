---
Task: EVAL-0019
Track: port
Kind: migration
Status: blocked
Blocked-by: EVAL-0018(G9 challenge lifecycle mutations) complete + spec — 00 §13.4 D-7 submitActionLog BFF contract accepted if still unresolved.
Parent: docs/PRD.md, docs/stories/2026-06-02-photo-verification-job-stories.md, docs/stories/2026-06-02-photo-verification-test-scenarios.md, docs/migration/00-rn-conversion-plan.md
---

# EVAL-0019: G10 Native action log MVP — photo upload + AI diary + feed reflection

> 00 §8 G10. This ports the core action log path after challenges can be created and activated from RN.

## Parent Links

- Parent PRD Feature: POC PRD §4 사진+키워드 인증 and §5 AI 운동일기 — [docs/PRD.md](../../docs/PRD.md).
- Parent Test Scenario: [TS-1.1~1.12, TS-2.1~2.4, TS-3.1](../../docs/stories/2026-06-02-photo-verification-test-scenarios.md).
- Parent Job Story: [Story 1 사진+키워드+AI 일기](../../docs/stories/2026-06-02-photo-verification-job-stories.md) and Story 2 하루 한 번 카운트.
- Parent Engineering Story: [00 §9 `submitActionLog` BFF 계약](../../docs/migration/00-rn-conversion-plan.md) + [04 §7 Native Capability](../../docs/migration/04-rn-architecture.md).
- Parent Work Package: `feat/rn-native-action-log` (G10).

## Goal

RN에서 사진 인증 MVP를 end-to-end로 완성한다. 이 task가 끝나면 사용자는 네이티브 사진 선택/촬영, 압축/리사이즈, private Storage 업로드, 서버 AI 일기 생성, `action_logs` insert, feed 반영까지 한 번에 수행할 수 있다. OpenAI key와 서버 push/analytics/storage transaction 경계는 mobile에 노출하지 않고, 기존 PWA feed에서도 RN 인증이 정상 표시된다.

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
- `apps/web/src/lib/keywords`
- `apps/web/src/lib/validators/action-log.ts`

## Target Files

- `apps` — implement mobile native action-log feature and camera/image capabilities.
- `apps/web/src/app/api` — BFF endpoint for `submitActionLog` if D-7 chooses API route.
- `apps/web/src/lib/storage` — reuse server storage path/signing behavior behind BFF only.
- `packages/domain` — consume validators, keyword pool, upload policy constants, and challenge day logic.

## Requirements

- Use native photo source flow (`expo-camera`/image picker as chosen by architecture) with permission denied states and retryable failure UI.
- Preserve upload policy: max 5MB, 1920px long-edge clamp, JPEG quality 0.85, HEIC/iOS sample handling.
- Use `@withkey/domain` action-log validators/keyword logic. Keyword pool contents and `KEYWORD_POOL_VERSION` remain unchanged.
- `submitActionLog` server boundary must keep Storage write, AI diary, analytics, push side effects, and cleanup in an approved BFF/RPC transaction shape. Mobile never receives server secrets.
- AI diary keeps 4.5s timeout, fallback on low coverage/timeout, and no prompt/diary body logging in server logs beyond approved event metadata.
- KST distinct day counting remains shared with web; same-day second action logs appear in feed but do not increment `doneCount`.
- RN-created action log appears in RN feed and existing PWA feed with signed private photo URL.
- Upload/RPC failure cleans up orphaned photos or leaves a recoverable state matching the accepted BFF contract.

## Non-goals

- P2 automatic fraud/cheat verification, peer reject, or photo replacement. This is POC action-log port only.
- Challenge lifecycle mutations — EVAL-0018.
- Push token model migration except existing server side effects required by action submission.
- Changing AI prompt, keyword pool, analytics union, or Storage bucket visibility.
- Offline upload queue.

## Acceptance Criteria

| 기준                 | 검증 방법                                                                       |
| -------------------- | ------------------------------------------------------------------------------- |
| native photo flow    | user selects/captures a photo, sees preview, handles permission denied state    |
| upload policy parity | oversized/HEIC/normal samples follow 5MB/1920px/JPEG policy                     |
| server BFF boundary  | OpenAI/storage/push secrets stay server-side; mobile uses approved API/RPC only |
| AI diary fallback    | timeout/coverage fallback produces non-empty diary and logs only metadata       |
| action log insert    | active participant creates action_log with photo and keywords                   |
| doneCount parity     | first KST day action increments; second same-day action does not                |
| feed reflection      | RN and PWA feed show the created card with private signed photo                 |
| harness traceability | `pnpm harness:check` passes                                                     |

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

완료 보고는 native 사진 경로, BFF submit 계약, upload/AI fallback 결과, doneCount parity, RN/PWA feed reflection, cleanup/secret boundary 검증을 한국어로 요약한다.

## Harness Impact Questions

1. Did this task introduce a new folder structure? Maybe — proof/action-log feature and image capabilities.
2. Did this task introduce a new naming convention? Maybe — native upload adapter names.
3. Did this task introduce a new dependency? Yes — camera/image picker/manipulator dependencies if not already added.
4. Did this task change verification commands? Yes if native action-log tests or Maestro smoke are added.
5. Did this task reveal that the current harness instructions are outdated? Maybe — real-device photo/AI smoke may need formal harness wording.
6. Should any `.agents/` document be updated? Only if verification mechanics change; product/architecture SoT remains 00/04.

## Stop Condition

- RN active participant can complete one photo action log and see it in RN/PWA feed.
- Secret boundary, upload cleanup, AI fallback, and doneCount parity are verified.
- pass@3 안에 green 못 만들면 native photo / BFF submit / feed reflection로 split.
