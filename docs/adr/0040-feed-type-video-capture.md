# ADR-0040: 피드 타입 영상 인증 — 실시간 캡처 전용 · Oracle A1 self-host 몽타주 워커

**Date**: 2026-06-24
**Status**: accepted
**Deciders**: pistachio8 (PO 수락 2026-06-24)
**관련**: spec [`2026-06-23-feed-type-penalty-redesign-design.md`](../superpowers/specs/2026-06-23-feed-type-penalty-redesign-design.md) §C2 · §C6 · §C7 · ADR-0024(admin-cache-after-layer1-visibility) · ADR-0025(recap-share-clip-render-infra) · EVAL-0042 · EVAL-0043 · EVAL-0046

## Context

챌린지 생성 시 `이미지` 또는 `3초 영상` 중 하나를 고르는 **피드 타입**을 더한다. 이 선택이 그 챌린지의 **인증 medium 전체**와 **정산 결과물**을 함께 결정한다. 이미지 챌린지는 기존 사진 인증·recap을 그대로 쓰고, 영상 챌린지는 실시간 3초 클립으로 인증한다.

두 가지가 설계를 제약한다.

1. **부정방지** — 각서 앱은 신뢰가 핵심이다. 사진 인증에서 phash·EXIF로 _사후_ 탐지하던 위조를 영상에선 카메라 단에서 원천 차단하고 싶다. 미리 찍어둔 영상·짜깁기 업로드를 막아야 한다.
2. **인코딩 인프라 비용·리스크** — 3초 클립 합본 몽타주(Setlog/1SE 패턴)는 강한 공유물이지만, 인코딩 런타임(워커/큐)을 2주 POC 핵심 경로에 올리면 출시 리스크다. 미디어 접근제어(private 버킷·signed URL·RLS 가시성·ADR-0024 캐시)는 이미 전부 Supabase Storage 위에 있다.

`spec-required` 경로(§4: `supabase/migrations/**`)와 신규 외부 인프라(VPS)·신규 env를 도입하므로 풀 ADR 대상이다.

## Decision

영상 인증은 **앱 카메라 실시간 캡처 전용**으로 하고, 합본 몽타주는 **Oracle Cloud Always Free Ampere A1 self-host ffmpeg 워커(stateless)** 로 fast-follow 분리한다. 미디어 SoT는 Supabase Storage를 유지한다. 세부:

