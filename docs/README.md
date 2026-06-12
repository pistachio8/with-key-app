# `docs/` 인덱스

with-key 팀이 공유하는 제품·아키텍처·운영 문서입니다.

이 폴더는 **자동 로드되지 않습니다** — 작업 종류에 맞는 파일을 명시적으로 읽으세요.

## 빠른 진입

| 묻고 싶은 것                                 | 읽을 문서                                                                                       |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| 무엇을 만드나? 인수 기준은?                  | [`PRD.md`](./PRD.md) — 유저 스토리 · AC · 이벤트 표(§9.1)                                       |
| PRD 다음엔 뭘 만드나? spec은 언제?           | [`DOC_FLOW.md`](./DOC_FLOW.md) — 기능 spine vs 결정 문서(plan/spec/ADR) 판별 가이드             |
| 코딩 품질·검증 기준은?                       | [`QUALITY_GATE.md`](./QUALITY_GATE.md) — 모든 AI 에이전트와 사람이 공유하는 성공 기준           |
| AI 에이전트가 달라도 코드 품질을 유지하려면? | [`AI_AGENT_CODE_QUALITY.md`](./AI_AGENT_CODE_QUALITY.md) — 공통 품질 기준과 도구별 adapter 원칙 |
| DB 스키마·RLS·상태 전이                      | [`BE_SCHEMA.md`](./BE_SCHEMA.md) + [`BE_SCHEMA_RLS.md`](./BE_SCHEMA_RLS.md)                     |
| 아키텍처 원칙·폴더 구조                      | [`ARCHITECTURE.md`](./ARCHITECTURE.md)                                                          |
| 되돌리기 비용 큰 결정 로그                   | [`DECISIONS.md`](./DECISIONS.md) (ADR-lite)                                                     |
| Day 1 세팅·로컬 실행·배포                    | [`ONBOARDING.md`](./ONBOARDING.md)                                                              |
| Vercel 배포 환경                             | [`DEPLOY.md`](./DEPLOY.md)                                                                      |
| Week 2 GO/NO-GO 지표                         | [`VALIDATION.md`](./VALIDATION.md)                                                              |
| 제품의 "왜"·페르소나·가설                    | [`IDEATION.md`](./IDEATION.md)                                                                  |
| D0 킥오프 스택 확정본                        | [`KICKOFF.md`](./KICKOFF.md) (수정 금지)                                                        |
| 화면 흐름·디자인                             | [`DESIGN_FLOW.md`](./DESIGN_FLOW.md)                                                            |
| 작업 일지·과거 컨텍스트                      | [`JOURNAL.md`](./JOURNAL.md)                                                                    |
| PWA→RN 마이그레이션 전체 워크플로우          | [`migration/README.md`](./migration/README.md) — 가이드(하네스·spine·Phase) + 00~05 색인        |
| 팀 공유 결정 노트                            | [`TEAM_SHARE_DECISIONS.md`](./TEAM_SHARE_DECISIONS.md)                                          |
| 사용자 업데이트 공지(릴리스 노트)            | [`release-notes/`](./release-notes/) — `/release-note` 커맨드로 PR 범위에서 생성                |

## 폴더 외부 참조

코딩 행동 원칙·룰은 `docs/`가 아닌 다음 위치에 있습니다:

- 매 세션 인덱스: [`../CLAUDE.md`](../CLAUDE.md)
- 공통 품질 기준: [`./QUALITY_GATE.md`](./QUALITY_GATE.md)
- 에이전트 운영 규칙: [`../.claude/AGENTS.md`](../.claude/AGENTS.md)
- 룰 전체 색인: [`../.claude/rules/INDEX.md`](../.claude/rules/INDEX.md)
- 코딩 스타일·Karpathy 4원칙: [`../.claude/rules/common/coding-style.md`](../.claude/rules/common/coding-style.md)
- 문서 가독성 규칙: [`../.claude/rules/common/doc-readability.md`](../.claude/rules/common/doc-readability.md)

## 문서 작성 규칙

새 문서·리라이팅은 [`../.claude/rules/common/doc-readability.md`](../.claude/rules/common/doc-readability.md)의 체크리스트를 따릅니다.

3개 이상 전문 용어가 등장하는 문서는 맨 아래 `## 용어집` 섹션을 둡니다.
