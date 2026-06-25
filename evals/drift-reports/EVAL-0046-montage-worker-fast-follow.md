# Drift Report — EVAL-0046 합본 몽타주 fast-follow(Oracle A1 워커 트리거)

- Task: **EVAL-0046** (Track: greenfield · Kind: migration)
- Branch: `feat/montage-worker-fast-follow` (PR base `develop` — 차단자 EVAL-0043·0045 done, stack 아님)
- Date: 2026-06-25
- Trigger: spec §C6-B / Rollout ⑤ 구현 — 합본 몽타주 결과 mp4 를 Oracle A1 self-host ffmpeg 워커에 트리거하는 경로(`lib/media/montage/**` + `/api/cron/montage`) + 신규 private 버킷 `challenge-montages`(migration 0057) + 신규 env 2개 + recap 분기.

## Harness Impact Questions — 답변

1. **New folder structure? YES(경미)** — `apps/web/src/lib/media/` 신규 subtree(`media/montage/{types,trigger,trigger.spec}.ts`). `lib/` 1st-level 에 `media/` 카테고리가 새로 생김(기존 `ai/`·`push/`·`storage/`·`db/` 동형 — 영상/미디어 인프라 전용). 신규 cron route 세그먼트 `api/cron/montage/`는 기존 `cron/deadline-push`·`cron/cleanup-kudos-push-log` 동형(신규 카테고리 아님).
2. **New naming convention? YES(경미)** — 동형 확장:
   - 버킷 `challenge-montages`(action-videos·feedback-photos 동형 private 버킷 명명).
   - env `MONTAGE_WORKER_URL`·`MONTAGE_WORKER_SECRET`(서버 전용 — `CRON_SECRET`·`VAPID_PRIVATE_KEY` 동형).
   - migration `0057_challenge_montages.sql`(append-only next available).
   - storage RLS policy `cm_select_group_member`(`av_select_group_member` 미러).
   - 멱등 키 = storage 객체 경로 `{challengeId}/montage.mp4`(신규 — montage_jobs 테이블 미도입).
3. **New dependency? NO** — 신규 런타임 의존 없음. HMAC 서명은 Node 내장 `node:crypto`(`createHmac`). 외부 패키지 추가 없음.
4. **Verification commands changed? NO** — AC 검증은 기존 `pnpm typecheck`·`lint`·`test -- montage`·`harness:check`·`build`·`validate:docs` 스코프 그대로. 신규 package.json script 없음.
5. **Harness instructions outdated? NO** — 워크플로/템플릿 가정 불변.
6. **`.agents/` 문서 갱신? NO** — analytics parity(PRD §9.1) 무변경(본 task analytics out of scope — 신규 이벤트 미추가, Non-goals).

## 주요 설계 결정 (ADR-0040 §후속 영향에 정당화 추가)

- **트리거 = cron Route Handler**(`GET/POST /api/cron/montage`), Server Action `after()` 미채택. 몽타주는 종료 후 batch 인코딩이라 user-write side effect 가 아니고, auto-close(만기 cron)된 챌린지는 user action 이 없어 `after()` 경로로는 못 잡는다. `deadline-push` 패턴(CRON_SECRET Bearer) 재사용.
- **저장 = 신규 전용 버킷 `challenge-montages`**(action-videos 재사용 아님). 경로 `{challengeId}/montage.mp4` 가 action-videos `{userId}/...` 규약과 다르고, 재사용 시 recap read 가 admin client 를 써야 해 **ADR-0024(admin hydrate 는 challenge-feed.ts callsite 한정)** 위반. 전용 버킷 + `cm_select_group_member` RLS 로 recap 이 viewer user client 로 안전 read(challenge-videos.ts 동형 RLS-gated read).
- **멱등 = 결과 mp4 경로 존재 검사**(montage_jobs 테이블 미도입). 일 1회 cron + 워커 자체 존재 검사 2중으로 in-flight 중복을 흡수. POC 볼륨에서 상태 테이블은 과함(task 의 "montage_jobs 선택" → 미채택).
- **인증 = HMAC-SHA256 서명**(`x-montage-signature`) + https worker URL(TLS). PWA 미관여.

## 범위 결정 — 스캔 window bound

- task Requirements 외 추가: cron 스캔을 `end_at >= now - 3d` 로 bound(매 실행 전체 영상 챌린지를 storage 재probe 하지 않게). deadline-push window 패턴 차용. 3일 내 인코딩 완료 전제(concat -c copy 는 수초). 3일 이후 실패분은 수동 재트리거(POC 수용 — 후속 montage_jobs 도입 시 재시도 자동화).

## 외부 수동 조치 (repo 밖 — VPS 인프라 · 운영)

이 task 범위는 **트리거 코드·env·recap 분기**만이다. 인코딩 런타임은 repo 밖. 출시 전 운영자가 수행:

1. **Oracle Cloud Always Free Ampere A1 프로비저닝** — stateless ffmpeg 워커 VM.
2. **ffmpeg 인코딩 엔드포인트 구현** — `POST /encode`: body `{challengeId, clipPaths[], outputPath}` 수신 → `x-montage-signature` HMAC 검증(`MONTAGE_WORKER_SECRET` 동일값, timingSafeEqual) → action-videos 클립 pull(service 키) → `concat -c copy` → `challenge-montages/{challengeId}/montage.mp4` push.
3. **TLS** — `MONTAGE_WORKER_URL` 은 https(reverse proxy 또는 직접 TLS).
4. **Vercel env 등록** — `MONTAGE_WORKER_URL`·`MONTAGE_WORKER_SECRET`(Production). 미등록 시 트리거 no-op + recap 스토리 fallback(영상 챌린지 정상).
5. **migration 0057 CI Integration 적용** — 로컬 Supabase 부재로 버킷·RLS 는 CI Integration 이 공유 Supabase 에 db push(pending-only) 후 실측. production apply 게이트 G2(0054 동일, 단방향·forward-only).
6. **Vercel cron 한도 확인** — `apps/web/vercel.json` cron 이 3개(deadline-push·montage·cleanup)로 늘었다. hobby plan cron 한도 초과 시 montage 스캔을 deadline-push 에 fold(한 줄 호출) 하거나 pro 승격. 코드(route)는 등록과 무관하게 외부 스케줄러로도 호출 가능.
7. **인코딩 파라미터 확정** — `-c copy` 가능 여부는 dogfood 캡처 품질 실측 후(ADR-0040 §후속). 재인코딩 필요 시 CPU 증가.

## 검증 결과

- `pnpm typecheck` PASS · `pnpm --filter @withkey/web lint` clean(0) · `pnpm test -- montage`(web) 16/16 PASS(멱등 2회→1건 명시 테스트 포함) · recap 회귀 48/48 · `pnpm harness:check` PASS · `pnpm build` 성공(client static 번들에 `MONTAGE_WORKER_*` 미포함 확인 — env 서버 전용 AC) · `pnpm validate:docs` OK.
- `pnpm test -- montage`(root `-r`)는 apps/mobile jest 가 montage 매칭 0건으로 exit 1 — 모노레포 필터 quirk(내 코드 무관, web 16/16 통과).
