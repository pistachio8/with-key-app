---
Task: EVAL-0046
Track: greenfield
Kind: migration
Status: blocked
Blocked-by: [task:EVAL-0043] [task:EVAL-0045] — 버킷·클립 경로(0043)와 핵심 출시 dogfood 안정(0045)이 선행 필요. spec §Rollout "캡처 루프 안정 후 착수".
Parent: docs/superpowers/specs/2026-06-23-feed-type-penalty-redesign-design.md, docs/migration/01-rn-mvp-prd.md
---

# EVAL-0046: 합본 몽타주 fast-follow — Oracle A1 워커 트리거 구현

> spec §C6-B 및 Rollout ⑤ 구현. 클립을 이어 붙인 합본 mp4를 Oracle A1 ffmpeg 워커에서 생성하는 트리거 경로(`lib/media/montage/**`), `montage_jobs` 테이블(선택), 신규 env(`MONTAGE_WORKER_URL`·`MONTAGE_WORKER_SECRET`), 결과 mp4 signed URL 노출을 포함한다. 핵심 출시(①~④) dogfood 안정 확인 후 착수.

## Parent Links

- Parent PRD Feature: spec §C6-B — [2026-06-23-feed-type-penalty-redesign-design.md](../../docs/superpowers/specs/2026-06-23-feed-type-penalty-redesign-design.md)
- Parent Test Scenario: SoT 없음 — AT eval 흡수(05 §2 D10)
- Parent Job Story: SoT 없음 — AT eval 흡수
- Parent Engineering Story: SoT 없음 — AT eval 흡수
- Parent Work Package: `feat/montage-worker-fast-follow`

## Goal

`lib/media/montage/trigger.ts`가 Oracle A1 VPS에 인코딩을 비동기 트리거하고, `MONTAGE_WORKER_URL`·`MONTAGE_WORKER_SECRET` env가 서버 전용으로 추가된다. 결과 mp4 signed URL이 recap 화면에 노출되며, 동일 챌린지 재트리거 시 멱등이 보장된다.

## Source Files to Inspect

- **화면 시안(참고)** — 합본 몽타주 결과물(저장/공유 UI·카피): 허브 `docs/mockups/2026-06-24-feed-type-penalty-screens.html` 변이 E (spec §화면 시안)
- `apps/web/src/lib/db/reads/photo-signed-url.ts` — ADR-0024 패턴 SoT(signed URL 재사용 기준)
- `apps/web/src/lib/storage/action-photos.ts` — 기존 storage 패턴(action-videos 참조)
- `apps/web/src/app/(app)/challenge/[id]/recap/page.tsx` — EVAL-0043 스토리 재생 분기 결과물(몽타주 URL 추가 대상)
- `apps/web/.env.example` — 신규 env 동기화 대상
- `AGENTS.md` — §아키텍처(VPS 외부 배치 트리거 ADR 정당화 기준)·§환경 변수·시크릿

## Target Files

- `apps/web/src/lib/` — 신규 `media/montage/trigger.ts`·`media/montage/types.ts`
- `apps/web/.env.example` — `MONTAGE_WORKER_URL`·`MONTAGE_WORKER_SECRET` 주석 포함 추가
- `apps/web/src/app/(app)/challenge/[id]/recap/page.tsx` — 몽타주 URL 노출(feed_type='video'·합본 완료 시)
- `supabase/migrations/` — 선택적 신규 `montage_jobs` 테이블(트리거 방식에 따라 결정)

## Requirements

- 트리거 경로: cron Route Handler(`GET /api/cron/montage`) 또는 Server Action → VPS `POST /encode`. ADR(`feed-type-video-capture`)에 외부 배치 트리거 한 줄 정당화. Server Action 경로는 `after()` 비동기.
- `MONTAGE_WORKER_URL`·`MONTAGE_WORKER_SECRET`: `NEXT_PUBLIC_` 금지. `.env.example` 주석 동기화.
- VPS 인증: HMAC 서명 + TLS. PWA 클라이언트 미관여.
- 멱등: 결과 mp4(`{challengeId}/montage.{ext}`) 존재 시 재인코딩하지 않음.
- recap: 몽타주 URL 있으면 단일 재생, 없으면 스토리 자동재생으로 fallback.
- 이 task 범위: **트리거 코드·env·recap 분기**만. VPS 인프라 자체는 repo 밖.

## Non-goals

- Oracle A1 프로비저닝·인코딩 파라미터 튜닝·analytics·자막/BGM — 후속·out of scope

## Acceptance Criteria

| 기준                    | 검증 방법                            |
| ----------------------- | ------------------------------------ |
| env 서버 전용           | `pnpm build`(클라이언트 번들 미포함) |
| 멱등(2회 트리거 → 1건)  | `pnpm test -- montage`               |
| recap graceful fallback | `pnpm typecheck` 통과                |
| harness 추적성          | `pnpm harness:check`                 |

## Verification Commands

```bash
pnpm typecheck && pnpm lint
pnpm test -- montage
pnpm harness:check
pnpm build
pnpm validate:docs
```

## Expected Output Summary

워커 트리거 방식(cron Route Handler vs Server Action `after()`) 선택 근거, env 서버 전용 보관 확인, 멱등 구현 방식(`montage_jobs` 또는 경로 존재), recap graceful fallback 구현, VPS 세팅 체크리스트(repo 밖 단계: Oracle A1 프로비저닝·ffmpeg·HMAC 엔드포인트·TLS)를 한국어로 요약한다.

## Harness Impact Questions (완료 시 반드시 답)

1~6: 폴더/명명/의존/커맨드/하네스/`.agents/` 변경 여부를 확인하고 yes 항목(특히 `lib/media/montage/` 신규 폴더·검증 커맨드 추가)은 `evals/drift-reports/`에 노트.

## Stop Condition

AC 전부 green + `pnpm harness:check` 통과. pass@3 미달 → split(05 §9.4). 실제 VPS E2E는 dogfood 환경 필요 — 로컬/CI 불가인 부분을 명시 후 완료 수용.
