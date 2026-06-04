# Release 체크리스트 (게이트)

> 배포 전 통과 게이트. 배포 전략 자체 변경은 PO 전용(Level 3).

- [ ] 모든 Agent Task Stop Condition green
- [ ] `pnpm harness:verify` 통과 (typecheck · lint · test · check)
- [ ] 보존 eval pass^k = 100% (port 트랙)
- [ ] capability eval pass@3 (greenfield 트랙)
- [ ] G1 / G2 게이트 상태 확인 (`.agents/harness/DECISION_NEEDED.md`)
- [ ] Rollback 경로 문서화

읽는 workflow: review-agent-task · Release.
업데이트 시점: 배포 전략 변경 (Level 3 — PO).
