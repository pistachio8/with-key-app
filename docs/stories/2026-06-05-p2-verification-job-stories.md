---
job-story: 2026-06-05-p2-verification
title: P2 사진 자동검증 — Job Stories
author: pistachio8
date: 2026-06-05
status: draft
---

# Job Stories: P2 사진 자동검증

> "When [상황], I want to [동기], so I can [결과]." 사용자 언어(감정·상황) — 테이블·RPC 같은 시스템 용어는 [Engineering Story](../eng-stories/2026-06-05-photo-verification.md)로 분리(05 §1.2 경계).
> Source: pm-execution:write-stories (job format · Plugin Mode normalize 2026-06-05, raw: `.agents/pm/raw/2026-06-05-p2-verification-job-stories.raw.md`).

## Parent / Track

- PRD: [docs/migration/01-rn-mvp-prd.md](../migration/01-rn-mvp-prd.md) §5.B
- Track: **greenfield** · blocked-by: **G1**(부정탐지 임계 θ — `AC-auto-verify-*`·`AC-cheat-detect-*`만 해당, `AC-peer-reject-*`·`AC-owner-load-*`은 게이트 무관). DECISION_NEEDED `G1-θ`.

> **P2 = 자동 부정탐지**(확정 2026-06-02): 사진은 "운동했다"를 증명할 수 없으므로 기본은 통과(친구 신뢰), 명백한 부정만 자동 차단. 애매한 건 통과 또는 사람 검토.

---

### JS-verify-1 — 승인 기다림 없이 바로 카운트, 가짜만 걸러진다

`Parent: PRD-AC-auto-verify-1, auto-verify-2, auto-verify-3, auto-verify-4`

- **When** 운동을 막 끝내고 인증 사진을 올렸을 때,
- **I want to** 누군가의 승인을 기다리지 않고 바로 내 인증이 카운트에 잡히고, 명백한 가짜만 걸러지길,
- **so I can** 친구를 믿는 분위기에서 매끄럽게 인증하면서도 부정은 따로 걸러진다는 안심을 얻는다.

### JS-verify-2 — 잘못 올린 사진을 마감 전 한 번 바로잡는다

`Parent: PRD-AC-auto-verify-5`

- **When** 인증 사진을 잘못 올린 걸 마감 전에 알아챘을 때,
- **I want to** 마감 전 딱 한 번 사진을 바로잡고,
- **so I can** 단순 실수로 억울하게 인증을 날리지 않는다.

### JS-verify-3 — 재탕·캡처 사진이 통하지 않는다는 공정함 (P2 핵심)

`Parent: PRD-AC-cheat-detect-1, cheat-detect-2`

- **When** 친구들과 벌금을 걸고 챌린지를 할 때,
- **I want to** 남이 예전 사진을 재탕하거나 딴 데서 캡처한 사진으로 인증을 통과시키지 못한다고 믿고,
- **so I can** 나만 정직하게 운동하고 손해 보는 게 아니라는 공정함을 느낀다.

### JS-verify-4 — 올리기 전에 안 될 사진은 미리 알려준다

`Parent: PRD-AC-cheat-detect-3`

- **When** 인증 사진을 고르거나 찍어서 올리려 할 때,
- **I want to** 흐리거나 스크린샷 같은 명백히 안 될 사진은 올리기 전에 미리 알려주길,
- **so I can** 헛되이 올렸다 거절당하는 일 없이 바로 다시 찍는다.

### JS-verify-5 — 수상한 인증을 그룹이 함께, 익명으로 거른다

`Parent: PRD-AC-peer-reject-1, peer-reject-2, peer-reject-3, peer-reject-4`

- **When** 친구의 인증이 보기에 명백히 수상할 때,
- **I want to** 그룹장 혼자가 아니라 우리 그룹이 함께, 그것도 익명으로 그 인증을 걸러내고,
- **so I can** 누구 하나 미워지는 일 없이 공정하게 부정을 거른다.

### JS-verify-6 — 그룹장은 일일이 확인 안 해도, 혼자 판정 안 해도 된다

`Parent: PRD-AC-owner-load-1, owner-load-2, owner-load-3`

- **When** 그룹장으로서 챌린지를 운영할 때,
- **I want to** 인증마다 일일이 확인하지 않아도 되고 부정 판단을 나 혼자 짊어지지도 않길,
- **so I can** 운영 부담과 친구 사이 껄끄러움 없이 챌린지에 집중한다.

---

> **Story Map**: 반드시(JS-verify-1·3) → 있어야(JS-verify-5·6) → 있으면 좋음(JS-verify-2·4).
> 측정 가능한 수용 기준의 SoT는 [PRD §5.B](../migration/01-rn-mvp-prd.md)(AC-auto-verify·cheat-detect·peer-reject·owner-load). 검증 시나리오는 greenfield 신규 기능이라 **Agent Task eval 수용기준으로 흡수**(05 §2 D10 — Test Scenarios는 별도 SoT 미신설). raw·엣지케이스: `.agents/pm/raw/2026-06-05-p2-verification-job-stories.raw.md`.
