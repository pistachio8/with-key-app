---
Task: EVAL-0056
Track: greenfield
Kind: migration
Status: blocked
Blocked-by: [adr:recap-share-clip-render-infra] — ADR-0025 Spike §B(Hobby 60s 타임아웃) ⏳ 미측정. §B 실패 결론 시 "컨테이너 워커로 인코딩 분리, Vercel 라우트는 워커 프록시로 축소"(§Decision L30-31)를 이 task 가 실행한다 — ADR-0025 가 accepted(§B 결론) 후 착수. 추가 선행(repo 밖): Oracle A1 ffmpeg 워커 가동 + `POST /encode-frames` 엔드포인트 제공.
Parent: docs/adr/0025-recap-share-clip-render-infra.md
---

# EVAL-0056: 공유 recap 영상 인코딩을 Vercel 함수 → 외부 ffmpeg 워커로 이전

> /goal 실행 프롬프트는 이 task 에서 `pnpm harness:goal EVAL-0056` 로 파생한다(별도 섹션 복제 금지 — SoT 는 이 파일).

## Parent Links (추적성 — 위로 1줄씩, 원칙 4)

- Parent PRD Feature: docs/adr/0025-recap-share-clip-render-infra.md — 공유 클립 렌더 인프라 SoT (§Decision·Spike §B 미측정). 관련: docs/adr/0040-feed-type-video-capture.md — 영상 몽타주 워커(같은 VPS 공유 후보)
- Parent Test Scenario: SoT 없음 — AT eval 흡수(05 §2 D10)
- Parent Job Story: SoT 없음 — AT eval 흡수
- Parent Engineering Story: SoT 없음 — AT eval 흡수
- Parent Work Package: `refactor/recap-clip-encode-to-worker`

## Goal

ADR-0025 Spike §B 실패(60s 타임아웃) 판정 시 실행하는 워커-프록시 전환. `/api/share/recap-clip` in-Vercel ffmpeg spawn을 제거하고 PNG → mp4 인코딩 단계만 Oracle A1 외부 워커(`POST /encode-frames`)로 위임한다. 프레임 렌더(`renderBeatPng`)는 Vercel 잔류, 워커 응답(동기)으로 mp4를 수신해 `navigator.share` UX를 보존한다. **번들 의존 제거 범위는 ADR-0025 fallback 정책 선택에 종속.**(a) 폴백 유지 시 번들 잔류, (b) 폴백 제거 시 완전 제거.

## Source Files to Inspect

- `apps/web/src/app/api/share/recap-clip/route.ts` — 현재 동기 렌더+인코딩 흐름(`maxDuration = 60`, `renderBeatPng` :54·:74)
- `apps/web/src/app/api/share/recap-clip/encode.ts` — in-Vercel ffmpeg spawn(이전 대상)
- `apps/web/src/app/api/share/recap-clip/storyboard.ts` · `frames.tsx` — 프레임 정의(Vercel 잔류)
- `apps/web/scripts/copy-ffmpeg.mjs` · `apps/web/package.json` · `apps/web/next.config.ts` — (b) 선택 시 제거 대상
- `apps/web/src/lib/media/montage/trigger.ts` · `types.ts` — HMAC-SHA256 서명 패턴 SoT(재사용)
- `docs/adr/0025-recap-share-clip-render-infra.md` — §Decision L30-31·Spike §B 결론 확인
- `apps/web/src/app/(app)/challenge/[id]/recap/_components/share-card-action.tsx` — 공유 UX 호출부

## Target Files

- `docs/adr/0025-recap-share-clip-render-infra.md` — Spike §B 결론 기록 후 Status: accepted(또는 amend)
- `apps/web/src/app/api/share/recap-clip/route.ts` — 워커 클라이언트 호출로 교체
- `apps/web/src/app/api/share/recap-clip/encode.ts` — 워커 호출 모듈로 대체 또는 삭제
- `apps/web/scripts/` — (b) 선택 시 `copy-ffmpeg.mjs` 삭제
- `apps/web/package.json` — (b) 선택 시 `ffmpeg-static` dep·`build` 스크립트 정리
- `apps/web/next.config.ts` — (b) 선택 시 `outputFileTracingIncludes` `/api/share/**` 제거
- `apps/web/.env.example` — 신규 env 추가 시 주석 포함 동기화
- `apps/web/src/lib/media/` — 공용 워커 클라이언트 신설(`montage/trigger.ts` HMAC 패턴 미러)

