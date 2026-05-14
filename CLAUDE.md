@AGENTS.md
@docs/QUALITY_GATE.md
@.claude/AGENTS.md
@.claude/rules/common/agents.md

# 컨텍스트 인덱스

매 세션 자동 로드되는 것은 위 4개 파일뿐입니다. 그 외는 작업 시점에 명시적으로 읽으세요.

## 작업 종류별 진입 문서

| 작업 | 먼저 읽을 곳 |
|------|--------------|
| 품질 기준 / 검증 | `docs/QUALITY_GATE.md` |
| 비용 / 컨텍스트 운영 | `docs/QUALITY_GATE.md` "AI 에이전트 비용과 컨텍스트 운영" → `.claude/rules/common/performance.md` |
| 새 기능 / 리팩토링 | `docs/PRD.md` (AC) → `docs/BE_SCHEMA.md` (테이블·RLS) → `.claude/AGENTS.md` 가드레일 섹션 |
| UI 시안 / 모킹업 | `docs/mockups/README.md` |
| 코드 작성·수정 | `.claude/rules/common/coding-style.md` (Karpathy 4원칙·불변성) |
| 코드 리뷰 / PR | `.claude/rules/common/code-review.md` · `.claude/rules/common/development-workflow.md` |
| Server Action / RSC | `.claude/AGENTS.md` "with-key 가드레일 §아키텍처" |
| Supabase migration | `.claude/AGENTS.md` "with-key 가드레일 §Supabase / RLS" · `docs/BE_SCHEMA.md` |
| AI 일기 / OpenAI | `.claude/AGENTS.md` "with-key 가드레일 §AI 일기" · `src/lib/ai/**` |
| 분석 이벤트 | `.claude/AGENTS.md` "with-key 가드레일 §이벤트 로깅" · `docs/PRD.md §9.1` |
| 문서 작성 | `.claude/rules/common/doc-readability.md` |
| 룰 전체 색인 | `.claude/rules/INDEX.md` |
| docs/ 색인 | `docs/README.md` |

## 참고

- Next.js 16 breaking change: 코드 작성 전 `node_modules/next/dist/docs/`의 관련 가이드를 먼저 읽으세요 (학습 데이터와 다를 수 있음).
- `git` 계정은 `pistachio8` 고정. 자동 커밋·푸시는 사용자 확인 후에만.
- agent session 결과/회귀는 `evals/results/agent-results.json` 의 runs[] 에 append합니다 (append-only agent log). OpenTelemetry 연동은 후속.
