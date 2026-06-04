# Harness Update Policy (self-maintaining ≠ self-directing, 원칙 8)

하네스는 drift report·update proposal을 만들 수 있으나, 승인 없이 제품 방향·핵심
아키텍처를 바꾸지 못한다. 변경을 3단으로 게이트(Prompt 3 Level 1/2/3 = 05 D6).

## Level 1 — 자동 업데이트 (하네스 자율)
경로명 반영 · package script 이름 반영 · CHANGELOG 업데이트 · 완료 task 상태 ·
traceability 링크 보정. → harness:drift 감지 + apply-harness-update 자동 PR, 사람 머지.

## Level 2 — 제안만 (PR + meta-eval + 사람)
layer 구조 · feature/capability 경계 · task 크기 정책 · 새 dependency 표준 ·
testing strategy. → propose-harness-update가 PR 초안, meta-eval 통과 후 사람 승인.

## Level 3 — 자동 변경 절대 금지 (PO 전용)
PRD goal · MVP scope · 신규 핵심 기능 추가/삭제 · non-goal · 비즈니스 모델 ·
배포 전략 · **eval 수용기준(계약)**. → 하네스는 "PRD는 X, 코드는 Y" 깃발만.

## 비대칭 원칙 (05 §6.1)
코드 ↔ *의도 문서*(PRD/Story) drift = 항상 "코드 의심" 기본값(세탁 경로 없음).
코드 ↔ *서술 문서*(README) drift만 자동 노트 안전.

## meta-eval — 하네스 자기변경 게이트 (D11)
mechanics diff(.agents/** · evals/** · .claude/rules/** · docs/migration/02~05):
1. strengthen | neutral | weaken 분류(결정론).
2. weaken 1건이라도 → ADR + PO 승인 + reason-code, auto-merge 차단. strengthen/neutral 자유.
3. weaken reason-code enum: THRESHOLD_LOWERED · TOLERANCE_WIDENED · EVAL_REMOVED ·
   EVAL_DISABLED · SEVERITY_DOWNGRADED · SOT_PRECEDENCE_RELAXED · AUTONOMY_EXPANDED ·
   APPROVAL_GATE_NARROWED.
4. 같은 reason-code 반복(×3) → 체계적 침식 PO 경보.

## 읽는 workflow / 업데이트 시점
read: propose/review/apply-harness-update.
update: 권한 경계 자체 변경 = Level 2 + meta-eval 자기참조(AUTONOMY_EXPANDED 등).