- **실시간 캡처 전용** — 영상 챌린지는 갤러리 업로드 UI를 노출하지 않는다. Web(PWA)은 `navigator.mediaDevices.getUserMedia` + `MediaRecorder`(최대 3초), RN 전환 시 `react-native-vision-camera`. 캡처는 **동일 코덱·해상도·fps로 표준화**(몽타주 `concat -c copy` 재인코딩 회피 전제).
- **저장 = 신규 private 버킷 `action-videos`** — 경로 `{userId}/{challengeId}/{actionLogId}-{nonce}.{ext}`(기존 `action-photos` 미러). signed URL 600s. read는 `photo-signed-url.ts`(ADR-0024 — Layer 1 visibility 통과 후 `adminClient()`+public `"use cache"`+`cacheTag`+600s stale)를 복제한 `video-signed-url.ts`로. feed 소비 시 `FeedItemView`(`challenge-feed.ts`)에 `videoSignedUrl` 필드 추가.
- **`action_logs` 컬럼 방식 medium** — `media_type text not null default 'photo' check (media_type in ('photo','video'))`, `video_path text` nullable. 별도 `action_media` 테이블 비채택(컬럼이 가볍고 `photo_path`·검증 컬럼군과 같은 행에 colocate되어 `doneByWeek`·feed read 변경 최소).
- **불변성 트리거(`0046`) 갱신 필수** — `prevent_action_log_body_mutation`은 변경 금지 컬럼을 **열거**하므로 신규 컬럼은 기본 변경 허용 상태가 된다. `0052`에서 `create or replace`로 **`media_type`을 금지 목록에 추가**(불변, 클라가 photo↔video 위조 방지), **`video_path`는 제외**(마감 전 교체 허용, `photo_path`와 동일).
- **영상 검증 상태 = `passed` 재사용** — 제출 시 `auto_verify_status='passed'` 기본값(=done 카운트). `doneByWeek`가 사진과 완전히 동일하게 동작. 영상엔 **AI 검증 없음**(Phase 1 — 3초 클립 판정 모델 없음). 무결성 = 실시간 캡처(갤러리 차단) 1차 보증 + peer-reject가 유일한 사후 게이트. 코드 주석에 "영상의 `passed`는 'AI 통과'가 아니라 '캡처 수용'" 명시. `capture_verified` 같은 enum 신설 금지(모든 소비처를 건드려야 함).
- **결과물 2단계** — Phase 1(핵심)은 **스토리 자동재생**(클립을 클라이언트에서 시간순 재생, 인코딩·서버·외부 비용 0). fast-follow는 **합본 몽타주**(클립을 한 편 mp4로 인코딩). recap `page.tsx`는 `challenges.feed_type`을 읽어 `'image'`면 기존 경로, `'video'`면 스토리 자동재생으로 분기(회귀 필수 — 현행은 `fetchChallengePhotos`만 호출해 영상 챌린지에서 빈 갤러리).
- **몽타주 워커 = Oracle A1 self-host ffmpeg(stateless)** — 클립 pull → `ffmpeg concat -c copy` → 결과 mp4 push(private 저장 + signed URL). 미디어 SoT는 Supabase 유지(워커에 사용자 콘텐츠 영구 저장 안 함 → free tier 회수돼도 손실 없음). 트리거는 Vercel cron(Route Handler) 또는 Server Action `after()` 비동기 → VPS 인증 엔드포인트. 신규 env(`MONTAGE_WORKER_URL`·`MONTAGE_WORKER_SECRET`)는 `NEXT_PUBLIC_` 금지 + `apps/web/.env.example` 동기화. PWA 클라이언트 미관여.

## Alternatives Considered

### 1. 영상 결과물을 합본 몽타주(B)부터 Phase 1 크리티컬 패스로

- **Pros**: "한 편의 영상" 공유물을 처음부터 제공.
- **Cons**: 인코딩 인프라(워커/큐)를 2주 POC 핵심 경로에 올려 출시 리스크.
- **Why not**: Phase 1 = 스토리 자동재생(인프라 0)으로 영상 챌린지가 결과물 없이 끝나지 않게 보장하고, 몽타주는 캡처 루프 안정 후 fast-follow.

### 2. 몽타주 인코딩을 Mux(managed)로

- **Pros**: 운영부담 0.
- **Cons**: 분당 과금.
- **Why not**: 보유한 Oracle A1로 self-host ffmpeg를 돌리면 $0이고, 몽타주가 async·멱등·재시도라 free tier SLA 부재를 견딘다(볼륨/운영부담 커지면 Mux 재검토).

### 3. VPS를 이미지/영상 저장·직서빙 서버로

- **Pros**: 미디어 파이프라인을 한 곳에 모음.
- **Cons**: private 버킷+signed URL·RLS 가시성·ADR-0024 캐시가 전부 Supabase Storage 위에 있어 접근제어를 재구현해야 하고, free tier 회수 시 사용자 콘텐츠가 통째로 유실.
- **Why not**: 미디어 SoT는 Supabase, VPS는 stateless 인코딩 워커로 한정.

### 4. medium을 별도 `action_media` 테이블로 정규화

- **Pros**: 한 인증에 여러 미디어를 붙이는 미래 확장에 유연.
- **Cons**: `doneByWeek`·feed read 등 기존 소비처가 join을 타야 하고 변경 면적이 커진다.
- **Why not**: Phase 1은 1인증 1미디어라 컬럼 추가가 가볍고 회귀 면적 최소.

### 5. 영상 전용 검증 enum(`capture_verified`) 신설

