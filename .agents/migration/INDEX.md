# Migration INDEX (포인터 — 03 = 전환 규칙 SoT)

> RN 전환 규칙의 SoT를 가리킨다. 본문 복제 금지(ADR-0031).

- 전환 규칙 SoT(레이어별): `docs/migration/03-rn-migration-rules.md`
- 인벤토리(무엇을 재사용/재작성하나): `docs/migration/00-rn-conversion-plan.md`
- 하네스 결정(D1~D12): `docs/migration/05-rn-harness-decisions.md`

## 규율

- **port / greenfield 비혼합**(원칙 9·D2): 포팅 AT와 신기능 AT를 다른 파일로 둔다. 혼합 금지 — 보존 eval 적용 트랙이 갈리므로 한 파일에 섞으면 회귀가 샌다.

읽는 workflow: create-agent-tasks(port) · implement-agent-task.
업데이트 시점: 03 갱신·매핑 추가 시 (Level 2).
