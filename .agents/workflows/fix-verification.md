# Workflow: fix-verification

## Goal
Verify 실패(red) 또는 리뷰 이슈를 green으로 수정.

## Read First
- 실패한 Verification 로그 · 대상 AT · .agents/engineering/INDEX.md

## Inputs
- red 검증 결과 또는 리뷰 이슈 1~N

## Process
1. 실패 원인 분류: 코드 버그 vs 테스트 오류 vs AT 과대(pass@3).
2. 코드 수정(Non-goals 봉인, surgical).
3. Verification 재실행 → green.
4. 3회 실패 시 분할 신호(create-agent-tasks 재호출, 05 §9.4).

## Output Format
수정 diff + 재검증 결과.

## Stop Condition
- 모든 Verification green + 리뷰 이슈 해소.
- Claude: /check 래퍼 · Codex: 이 파일을 읽고 따름.
