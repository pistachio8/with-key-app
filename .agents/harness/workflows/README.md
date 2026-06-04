# .agents/harness/workflows/ — 하네스 유지보수 메타 워크플로 전용

> 이 디렉토리는 하네스가 **자기 자신을 점검·갱신**하는 메타 워크플로만 둔다. 제품을 만드는 워크플로는 여기가 아니다.

## 여기에 두는 것 (4개)

- `check-harness-drift.md` · `propose-harness-update.md` · `review-harness-update.md` · `apply-harness-update.md`

자기유지 흐름 전체는 [../HARNESS_MAINTENANCE.md](../HARNESS_MAINTENANCE.md).

## 여기에 두지 않는 것

제품 파이프라인 워크플로(PRD·Story·Work Package·Agent Task의 생성/분해/구현/리뷰)는
**[../../workflows/](../../workflows/)** 에 둔다 — 도구 중립 절차 SoT(9). 매핑은 [../../README.md](../../README.md).

> **왜**: 이름이 비슷한 두 워크플로 디렉토리(`workflows/` vs `harness/workflows/`)가 있어,
> 제품 워크플로를 실수로 여기에 두면 SoT가 갈라진다. 새 워크플로를 추가하기 전에
> "제품을 만드나(→ `../../workflows/`) / 하네스를 고치나(→ 여기)"를 먼저 판단할 것.