- **Pros**: "영상은 AI 통과가 아니다"를 타입으로 명시.
- **Cons**: `doneByWeek`·feed read 등 `auto_verify_status` 모든 소비처를 건드려야 함.
- **Why not**: `passed` 재사용 + 주석으로 의미 명시. 소비처 무변경.

## Consequences

### 긍정적

- Phase 1을 외부 인프라 0으로 출시(스토리 자동재생). 영상 챌린지가 결과물 없이 끝나지 않음.
- 몽타주 인코딩 $0(Oracle A1) + 미디어 SoT를 Supabase에 유지해 free tier 회수 리스크를 비핵심·재시도로 흡수.
- 부정방지를 카메라 단(실시간 캡처)에서 원천 차단 + peer-reject backstop.
- 컬럼 방식 + `passed` 재사용으로 `doneByWeek`·feed read 변경 최소.

### 부정적 / 비용

- web `getUserMedia`는 가상 카메라로 우회 가능 — 잔여 부정은 동료 판단(peer-reject)이 backstop.
- Oracle free tier는 SLA가 없고 회수 가능 — 몽타주가 비동기·멱등·재시도라 수용. 외부 엔드포인트(공유 시크릿/서명 + TLS) 운영 부담이 새로 생긴다.
- 캡처를 동일 코덱·해상도·fps로 표준화해야 `concat -c copy`가 성립 — 클라이언트 캡처 제약이 강제된다(정규화 필요 시 re-encode로 CPU 증가).
- recap `feed_type` 분기를 빠뜨리면 영상 챌린지가 빈 갤러리로 침묵 렌더 → 단위 + E2E 회귀로 보장 필요.

### 후속 영향

- migration `0052_action_videos.sql`(`action-videos` 버킷 + RLS, `action_logs.media_type`·`video_path`, `0046` 트리거 `create or replace`). 번호는 구현 PR 시점 append-only next available로 재부여.
- `apps/web/src/lib/storage/action-videos.ts`(업로드·signed URL), `video-signed-url.ts`(ADR-0024 패턴 복제), `challenge-feed.ts` `FeedItemView.videoSignedUrl`.
- `apps/web/src/lib/media/montage/**`(워커 트리거) + 신규 env 2개 + `.env.example` 동기화. 인코딩 런타임은 repo 밖 Oracle A1 배포.
- `packages/domain/src/validators/action-log.ts` 영상 MIME·길이·크기 검증. recap `page.tsx` `feed_type` 분기.
- `docs/BE_SCHEMA.md`에 `action-videos` 버킷·`media_type`/`video_path` 컬럼·불변성 트리거 갱신 반영.
- 인코딩 파라미터(`-c copy` 가능 여부)는 dogfood 캡처 품질 실측 후 확정(EVAL-0046).
- **EVAL-0046 구현 결정** — 트리거는 **cron Route Handler `GET/POST /api/cron/montage`**(Server Action `after()` 대신): 몽타주는 종료 후 batch 인코딩이라 user-write side effect 가 아니고, auto-close(만기 cron)된 챌린지는 user action 이 없어 `after()` 경로로는 못 잡는다 — `deadline-push` 패턴(CRON_SECRET Bearer)을 재사용한다. 결과 mp4 는 **신규 private 버킷 `challenge-montages`**(migration `0057`, 경로 `{challengeId}/montage.mp4`)에 저장한다 — `action-videos`(경로 `{userId}/...`) 재사용 시 recap read 가 admin client 를 써야 해 ADR-0024(admin hydrate 는 `challenge-feed.ts` callsite 한정)를 어기므로, 전용 버킷 + `cm_select_group_member` RLS 로 recap 이 viewer user client 로 안전하게 read 한다. **멱등은 결과 mp4 경로 존재 검사**(`montage_jobs` 테이블 미도입 — 일 1회 cron + 워커 자체 존재 검사로 in-flight 중복을 흡수, POC 볼륨에서 상태 테이블은 과함).
