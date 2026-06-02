# `.claude/rules/` 인덱스

이 폴더의 룰은 Claude Code CLI가 자동 디스커버해 메모리로 로드합니다 (CLAUDE.md `@import` 체인 외에). 컨텍스트를 줄이려면 본문을 짧게 유지하세요.

공통 품질 기준의 원본은 [`../../docs/QUALITY_GATE.md`](../../docs/QUALITY_GATE.md). 이 폴더는 그 기준을 Claude/ECC 세션에서 적용하기 위한 보조 어댑터입니다.

## 폴더 구조

| 경로 | 적용 범위 |
|------|----------|
| `common/` | 모든 언어·플랫폼 공통 |
| `typescript/` | TS/JS 코드 작업 (이 프로젝트 기본) |
| `web/` | 브라우저·CSS·접근성·성능·디자인 |

언어/플랫폼 폴더는 `common/`을 extend합니다.

## 작업별 진입점

| 작업 | 읽을 파일 |
|------|----------|
| 새 기능/리팩토링 계획 | `common/development-workflow.md` → `common/agents.md` |
| 품질 기준/검증 게이트 | `../../docs/QUALITY_GATE.md` |
| 코드 작성·수정 | `common/coding-style.md` → `typescript/coding-style.md` |
| 코드 리뷰/PR | `common/code-review.md` → `common/security.md` |
| 보안 민감 변경 | `common/security.md` → `typescript/security.md` |
| 테스트 | `common/testing.md` → `typescript/testing.md` |
| 성능 | `common/performance.md` → `web/performance.md` |
| 프론트엔드/디자인 | `web/coding-style.md` · `design-quality.md` · `patterns.md` |
| 문서 작성 | `common/doc-readability.md` |
| Supabase 키/env | `common/supabase-keys.md` (신규 키 체계) |
| Git/PR | `common/git-workflow.md` |
| 훅/settings | `common/hooks.md` → `typescript/hooks.md` |
| 패턴/아키텍처 | `common/patterns.md` → `typescript/patterns.md` |

## 파일 목록

`common/`: agents · code-review · coding-style · development-workflow · doc-readability · git-workflow · hooks · patterns · performance · security · supabase-keys · testing.

`typescript/`: coding-style · hooks · patterns · security · testing.

`web/`: coding-style · design-quality · hooks · patterns · performance · security · testing.

(파일별 1줄 설명은 각 파일의 헤더 참조.)
