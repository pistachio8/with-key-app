# ADR-0014: 바이너리 응답 Route Handler 허용 (OG/공유 이미지)

**Date**: 2026-05-21
**Status**: proposed
**Deciders**: pistachio8

## Context

AGENTS.md §아키텍처는 다음을 가드레일로 두고 있다.

- 클라이언트→서버 쓰기는 `_actions.ts`(Server Action)로 일원화 — 인증/검증/로깅 단일 경로.
- `src/app/api/*` Route Handler는 **외부 콜백 전용**(예: Web Push 콜백) — 일반 쓰기 경로와 책임 분리.

청첩장 정산 페이지의 PNG 공유 카드(`docs/superpowers/specs/2026-05-21-recap-invitation-design.md`) 구현 시 다음 제약이 드러났다.

1. **Server Action은 직렬화 가능한 값만 반환**. `ImageResponse`나 `Blob`/`ArrayBuffer` PNG 바이너리를 client component까지 그대로 흘리려면 base64 인코딩 → blob 복원이 필요해 페이로드가 1.3× 증가하고 cache layer가 사라진다.
2. **클라이언트 측 이미지 생성**(html2canvas · html-to-image)은 한글 webfont 로딩 타이밍·캔버스 폴리필·CORS 이슈가 누적 — POC 안정성 ↓.
3. OG/SNS 미리보기 이미지는 일반적으로 메신저·크롤러가 직접 GET하는 정공법으로, Route Handler가 표준 패턴이다.

따라서 "외부 콜백 전용" 가드레일을 **바이너리 응답(이미지·파일)** 케이스에 한해 명시적으로 예외 처리할 필요가 있다.

## Decision

**바이너리 응답(이미지·파일·PDF 등 비텍스트 페이로드)을 반환하는 Route Handler는 `src/app/api/*` 사용을 허용한다.** 단 다음 조건을 모두 충족해야 한다.

1. **인증·권한 가드를 RSC와 동등 수준으로 적용**. `createClient()` + `auth.getUser()` + RLS 통과 fetcher 호출 또는 명시적 권한 체크. 미인증 → 401, 권한 없음 → 403/404.
2. **일반 데이터 read/write에는 사용 금지** — JSON read/write는 그대로 RSC + Server Action.
3. **응답 `Content-Type`이 비텍스트**(`image/*`, `application/pdf`, `application/octet-stream` 등)임이 명확.
4. **Cache 헤더 명시**. private/public 의도와 max-age 또는 no-store 중 하나를 라우트 코드에 정의.
5. **Runtime 명시** (`export const runtime = 'nodejs'` 또는 `'edge'`). Supabase auth helper · `fs.readFile`(폰트) 호환성 검토 후 결정.

권장 경로 컨벤션: `src/app/api/og/<topic>/route.ts` (OG 이미지·공유 카드), `src/app/api/files/<topic>/route.ts` (파일 다운로드).

## Alternatives Considered

### 1. Server Action으로 base64 인코딩 반환

- **Pros**: 가드레일 위반 없음, 단일 경로 유지.
- **Cons**: base64 → blob 복원 추가, 응답 크기 ~33% 증가, Web Share API에 `File` 객체 생성 시 한 번 더 가공. 캐싱 헤더 직접 제어 불가.
- **Why not**: 인코딩·디코딩 오버헤드 + 캐시 부재 + 직렬화 한계로 PNG 같은 바이너리 응답의 정공법이 아님.

### 2. Client-side 이미지 생성 (html2canvas · html-to-image)

- **Pros**: 서버 자원 0, 라우트 신설 불필요.
- **Cons**: 한글 webfont 타이밍 의존성, 모바일 Safari 캔버스 메모리 제약, 컴포넌트 DOM 의존 → SSR 토큰과 정합성 깨짐.
- **Why not**: POC 안정성 우선, 디자인 토큰 분기 비용 ↑.

### 3. `@vercel/og` 외부 패키지

- **Pros**: 동일 패턴이지만 helper 제공.
- **Cons**: Next.js 13.3+부터는 동일 기능이 `next/og`의 `ImageResponse`로 내장 — 외부 패키지 추가 불필요.
- **Why not**: 의존성 최소화 원칙.

## Consequences

### 긍정적

- PNG 공유 카드 구현이 정공법으로 가능 — `ImageResponse` + Web Share API + 다운로드 폴백 정상 패턴.
- 향후 다른 바이너리 응답(예: 정산 결과 PDF 익스포트·OG 이미지 다른 페이지) 시 동일 패턴 재사용 가능.
- 가드레일이 "Route Handler 일반 금지"가 아니라 "일반 쓰기/읽기는 RSC+Server Action, 바이너리 응답은 Route Handler"로 명확화됨.

### 부정적 / 비용

- "외부 콜백 전용"이라는 단순 룰이 "외부 콜백 + 바이너리 응답"으로 약간 복잡해짐 — AGENTS.md §아키텍처 항목에 본 ADR 참조 한 줄 추가 필요.
- 향후 새 Route Handler를 만들 때 "이게 바이너리 응답인가?" 판단을 매번 해야 함. 케이스가 누적되면 코드 리뷰 부담.

### 후속 영향

- AGENTS.md §아키텍처에 본 ADR 참조 한 줄 추가 (별도 PR — 가드레일 문서 업데이트).
- `docs/QUALITY_GATE.md` "아키텍처 가드레일" 섹션에도 같은 한 줄 동기화.
