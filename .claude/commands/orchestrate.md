---
description: 자연어 요청을 분류해 적절한 하네스 워크플로로 라우팅하는 오케스트레이터
---

> **역할**: 이 파일은 [`../../.agents/workflows/route-request.md`](../../.agents/workflows/route-request.md)를 Claude Code에서 실행하는 얇은 어댑터다. 절차·정책의 SoT(Single Source of Truth)는 그 워크플로 문서이며, 본문을 여기에 복제하지 않는다([ADR-0031](../../docs/adr/0031-harness-structure-agents-home.md)).
> **전제**: `with-key` 저장소 루트에서 실행한다.

너는 이 턴에서 **오케스트레이터(관리자)** 다. 직접 코드를 많이 고치지 말고, "이 요청이 어떤 종류인지 판단하고 어느 워크플로로 보낼지" 를 결정한다.

## 절차 (매 턴)

1. 사용자 자연어 요청을 받는다 (이 명령의 인자, 없으면 직전 사용자 메시지).
2. 1차 분류를 본다.
   - `pnpm harness:route "<요청>"`
3. **분류 확인 (안전밸브)**
   - 출력이 `"ambiguous": true` 이거나 confidence < 0.6 이면 **자동 진행 금지**.
   - "이 작업은 `<타입>` 으로 보이는데 맞나요?" 를 사용자에게 먼저 묻는다. 키워드 분류는 brittle 하므로 확인 없이 실행하지 않는다.
4. 확정되면 run 기록을 남기고 인계 계획을 만든다.
   - `pnpm harness:intake "<요청>"`
   - 출력의 `targetWorkflow` 가 가리키는 기존 워크플로 절차를 따른다.
5. **첫 사람 게이트에서 정지·보고** (D6: push · PR · merge · spec · adr · po). 무인이라도 outward 행위는 사람 몫.

## 인계 후 흐름 (task 로 들어간 뒤)

분류가 구현형(bugfix/feature/improvement)이고 task 가 없으면 `create-agent-tasks` 로 만든 뒤:

```bash
pnpm harness:next → pnpm harness:claim <EVAL-ID> → pnpm harness:goal <EVAL-ID>
```

이후는 [`../../.agents/workflows/orchestrate-backlog.md`](../../.agents/workflows/orchestrate-backlog.md) 1 tick 모델과 동일하다.

## 보고 형식

- 분류 결과(타입 · confidence · workflow · nextState)
- 도메인 후보 · risk
- 다음에 사람이 할 일(분류 확인 / task 생성 / claim / push 게이트)

## 금지

- 분류가 모호한데 사용자 확인 없이 워크플로를 실행하는 것
- `harness-improvement` 를 meta-eval·human approval 없이 자동 반영하는 것 (테스트 완화·reviewer 제거·human gate 제거·SoT 우선순위 변경은 자동 승인 금지)
- 자동 push / PR 생성 / merge (D6 사람 게이트)
- `route-request.md` 본문을 이 파일에 복제하는 것 (SoT 이중화)
