# AI_AGENT_CODE_QUALITY.md

이 문서는 AI 에이전트가 달라도 코딩 품질을 비슷하게 유지하기 위해 2026-05-07에 정리한 대화와 결론을 남긴다.

## 배경

`everything-claude-code`를 활성화했는데도 기대한 에이전트 실행 규칙이 일관되게 적용되지 않았다.
확인 결과 플러그인 자체는 enabled였지만, 로컬 hook disable, 실제 agent 이름과 문서의 agent 이름 불일치, `CLAUDE.md`의 로컬 규칙 include 누락이 함께 있었다.

이 문제를 고치면서 더 큰 질문이 생겼다.

- 어떤 AI 에이전트를 사용해도 코딩 품질이 비슷하려면 어떻게 해야 하는가?
- `everything-claude-code`를 쓰기 위해 명령 래퍼를 비표준화한 것이 잘못된 방향인가?
- 비용 절감을 위해 모델 선택, `/compact`, prompt caching, Grep/Glob 탐색 규칙을 어떻게 문서화해야 하는가?

## 결론

품질 기준은 특정 AI 에이전트나 명령어가 아니라 공통 문서에 둔다.
도구별 명령, hook, subagent 이름, slash command는 그 기준을 실행하는 adapter로만 둔다.

with-key의 공통 기준 원본은 [`QUALITY_GATE.md`](./QUALITY_GATE.md)다.
Claude Code/ECC 관련 문서는 이 기준을 실행하는 도구별 연결 문서다.

## 대화에서 확정한 원칙

### 1. 품질은 wrapper가 아니라 기준 문서가 만든다

명령 래퍼는 실행 편의 도구다.
래퍼가 품질 기준, 금지 사항, 검증 순서를 각자 정의하면 에이전트마다 판단 기준이 달라진다.

따라서 다음 항목은 `QUALITY_GATE.md`를 기준으로 통일한다.

- 성공 기준
- 금지 사항
- 구현 전 확인 항목
- 변경 유형별 검증 명령
- 리뷰 기준
- 작업 종료 보고 형식

### 2. 도구별 문서는 adapter여야 한다

Claude Code, Codex, Cursor 같은 도구는 사용할 수 있는 기능과 문법이 다르다.
그래서 adapter 문서는 필요하다.

다만 adapter가 달라도 아래 항목은 달라지면 안 된다.

- 어떤 상태를 완료로 볼지
- 어떤 아키텍처 위반을 금지할지
- 어떤 테스트와 검증을 요구할지
- 실패/리스크를 어떻게 보고할지

adapter에서 달라도 되는 것은 아래처럼 도구 실행에 필요한 부분뿐이다.

- agent 이름
- slash command 문법
- hook 또는 permission 설정
- 도구별 보고 템플릿의 표현

### 3. everything-claude-code용 wrapper 비표준화는 방향 자체가 틀린 것은 아니다

`everything-claude-code`를 쓰기 위해 Claude 전용 command와 rule을 두는 것은 괜찮다.
문제는 그 wrapper가 공통 기준보다 더 높은 우선순위를 갖거나, 공통 기준과 다른 성공 조건을 갖기 시작할 때 생긴다.

따라서 프로젝트는 다음 구조로 정리한다.

1. `docs/QUALITY_GATE.md`: 모든 AI 에이전트와 사람이 공유하는 품질 기준
2. `AGENTS.md`: 저장소 전체 에이전트 운영 규칙
3. `CLAUDE.md`: Claude Code 세션의 컨텍스트 인덱스
4. `.claude/rules/**`, `.claude/commands/**`: Claude Code/ECC adapter

### 4. agent 실행 규칙은 실제 tool surface와 맞아야 한다

문서가 `planner`, `build`, `plan` 같은 이름을 참조해도 실제 세션에 그런 agent가 없으면 실행되지 않는다.
따라서 command frontmatter와 rule 문서는 실제 `claude agents list`에 존재하는 이름을 사용해야 한다.

