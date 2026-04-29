# docs/junior/ — 주니어 친화 문서 세트

이 폴더는 `docs/` 아래 공유 문서를 **1년차 주니어 엔지니어도 따라 읽을 수 있도록** 다시 쓴 버전을 담습니다. 원본은 그대로 두고, 주니어판은 여기에 별도로 둡니다.

## 왜 나눠 두었나

- **원본 (`docs/*.md`)**: AI 에이전트(Claude Code · Cursor)가 컨텍스트로 사용. 간결하고 기계 친화적.
- **주니어판 (`docs/junior/*.md`)**: 사람이 읽기 위한 풀어쓴 버전. 용어 풀이, "왜" 설명, 구체 예시, 용어집 포함.

원본과 주니어판은 **같은 결정·같은 규칙**을 담습니다. 내용이 어긋나면 원본이 기준이며, 주니어판을 맞춥니다. 주니어판을 업데이트했다면 원본도 확인하세요(반대도 마찬가지).

## 문서

| 주니어판 | 원본 | 역할 |
|---|---|---|
| [`CLAUDE.md`](./CLAUDE.md) | [`../CLAUDE.md`](../CLAUDE.md) | Claude Code · Cursor 작업 규칙 |
| [`ARCHITECTURE.md`](./ARCHITECTURE.md) | [`../ARCHITECTURE.md`](../ARCHITECTURE.md) | 스택 · 구조 · 아키텍처 원칙 |
| [`KICKOFF.md`](./KICKOFF.md) | [`../KICKOFF.md`](../KICKOFF.md) | D0 킥오프 결과 스냅샷 |
| [`DECISIONS.md`](./DECISIONS.md) | [`../DECISIONS.md`](../DECISIONS.md) | ADR-lite, 되돌리기 비용이 큰 결정 로그 |
| [`VALIDATION.md`](./VALIDATION.md) | [`../VALIDATION.md`](../VALIDATION.md) | Week 2 GO/NO-GO 판정 프레임워크 |
| [`BE_SCHEMA.md`](./BE_SCHEMA.md) | [`../BE_SCHEMA.md`](../BE_SCHEMA.md) | 테이블 · 제약 · 인덱스 · RLS · 상태 전이 |
| [`IDEATION.md`](./IDEATION.md) | [`../IDEATION.md`](../IDEATION.md) | 제품의 "왜" · 페르소나 · 가설 |
| [`ONBOARDING.md`](./ONBOARDING.md) | [`../ONBOARDING.md`](../ONBOARDING.md) | Day 1 세팅 · 개발 규칙 · 배포 |
| [`PRD.md`](./PRD.md) | [`../PRD.md`](../PRD.md) | 유저 스토리 · AC · 데이터 모델 · 이벤트 스키마 |

## 작성 규칙 요약

주니어판의 작성 규칙은 `.claude/AGENTS.md`의 "문서 가독성 · 주니어 친화 작성 규칙" 섹션을 따릅니다. 핵심만 옮기면:

- 한 문장 = 한 개념. 긴 문장은 bullet로 분해.
- 헤딩 바로 아래 1~2줄 도입부 필수.
- 약어·영문 용어는 첫 등장 시 괄호로 풀어쓰고, **문서 맨 아래 `## 용어집`에 다시 모은다** (bullet 형식).
- 결정·금지 사항에는 "왜" 한 줄 필수.
- 외부 섹션 참조(`PRD §5.3` 등) 옆에 그 섹션이 무엇인지 한 줄 요약.
- "당연히/쉽게/누구나" 같은 금기 표현 금지.

## 원본과의 동기화

문서 한쪽을 고쳤다면 다른 쪽도 확인합니다. 특히 다음은 어긋나면 혼란이 큽니다.

- 금액·기간·지표 수치 (DECISIONS, PRD, VALIDATION)
- 테이블 스키마·컬럼 (BE_SCHEMA, PRD §8)
- 명령어·경로 (ARCHITECTURE, ONBOARDING)
- 규칙의 허용/금지 (CLAUDE, ARCHITECTURE, ONBOARDING)
