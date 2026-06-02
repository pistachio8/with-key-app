# ADR-0025-recap-share-clip-render-infra: Recap Share Clip Render Infra

**Date**: 2026-05-29
**Status**: proposed <!-- accepted / superseded / deprecated -->
**Deciders**: pistachio8

## Context

정산 공유에 "루틴 흔적" 영상(2~3초 MP4)을 추가한다. Phase 1a 정적 카드와 같은
프라이버시 경계가 필요하다: 계좌, 예금주, 멤버 실명, 벌금 금액은 외부 공유물에
렌더하지 않는다.

외부 영상 API(Shotstack, Creatomate, Cloudinary 등)는 렌더당 과금과 멤버 사진의
제3자 전송을 동반한다. 이는 `docs/superpowers/specs/2026-05-29-recap-share-redesign.md`
§D1의 POC 프라이버시 원칙과 충돌한다. Remotion은 React 재사용성이 높지만 headless
Chromium 실행 환경이 필요해 Vercel 함수 1차 구현에는 맞지 않고, 상용 라이선스 확인도
필요하다.

## Decision

정산 공유 MP4는 자체 호스팅 렌더 파이프라인으로 생성한다.

- Phase 1a의 `src/app/api/og/recap-card/templates.tsx` 카드 렌더를 재사용한다.
- `next/og` `ImageResponse`로 PNG 키프레임을 만들고, `ffmpeg-static`으로 H.264 MP4를
  인코딩한다.
- 1차 실행 위치는 Vercel Node.js Route Handler다. `runtime`은 명시하지 않고 Next.js
  기본값인 Node.js를 사용한다.
- Vercel 함수 unzip 크기와 타임아웃 리스크가 있으므로, Vercel Preview spike 통과를
  production 배포 전제 조건으로 둔다.
- spike가 실패하면 컨테이너 워커(Railway/Fly 등)로 인코딩을 분리하고, Vercel 라우트는
  인증/게이팅 후 워커 프록시로 축소한다.

## Alternatives Considered

### 1. 외부 영상 API

- **Pros**: 영상 인프라를 직접 운영하지 않아도 된다.
- **Cons**: 렌더당 과금, 멤버 사진 제3자 전송, API 장애/락인.
- **Why not**: POC의 사진 프라이버시 원칙과 비용 구조에 맞지 않는다.

### 2. Remotion

- **Pros**: React 컴포넌트로 영상을 구성할 수 있어 UI 재사용성이 높다.
- **Cons**: Chromium 기반 렌더 환경, 별도 Lambda/워커 운영, 상용 라이선스 확인 필요.
- **Why not**: 2주 POC의 1차 구현으로는 운영 표면이 크다. 워커 폴백 후보로만 보존한다.

### 3. 클라이언트 WebCodecs/MediaRecorder

- **Pros**: 서버 인코딩 비용이 없다.
- **Cons**: iOS Safari, 카카오톡 인앱 브라우저, 공유 파일 호환성이 불안정하다.
- **Why not**: 공유 직전 실패율이 높으면 Week 2 dogfood 신호가 흐려진다.

## Consequences

### 긍정적

- 외부 영상 API 과금이 없다.
- 멤버 사진을 제3자 렌더 서비스로 보내지 않는다.
- Phase 1a 정적 카드 렌더와 폰트/팔레트/엔드카드를 재사용할 수 있다.

### 부정적 / 비용

- `ffmpeg-static` 네이티브 바이너리 때문에 서버 함수 번들 크기가 커진다.
- PNG 키프레임 생성과 MP4 인코딩이 Route Handler 응답 시간을 늘린다.
- Vercel 함수 unzip 약 250MB 한도와 플랫폼별 max duration을 Preview에서 실측해야 한다.

### 후속 영향

- `package.json` dependencies에 `ffmpeg-static`을 둔다.
- `next.config.ts`에 `serverExternalPackages`와 `outputFileTracingIncludes`를 추가한다.
- Preview에서 함수 크기, `X-Encode-Ms`, iOS Safari/카카오톡 인앱/인스타 스토리 재생을
  확인한 뒤 아래 spike 결과를 채운다.

## Spike 결과

> 측정일 2026-05-29 · 플랜 **Vercel Hobby** (함수 크기 250MB는 Pro와 동일, max duration 상한 60s).

### A. 함수 번들 크기 — ✅ PASS (250MB 한도)

- **recap-clip 함수 unzipped 총합: 110.0 MB / 250MB** — 여유 약 140MB.
  - 그중 `ffmpeg-static` 바이너리 87.0 MB · 트레이싱된 파일 202개(미해결 0).
- **측정 방법**: `vercel link`(브라우저 인터랙티브) 미연결 상태라 `vercel build` 대신 동등한 Next.js Output File Tracing 으로 측정. `pnpm build`(성공) 후 `.next/server/app/api/share/recap-clip/route.js.nft.json` 의 트레이스 파일 크기를 합산. Vercel 함수 unzip 번들 = 이 NFT 산물이므로 실배포 크기와 사실상 동일.
- **`outputFileTracingIncludes` 동작 확인**: `.next` 트레이스에 `ffmpeg-static-*` 바이너리 포함 확인(설정 누락 시 흔한 실패 — 통과).
- 재현: `pnpm build` → `find .next -path '*share/recap-clip*' -name '*.nft.json'` → 해당 nft.json 의 `files[]` 크기 합산.

### B. 인코딩 시간 / 타임아웃 — ⏳ Preview 미측정

- 로컬 인코딩(2.5s 샘플): 117ms (`scripts/spike/recap-clip-encode.mjs`, 8 color keyframes). _단 이는 satori 프레임 렌더 비용을 제외한 ffmpeg 단독 시간._
- **Hobby 60s 천장이 진짜 관문**: 콜드스타트 + satori 키프레임 N장 렌더 + ffmpeg 인코딩이 60s 내 완료되는지 Preview 실측 필요. 로컬·NFT 로는 측정 불가.
- 측정 예정: `vercel deploy` → 로그인 브라우저로 `/api/share/recap-clip?challengeId=<closed id>` 호출, 응답코드(200 vs 504)·왕복시간 확인.

### C. 실기기 재생 — ⏳ 미측정

- iOS Safari 미측정 / 카카오톡 인앱 미측정 / 인스타 스토리 미측정.

### 결론 (잠정)

- 크기 게이트 **통과**(110MB). 남은 게이트는 **B(Hobby 60s 타임아웃)** 와 **C(실기기 재생)** — 둘 다 Vercel Preview 배포 후 실측. 통과 시 Status: accepted, 임시 `_spike` 라우트 삭제. B 실패(타임아웃) 시 컨테이너 워커 폴백(plan Task 12).
