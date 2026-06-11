# Drift Report — EVAL-0028 건의 서버 파이프라인

- Task: **EVAL-0028** (Track: greenfield · Kind: migration)
- Branch: `feat/feedback-submit`
- Date: 2026-06-11
- Trigger: `apps/web/src/lib/slack/` 신규 폴더(`notify.ts` Slack #qa webhook 알림) + `apps/web/src/lib/storage/feedback-photos.ts`(2-segment path 헬퍼) + `apps/web/src/app/(app)/me/feedback/_actions.ts`(`submitFeedback` Server Action). EVAL-0027 산출물(`feedbackSchema`·migration 0047) 소비만 — 신규 migration/validator 없음.

## Harness Impact Questions — 답변

1. **New folder structure? YES** — `apps/web/src/lib/slack/` 신규(`notify.ts` + `notify.spec.ts`). 외부 알림 채널(Slack Incoming Webhook) 전용의 얇은 `lib/*` 모듈 — `lib/push/`(Web Push)와 동급의 server-only 알림 레이어다. `app/(app)/me/feedback/` route 폴더도 신규지만 route colocation 컨벤션 그대로(EVAL-0029 UI가 같은 폴더에 page/\_components 추가 예정).
2. **New naming convention? NO** — `feedback-photos.ts`는 기존 `action-photos.ts` 명명·시그니처 패턴(`build*PhotoPath`/`upload*Photo`/`looksLike*PhotoPath`) 답습. `_actions.ts` colocation 동일.
3. **New dependency? NO** — Slack 알림은 내장 `fetch` + `AbortController`만 사용. 신규 패키지 없음.
4. **Verification commands changed? NO** — 기존 vitest unit 패턴 3개 spec 추가. 신규 스크립트/게이트 없음.
5. **Harness instructions outdated? NO** — 구현 중 stale path 가정 미발견. AT의 Source Files 8개 전부 유효했다.
6. **`.agents/` 문서 갱신? NO(불요)** — `.agents/` 경로 이동/이름 변경 없음.

## 구현 무결성

- `submitFeedback`은 `withUser` + `ActionResult` 계약 경유. id 선생성(`randomUUID`) — INSERT-only RLS 라 `insert(...).select()` 불가(ADR-0035) → 업로드 선행 → insert 실패 시 orphan object best-effort remove → `after()` Slack.
- `notifyFeedbackToSlack`은 never-throw(자체 try/catch + 2.5s `AbortController`), env `SLACK_FEEDBACK_WEBHOOK_URL` 미설정 시 silent skip. `NEXT_PUBLIC_` 접두 없음 grep 확인.
- 로그는 메타만(feedbackId·reason·status) — 건의 본문/프롬프트 미로그.

## 관찰된 별개 항목

- `apps/web/.env.example`의 `SLACK_FEEDBACK_WEBHOOK_URL` 항목은 EVAL-0027 산출물로 이미 존재함을 grep 으로 확인(line 51) — 본 task 의 env 동기화 의무 없음. Vercel env 실설정은 운영 후속(AT Non-goals).
- `pnpm harness:drift`가 EVAL-0029 의 stale status 를 advisory 로 경고하나, 이는 WP 브랜치명 `feat/feedback-submit` 이 EVAL-0027 PR(#202)에서 먼저 머지된 데서 온 휴리스틱 오탐 — EVAL-0029(UI)는 실제 미착수(todo 유지가 정확).