현재 정리한 원칙은 다음과 같다.

- ECC agent 이름은 `everything-claude-code:*` namespace를 포함한다.
- 존재하지 않는 bare agent name을 문서에 남기지 않는다.
- Claude가 아닌 에이전트는 Claude 전용 subagent 규칙을 권고로만 해석한다.
- Codex는 사용자가 명시적으로 병렬 에이전트를 요청하지 않는 한 subagent를 생성하지 않는다.

### 5. 비용 절감은 품질 게이트를 낮추지 않는 방식으로 한다

비용 절감은 모델 라우팅, 탐색 범위 축소, 컨텍스트 압축으로 접근한다.
검증 생략이나 리뷰 생략으로 비용을 줄이지 않는다.

정리한 비용 운영 기준은 다음과 같다.

- 기본 코딩 모델은 Sonnet급으로 둔다.
- Opus급 모델은 Plan, 복잡 리팩터, 보안/RLS/아키텍처 판단, 광범위한 장애 분석에 제한한다.
- 단순 요약, 분류, 짧은 문서 정리, 반복 경량 작업은 더 저렴한 모델을 검토한다.
- 탐색은 Grep/Glob/`rg`로 범위를 좁힌 뒤 필요한 파일만 읽는다.
- `/compact`는 200k 같은 고정 토큰 수가 아니라 작업 배치 종료, 주제 전환, 긴 문서/이미지 요약 후, `/context` 70-80% 이상을 기준으로 수행한다.
- 이미지 업로드 후에는 필요한 관찰 사실과 결정 사항을 텍스트로 먼저 남긴 뒤 압축한다.
- 지원 근거가 확인되지 않은 `ANTHROPIC_CACHE_TTL` 같은 환경 변수는 프로젝트 규칙에 추가하지 않는다.

## 적용된 문서 변경

이번 대화의 결론은 아래 파일에 반영됐다.

- [`QUALITY_GATE.md`](./QUALITY_GATE.md): 공통 품질 기준, 명령 래퍼 기준, 비용/컨텍스트 운영 기준
- [`../AGENTS.md`](../AGENTS.md): 저장소 공통 에이전트 운영 규칙
- [`../CLAUDE.md`](../CLAUDE.md): Claude Code 자동 로드 인덱스
- [`../.claude/AGENTS.md`](../.claude/AGENTS.md): 로컬 Claude/ECC 운영 요약
- [`../.claude/rules/common/agents.md`](../.claude/rules/common/agents.md): ECC agent namespace와 사용 기준
- [`../.claude/rules/common/performance.md`](../.claude/rules/common/performance.md): 모델 선택, compact, 탐색 비용 절감
- [`../.claude/commands`](../.claude/commands): command frontmatter의 실제 agent 이름 정리

## 운영 체크리스트

새 AI 도구나 새 command wrapper를 추가할 때 아래를 확인한다.

1. 공통 품질 기준은 `QUALITY_GATE.md`를 참조하는가?
2. wrapper가 성공 기준, 금지 사항, 검증 순서를 새로 정의하지 않는가?
3. tool-specific agent 이름이 실제 세션에서 존재하는가?
4. 검증 명령은 변경 유형에 맞게 유지되는가?
5. 비용 절감 규칙이 테스트/리뷰 생략으로 흐르지 않는가?

## 용어집

- **Adapter**: 공통 기준을 특정 도구에서 실행하기 위한 얇은 연결 문서나 명령이다.
- **ECC**: `everything-claude-code` plugin을 가리키는 약칭이다.
- **Quality Gate**: 변경을 완료로 보기 전에 통과해야 하는 성공 기준, 금지 사항, 검증 기준이다.
- **Wrapper drift**: 도구별 wrapper가 각자 다른 성공 기준이나 검증 순서를 갖게 되어 품질 기준이 흩어지는 현상이다.