## Requirements

- **프레임 렌더 Vercel 잔류**: `renderBeatPng`(`next/og`)는 유지. PNG 바이트 배열을 워커로 POST 하는 경계만 교체.
- **PNG 전송 방식(ADR-0025 기록)**: 최대 8장(1080×1350) → 수십 MB. (i) PNG 바이트 직접 POST vs (ii) temp 버킷 업로드 후 워커 signed URL pull — `maxDuration 60s`·대역 고려 택1.
- **동기 UX 보존**: `POST /encode-frames`(PNG + duration + fps) → 응답으로 mp4 수신. `navigator.share` 전 mp4 확보.
- **HMAC 인증**: `montage/trigger.ts` 패턴 재사용. 신규 env 서버 전용(`NEXT_PUBLIC_` 금지)·`.env.example` 동기화.
- **fallback 정책(ADR-0025 택1)**: (a) 폴백 유지 → 가용성 보존·번들 잔류 vs (b) 폴백 제거 → 번들 완전 제거·워커 다운 시 재시도 토스트.
- (b) 선택 시 `copy-ffmpeg.mjs`→`ffmpeg-static`→`build` 스크립트 제거를 같은 PR 에 묶는다.

## Non-goals

- 합본 몽타주·BGM·자막 — 별도 기획
- EVAL-0046 영상 클립 concat 경로 변경
- Oracle A1 `/encode-frames` 구현(repo 밖 인프라)
- 공유 UX UI 변경

## Acceptance Criteria

| 기준                                                           | 검증 방법                                       |
| -------------------------------------------------------------- | ----------------------------------------------- |
| 동기 UX 보존(워커 mock으로 mp4 수신 후 `navigator.share` 도달) | `pnpm test -- recap-clip`                       |
| fallback/(b)재시도 토스트 동작                                 | `pnpm test -- recap-clip`(워커 에러 mock)       |
| ffmpeg 번들 의존 제거 — (b) 선택 시                            | `pnpm build`                                    |
| 신규 env 서버 전용                                             | `pnpm build`(클라이언트 번들 미포함)            |
| ADR-0025 accepted — fallback 정책·PNG 전송 방식 기록           | PO 수락 확인(수동) + `pnpm validate:docs`(링크) |
| harness 추적성                                                 | `pnpm harness:check`                            |

## Verification Commands

```bash
pnpm typecheck && pnpm lint
pnpm test -- recap-clip
pnpm harness:check
pnpm build
pnpm validate:docs
```

## Expected Output Summary

ADR-0025 Spike §B 결론(타임아웃 여부), fallback 정책 택1·PNG 전송 방식 선택 근거, 워커 클라이언트 구현(HMAC 재사용·엔드포인트 계약), 번들 의존 제거 목록((b) 시), 동기 UX 보존 확인(워커 mock 테스트), repo 밖 선행 조건(Oracle A1 `/encode-frames` 가동)을 한국어로 요약한다.

## Harness Impact Questions (완료 시 반드시 답)

1~6: 폴더/명명/의존/커맨드/하네스/`.agents/` 변경 여부 확인. yes 항목(`lib/media/` encode-worker 신설·(b)시 `ffmpeg-static` dep 제거)은 `evals/drift-reports/` 노트.

## Stop Condition

- AC 전부 green + `pnpm harness:check` 통과.
- 실제 워커 E2E(Oracle A1 환경)는 dogfood 필요 — 로컬/CI 불가 부분 명시 후 완료 수용.
- pass@3 안에 green 못 만들면 → split-work-packages 분할(05 §9.4).
