---
job-story: 2026-06-05-p1-settlement
title: P1 포인트 보증금 정산 — Job Stories
author: pistachio8
date: 2026-06-05
status: draft
---

# Job Stories: P1 포인트 보증금 정산

> "When [상황], I want to [동기], so I can [결과]." 사용자 언어(감정·상황) — 테이블·RPC 같은 시스템 용어는 [Engineering Story](../eng-stories/2026-06-05-points-settlement.md)로 분리(05 §1.2 경계).
> Source: pm-execution:job-stories (Plugin Mode normalize 2026-06-05, raw: `.agents/pm/raw/2026-06-05-p1-settlement-job-stories.raw.md`).

## Parent / Track

- PRD: [docs/migration/01-rn-mvp-prd.md](../migration/01-rn-mvp-prd.md) §5.C
- Track: **greenfield** · blocked-by: **G2**(법무) — 단 불변식(`AC-deposit-hold-5`)은 즉시 활성.

---

### JS-settle-1 — 서약할 때 진짜 잃을 포인트가 잠긴다

`Parent: PRD-AC-deposit-hold-1, deposit-hold-2`

- **When** 친구들과 새 챌린지에 서약하려 할 때,
- **I want to** 내가 약속을 못 지키면 실제로 잃게 될 포인트가 미리 잠기는 걸 보고,
- **so I can** "표시만"이 아니라 진짜 손해가 걸렸다는 압박을 느끼고 끝까지 한다.

### JS-settle-2 — 진행 중 깎일 위기를 한눈에 본다

`Parent: PRD-AC-deposit-gauge-1`

- **When** 챌린지가 진행되는 동안,
- **I want to** 지금 내 보증금이 얼마나 깎일 위기인지 한눈에 보고,
- **so I can** 더 늦기 전에 오늘 운동을 해서 잃을 포인트를 줄인다.

### JS-settle-3 — 끝나면 돌려받고, 미달분은 다음 밑천이 된다

`Parent: PRD-AC-settle-1, settle-3`

- **When** 챌린지가 끝났을 때,
- **I want to** 약속을 지킨 만큼 보증금을 돌려받고, 못 지킨 사람들의 미달분이 우리 그룹 다음 챌린지 밑천으로 쌓이는 걸 보고,
- **so I can** 끝까지 한 보람을 느끼고 다음에도 같이 한다.

### JS-settle-4 — 그룹장은 "정산" 한 번, 깜빡해도 자동

`Parent: PRD-AC-settle-trigger-1, settle-trigger-2`

- **When** 그룹장으로서 챌린지를 마쳤을 때,
- **I want to** "정산" 한 번으로 끝내고, 깜빡해도 알아서 처리되길 원해서,
- **so I can** 정산 부담 없이 다음 챌린지에 집중한다.

### JS-settle-5 — 돌려받은 포인트를 다음에 쓴다

`Parent: PRD-AC-points-use-1, points-use-2`

- **When** 정산이 끝나 포인트를 돌려받았을 때,
- **I want to** 그 포인트를 다음 챌린지 보증금이나 (나중에) 구독 할인에 쓰고,
- **so I can** 번 포인트를 헛되이 묵히지 않고 계속 참여할 동기를 얻는다.

---

> 각 JS의 측정 가능한 수용 기준은 [acceptance-criteria.md](./acceptance-criteria.md), 검증 시나리오는 [test-scenarios.md](./test-scenarios.md) 참조.
