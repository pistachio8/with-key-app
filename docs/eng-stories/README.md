# docs/eng-stories/

Engineering Story의 집(05 D10). "[결과]를 위해 시스템은 [기술 변경]을 해야 한다, [제약] 때문에" — 시스템 언어 작업-서사. 1 Engineering Story → N Work Package.

## 왜 별도 디렉토리

`docs/stories/`(Job Story = 사용자 의도)와 대칭. "Job ≠ Engineering ≠ Agent Task"(05 §1)를 물리적으로 보존한다. Work Package는 파일이 없으므로(D5) Engineering Story가 spine에서 Work Package 바로 위의 유일한 서사 노드 — 자기 집이 필요하다.

## 템플릿 / 생성

- 템플릿 SoT: [`../../.agents/pm/templates/ENGINEERING_STORY_TEMPLATE.md`](../../.agents/pm/templates/ENGINEERING_STORY_TEMPLATE.md)
- 생성: `pnpm new eng-story <topic-kebab>`

## grandfather

[`../migration/00-rn-conversion-plan.md`](../migration/00-rn-conversion-plan.md) · [`../migration/04-rn-architecture.md`](../migration/04-rn-architecture.md)는 "프로젝트 전체 Engineering Story"로 grandfather(이미 쓰인 foundational 서사). 앞으로의 _기능별_ Engineering Story만 여기 추가한다.

## 추적성

PRD AC 상향 인용 + spec/ADR 직교 인용 + Work Package spawn. 인용은 `harness:check`가 resolve 검증한다(hallucinated-path = Traceability drift).

## See also

- 두 축 개념 모델: [`../migration/05-rn-harness-decisions.md`](../migration/05-rn-harness-decisions.md) §1
- 구조 결정: [`../adr/0031-harness-structure-agents-home.md`](../adr/0031-harness-structure-agents-home.md)
