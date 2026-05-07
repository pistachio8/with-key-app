# `.claude/rules/` 인덱스

이 폴더의 룰은 **자동 로드되지 않습니다**. 작업 종류에 맞는 파일을 명시적으로 읽어야 합니다.

매 세션 자동 로드되는 것은 `CLAUDE.md` `@import` 체인뿐입니다 (`AGENTS.md` · `.claude/AGENTS.md` · `rules/common/agents.md`).

## 폴더 구조

| 경로 | 적용 범위 |
|------|----------|
| `common/` | 모든 언어·플랫폼 공통 |
| `typescript/` | TypeScript/JavaScript 코드 작업 시 (이 프로젝트 기본) |
| `web/` | 브라우저·CSS·접근성·성능·디자인 작업 시 |

언어/플랫폼 폴더는 `common/`을 extend합니다 — 두 파일 모두 읽으면 됩니다.

## 작업별 진입점

| 작업 | 읽을 파일 (순서) |
|------|-----------------|
| 새 기능 / 리팩토링 계획 | `common/development-workflow.md` → `common/agents.md` (서브에이전트 매핑) |
| 코드 작성·수정 | `common/coding-style.md` (Karpathy 4원칙·불변성) → `typescript/coding-style.md` |
| 코드 리뷰 / PR 리뷰 | `common/code-review.md` → `common/security.md` |
| 보안 민감 변경 (인증·입력·DB) | `common/security.md` → `typescript/security.md` |
| 테스트 작성 | `common/testing.md` → `typescript/testing.md` |
| 성능 작업 | `common/performance.md` → `web/performance.md` (브라우저면) |
| 프론트엔드·디자인 | `web/coding-style.md` · `web/design-quality.md` · `web/patterns.md` |
| 접근성 / Core Web Vitals | `web/performance.md` · `web/security.md` |
| 문서 작성·리라이팅 | `common/doc-readability.md` |
| Supabase 키·env 작업 | `common/supabase-keys.md` (이 프로젝트는 신규 키 체계 사용) |
| Git 커밋·PR 본문 | `common/git-workflow.md` |
| 훅 설정 / settings.json | `common/hooks.md` → `typescript/hooks.md` |
| 패턴·아키텍처 결정 | `common/patterns.md` → `typescript/patterns.md` |

## 파일 목록

### `common/` (언어·플랫폼 무관)

- `agents.md` — 서브에이전트 매핑(어느 작업에 어느 에이전트를 띄울지). **CLAUDE.md `@import`로 자동 로드됨.**
- `code-review.md` — 리뷰 트리거·심각도·체크리스트
- `coding-style.md` — Karpathy 4원칙(생각·단순함·외과적 수정·목표 중심) + 불변성·파일 구성·에러 처리·입력 검증
- `development-workflow.md` — 연구·계획·TDD·리뷰·커밋 파이프라인
- `doc-readability.md` — 주니어 친화 문서 작성 규칙(always-on)
- `git-workflow.md` — 커밋 메시지 형식, PR 본문 한국어 규칙
- `hooks.md` — PreToolUse / PostToolUse / Stop 훅 모범 사례
- `patterns.md` — 리포지토리 패턴, API 응답 엔벨로프
- `performance.md` — 모델 선택, 컨텍스트 윈도우 관리
- `security.md` — 보안 점검 체크리스트, 시크릿 관리
- `supabase-keys.md` — **이 프로젝트 기준점**. `sb_publishable_*` / `sb_secret_*` 신규 키 체계
- `testing.md` — 80% 커버리지·TDD 워크플로우

### `typescript/` (TS/JS 작업)

- `coding-style.md` — TypeScript 특화 스타일
- `hooks.md` — TS 전용 훅 권장
- `patterns.md` — TS 패턴
- `security.md` — TS/Node 보안 이슈
- `testing.md` — Vitest·Testing Library 등 TS 테스트

### `web/` (브라우저 작업)

- `coding-style.md` — 컴포넌트·CSS 변수·시멘틱 HTML
- `design-quality.md` — 안티-템플릿 정책·필수 디자인 품질
- `hooks.md` — 프론트엔드 빌드/포맷 훅
- `patterns.md` — Compound 컴포넌트, 상태 관리, URL 상태
- `performance.md` — Core Web Vitals·번들·이미지·폰트
- `security.md` — CSP·XSS·HTTPS 헤더
- `testing.md` — Visual regression·접근성·반응형
