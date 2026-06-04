# Traceability (매트릭스 = 생성물, 체크인 안 함)

> 추적 매트릭스(Test Scenario → PRD AC → Story → eval task → 상태)는 `harness:report`의 **생성 출력**이지 체크인 SoT가 아니다(ADR-0031 §6). 체크인하면 또 하나의 drift 표면이 된다.

## spine 인용 규칙 (원칙 4 — 위로 1줄씩)

Agent Task → Engineering Story → Job Story → PRD AC. 각 노드 frontmatter `Parent`에 상위 1개를 인용한다.

## 매트릭스 생성 규칙 (harness:report가 따름)

- 행 = `evals/tasks/*.md`
- 열 = Track · Parent PRD AC · Parent Story · Status · Verify 통과 여부
- hallucinated-path(resolve 안 되는 인용) = Traceability drift (Tier 1 결정론, `harness:check`)

읽는 주체: `harness:report`(생성) · `harness:check`(인용 resolve 검증).
업데이트 시점: 추적 규칙 변경 (Level 2).
