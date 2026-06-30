---
plan: 2026-06-26-rollout4-subagent-isolation-probe
title: Rollout4 Subagent Isolation Probe
author: pistachio8
date: 2026-06-26
status: draft
---

## 목표

[headless-substrate-transition spec](2026-06-26-headless-substrate-transition.md) §검증 보완의 마지막 미해결 — **"확정 이득(긴 task 컨텍스트 위생)이 데이터에 미관측"** — 을 닫을 **측정 프로토콜**을 설계한다. 8-컴포넌트(C1~C8) 헤드리스 전환에 비용을 쓰기 _전에_, spec [Alternatives #4](2026-06-26-headless-substrate-transition.md#4-inline-오케스트레이터--구현-step만-서브에이전트task-도구-격리-서브-리뷰-발굴--무비용-대안)의 **무비용 서브에이전트 격리**로 컨텍스트 위생 이득의 **실재성**을 먼저 잰다.

- **이 plan은 설계까지다.** probe 실행(아래 §작업 단계 1~5)은 별도 사용자 go 게이트. 본 문서는 "어떻게 측정할지"만 박는다.
- **probe는 비게이트다.** 서브에이전트 격리는 이미 repo 표준 패턴([common/agents.md](../../../.claude/rules/common/agents.md) §다중 관점 분석)이고, `.agents/**` 머시너리·test·reviewer·SoT를 건드리지 않는다 → `AUTONOMY_EXPANDED` 침식 카운터(현재 2/3)를 **태우지 않는다**. 8-컴포넌트 *착수*만 게이트 대상.

## 영향 범위

- 변경 경로: 문서 + 측정 instrument 1개 — 본 plan + `scripts/probe-context-footprint.mjs`(단계 1 산출, 아래) + (실행 시) `evals/retro-reports/` 또는 `evals/` 하위 측정 리포트. **`src/**`·`apps/**` 무관**, `.agents/**` 머시너리 무변경. 파서는 `~/.claude/projects/**` 세션 로그만 읽는 read-only 측정기라 앱·DB·CI 무영향(package.json wire-up 없음, 직접 호출 전용).
- 데이터/RLS 영향: 없음.
- 외부 서비스: 없음 — 서브에이전트는 인-세션 Task 도구라 `claude -p` spawn·Codex auth·헤드리스 인프라가 전부 불필요(무비용의 근거).
- 재사용 후보:
  - [common/agents.md](../../../.claude/rules/common/agents.md) — 서브에이전트 fan-out·다중관점 패턴(treatment arm 위임 방식의 SoT)
  - `improve-token-efficiency` 스킬 — 세션 JSONL 로그 파싱(compaction·토큰 집계의 측정 도구 후보)
  - `evals/results/agent-results.json` `runs[]` — 결과 지표(abandon·pass@1·attempts·review) 기존 집계

## 핵심 가설과 premise-defeater

probe가 가르려는 세 갈래. **측정의 1차 표적은 H1이 아니라 premise-defeater다** — 이걸 못 가르면 8-컴포넌트는 "예상된 문제" 위에 선다.

- **H1 (이득 가설)**: 구현 step을 fresh 서브에이전트로 격리하면 implementer 컨텍스트는 _구조적으로_ 매번 새 윈도를 받는다 → 긴 task의 context-rot(컨텍스트 누적·열화)가 implementer 측에서 제거되고 **순(net) 컨텍스트 footprint가 준다**.
- **H0 (귀무 가설)**: 현행 task 크기에선 control(inline) arm조차 context-rot가 발생하지 않는다 → **풀 문제 자체가 없다**. 근거: [회고 2026-06-26](../../../evals/retro-reports/2026-06-26-retro.md) §3-1 실측 — abandon **0/31** · pass@1 **29/31** · attempts>1 **0/31**. context-rot·열화·재시도가 1건도 surfacing되지 않았다.
- **premise-defeater (이사 가설 — G3 연결)**: 서브에이전트로 implementer는 격리되지만 **오케스트레이터(감독 메인 LLM)** 컨텍스트가 배치 전체에 걸쳐 누적되면, context-rot는 implementer→오케스트레이터로 **이사**만 할 뿐이다. 그러면 spec [ADR-0042 §부정적/비용](../../adr/0042-harness-execution-substrate-process-vs-inline.md)의 비용 6종(멀티세션 복잡도·worktree 디스크·index.json SoT 표면·공유 Supabase 비결정성·이득 이연·Codex 이중화)은 그대로 남고 **순이득 0**. **왜 1차 표적인가**: H1은 implementer만 보면 항상 참이라 자명하다. 전환을 정당화하는 건 implementer 격리가 아니라 _시스템 전체_ footprint 감소이고, 그건 오케스트레이터가 bounded일 때만 성립한다.

## 실험 설계 — treatment vs control

같은 substrate를 두 arm으로 대조한다. 한 task를 두 번 돌리면 2회차가 1회차 학습을 누리므로(오염), **task 짝맞춤 또는 자연 stream 교차 배정**으로 이질성 confound를 완화한다.

- **Control arm (inline · 현행 기질)**: `harness:next` 1-tick을 메인 세션 inline으로 구현([orchestrate-backlog.md](../../../.agents/workflows/orchestrate-backlog.md) §실행 2). 현행 baseline 그대로.
- **Treatment arm (서브에이전트 격리)**: 오케스트레이터(메인)가 구현 step을 **fresh 서브에이전트(Task 도구)** 에 위임 → 서브에이전트는 자기 윈도에서 구현하고 **최종 리포트만 회수** → 오케스트레이터가 `pass@3`을 **재실행**해 외부 oracle 보존(spec C2 미니어처). 서브에이전트엔 push/PR 도구가 없어 D6 사람 게이트도 자동 보존.
- **배정**: ready 폭에서 유사 크기·도메인 task를 짝지어(matched pair) arm을 교차 배정하거나, RN migration 자연 task stream에 arm을 번갈아 부여하고 분포를 비교. **표본은 작다** — 회고 경고(17건 기준 비율은 단건에 ±6%p) 상속, 결론은 *방향 신호*까지만.

## 측정 지표 — 무비용 proxy

메인 LLM의 주관("context-rot를 느꼈다")은 **무효**. 객관 proxy만 채택한다.

### Primary — 컨텍스트 footprint (implementer ↔ orchestrator 분리 측정)

이사 가설을 가르려면 두 측을 _따로_ 잰다.

| 지표                                    | 측정 대상                       | 출처                               |
| --------------------------------------- | ------------------------------- | ---------------------------------- |
| compaction 발생 횟수                    | implementer · orchestrator 각각 | 세션 JSONL(자동 compaction 이벤트) |
| context-window high-water-mark(최고치)  | implementer · orchestrator 각각 | 세션 JSONL 토큰 추이               |
| 판정시점 토큰(tokens-at-decision-point) | oracle 재실행·리뷰 화해 진입 시 | 세션 JSONL                         |

- **relocation check(핵심)**: 배치 N task에서 **오케스트레이터 context HWM가 bounded(평탄)인가, 선형 성장인가**. 선형이면 premise-defeater 발동.
- 측정 도구: **전용 JSONL 파서(~30줄)** — `improve-token-efficiency` 스킬은 비용·캐시 효율만 뽑고 위 세 proxy를 노출하지 않는다(2026-06-26 검증, 아래 §단계 1 검증 결과). 원천 `usage` 필드로 셋 다 계산 가능함이 실측됐다.

### Secondary — 결과 지표 (이미 `runs[]`에 있음)

abandon · pass@1 · attempts · review verdict. **단 near-ceiling이라 headroom이 거의 없다**(회고 §3-1) — treatment가 이걸 개선해도 통계적으로 잡히기 어렵다. 그래서 secondary이고, primary footprint proxy가 주판단이다.

## 판정 규칙 — 8-컴포넌트 정당화/기각

probe 결론은 셋 중 하나로 수렴해야 한다(애매 종료 금지).

- **A. 이득 실재**: treatment 순 footprint가 유의하게 ↓ **그리고** 오케스트레이터 HWM bounded → 컨텍스트 위생 이득이 _실재_ → 8-컴포넌트의 **위생 전제만** 검증됨. (나머지 이득=진짜 N-worktree 병렬·multi-tool·헤드리스 배치는 probe 범위 밖 — 별도 평가 필요.)
- **B. 이사(relocation) 확인**: 오케스트레이터 HWM가 선형 성장 → 순이득 0 → 위생 정당화 **실패** → 8-컴포넌트 헤드리스 전환 defer 또는 kill(감독자 컨텍스트도 격리하는 spec G3 ② "별도 헤드리스 화해 step" 없이는 무의미).
- **C. 문제 부재**: 양 arm 모두 compaction 0·context-rot 미발생(현 task 크기) → **풀 문제가 없다** → RN migration이 더 긴 task를 가져올 때까지 defer. spec이 "예상된 문제" 위에 섰음을 데이터로 확증.

## probe ≠ 전환 — 범위 한정

- probe는 서브에이전트(메인 세션 종속)라 **진짜 N-worktree 병렬·multi-tool·헤드리스 배치는 검증하지 못한다**. 오직 **컨텍스트 위생 전제**만 잰다(spec Alt #4 "Why not (정확히)" 보존).
- 그래도 충분한 이유: spec C3·G1이 **throughput을 이미 포기**했으므로(이득은 ① 컨텍스트 위생 ② 게이트까지 wall-clock뿐), probe가 못 주는 병렬 이득은 _어차피 안 주기로 한 것_. probe는 spec이 *확정 이득*이라 부른 단 하나(위생)의 실재성만 표적한다.
- **거버넌스**: probe 자체는 Level 1 미만(읽기·측정·문서). 8-컴포넌트 _착수_ = `HEADLESS-SUBSTRATE-IMPL`(`AUTONOMY_EXPANDED` 2/3)만 PO 게이트. probe 결과는 그 게이트의 **PO 입력 증거**로 들어간다.

## 작업 단계

**이번 턴은 설계까지. 아래 1~5 실행은 별도 사용자 go.**

1. ~~**측정 도구 선결 확인**~~ — **완료(2026-06-26, 아래 §단계 1 검증 결과)**. 세 지표 모두 원천 JSONL `usage`/`compact_boundary`에서 계산 가능 확인. 단 도구는 `improve-token-efficiency` 스킬이 아니라 **전용 파서** — `scripts/probe-context-footprint.mjs` 구현·검증 완료. 잔여 ⚠️(서브에이전트 usage 위치)도 해소(아래 검증 결과 표·결론).
2. ~~**task 표본 선정**~~ — **완료(2026-06-26, 아래 §단계 2 결과)**. 오늘 ready 백로그로는 viable matched pair 부재(1 READY + 1 unblock 후보, 도메인·크기 불일치) → 최적 pair 후보·자연-stream 대안 식별.
3. **arm 실행 프로토콜 문서화** — treatment 서브에이전트 위임 형태(common/agents.md 인라인) + oracle 재실행 책임 명시. — 검증: 1개 task로 protocol smoke(서브에이전트 위임 → 리포트 회수 → 오케스트레이터 pass@3 재실행 1회 완주).
4. **측정·집계** — 양 arm 실행, primary/secondary 지표 수집 → `evals/` 측정 리포트. — 검증: §판정 규칙 A/B/C 중 하나로 결론.
5. **8-컴포넌트 재평가 인계** — 결론을 `HEADLESS-SUBSTRATE-IMPL`([DECISION_NEEDED.md](../../../.agents/harness/DECISION_NEEDED.md)) PO 입력으로 부기. — 검증: PO 게이트에 probe 증거 첨부.

## 단계 1 검증 결과 (2026-06-26 — 선결 Blocker 해소)

과거 세션 JSONL(`~/.claude/projects/-Users-ian-gitlab-with-key/*.jsonl`, 588개 중 usage 보유 213개)을 직접 파싱해 세 proxy의 측정 가능성을 실측했다.

| proxy                         | 가능?               | 출처 / 실측                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ----------------------------- | ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| context HWM                   | ✅ 직접             | assistant 메시지 `message.usage`(`input_tokens`+`cache_read_input_tokens`+`cache_creation_input_tokens`)의 turn별 최대. 213 세션 분포: 중앙값 **164k** · p90 **337k** · 최대 **489k**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| compaction 횟수               | ✅ 명시 마커        | `type:"system"`·`subtype:"compact_boundary"` 레코드의 `compactMetadata{trigger, preTokens, postTokens}`. 전/후 토큰까지 노출(예: preTokens 150164→postTokens 11472)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| 판정시점 토큰                 | ✅ 계산             | 모든 assistant turn에 usage 존재 → 판정 turn을 식별해 그 usage를 읽으면 됨                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| orchestrator↔implementer 분리 | ✅ 확정(2026-06-26) | **잔여 ⚠️ 해소.** `isSidechain:true` 는 전 코퍼스 **0/1361**(모든 repo) — 이 CLI 버전은 sidechain transcript 를 쓰지 않는다(서브에이전트 usage 는 "별도 세션 파일"이 아니다). 서브에이전트(`Agent` 도구) usage 는 **부모 세션의 `Agent` tool_result `toolUseResult`** 에 *집계*로 실린다: `agentType`·`resolvedModel`·`status`·`totalTokens`·`usage`. 따라서 implementer 내부 turn 곡선은 미기록이나 **위임당 집계 footprint 는 측정 가능**(실측 예: 멀티-리뷰어 세션에서 migration 75292·frontend 82189·backend 102510 토큰). `~/.claude/tasks/<uuid>/N.json` 은 TaskCreate/TaskUpdate todo-추적이지 transcript 가 아님(혼동 주의). relocation 의 결정적 측(orchestrator bounded?)은 메인 turn 으로 측정 |

**결론 — Blocker 해소(측정 가능), 단 plan 2가지 보정:**

1. **측정 도구 = 전용 파서(구현 완료).** `improve-token-efficiency` 스킬은 비용·캐시 효율(input/cache/output·cost·redundant_reads)만 집계하고 위 proxy를 노출하지 않는다. 원천 `usage`/`compact_boundary`/`toolUseResult`를 읽는 파서 `scripts/probe-context-footprint.mjs`(약 60줄, 주석 포함)가 올바른 instrument다. **검증**: 코퍼스 전체(214 세션) HWM 분포가 본 표 실측과 일치 재현(median **164233** · p90 **336793** · max **489470**) + detail 모드가 turn별 곡선·slopePerTurn·compaction·서브에이전트 집계를 한 번에 출력함을 확인. 사용: `node scripts/probe-context-footprint.mjs <session.jsonl>`(단일=detail), 인자 없으면 with-key 프로젝트 전체 + 분포 요약(stderr).
2. **1차 proxy = HWM/축적 곡선 (compaction 횟수는 보조).** 213 세션 전체에서 compaction은 **1건뿐, 그마저 `trigger:"manual"`** — auto-compaction은 0건. 이는 task가 짧아서가 아니라 **1M 컨텍스트 모델이라 489k peak에도 auto-compact 임계에 안 닿기** 때문(축적 임계 ≫ 관측 최대치). 따라서 "compaction 발생"은 신호가 거의 없고, **얼마나 차오르는가(HWM·축적 속도)** 가 더 robust한 컨텍스트-위생 proxy다. compaction 마커는 _발생 시_ 보조 확증으로만 쓴다.

> **선제 신호(판정 C 쪽)**: 실사용 213 세션에서 auto-compaction 0건이지만 context 축적은 실재(p90 337k). 즉 _lossy compaction_(손실 압축)은 안 일어나도 _raw accumulation_(누적)은 일어난다 — "no compaction ≠ no context-rot". probe는 이 둘을 구분해 측정해야 한다.

## 단계 2 결과 (2026-06-26 — task pair 선정)

`pnpm harness:next` 실측 백로그(53 task 검사): **READY 1 · unblock 후보 1 · human-gate blocked 4 · 나머지 done/task-dep blocked**.

### 후보 task 크기·도메인 추정

| task      | 상태                                              | 도메인           | Target Files(교집합 판정용)                           | 새 dep/폴더                    | 크기 추정                                                                |
| --------- | ------------------------------------------------- | ---------------- | ----------------------------------------------------- | ------------------------------ | ------------------------------------------------------------------------ |
| EVAL-0049 | **todo(READY)**                                   | web PWA frontend | action `_components`(dialog·form·spec) 3              | 없음                           | **S** — 3파일 편집. 단 **PO·디자인 합의 선행 게이트**(미도달 시 blocked) |
| EVAL-0052 | blocked→**unblock 후보**(0051 done, flip 사람 몫) | RN mobile push   | `capabilities/push-notification` 신설·`_layout`·BFF 3 | expo-notifications + 신설 폴더 | **M~L**                                                                  |
| EVAL-0053 | blocked-by 0052                                   | RN mobile push   | `capabilities`·`_layout`·`app.config` 3               | 폴더 재사용                    | **M**                                                                    |
| EVAL-0054 | blocked-by 0053                                   | RN mobile UI     | `capabilities`·`(tabs)/_layout`·`(tabs)` 3            | 새 탭 화면                     | **M**                                                                    |
| EVAL-0055 | blocked-by 0052                                   | RN mobile UI     | `features/profile`·`(tabs)/me.tsx` 2                  | 없음                           | **S~M**                                                                  |

### 판정 — 오늘 ready 백로그로는 viable matched pair 부재

- **유일 READY(0049) ↔ 유일 unblock 후보(0052) = 짝 부적격**: ① 도메인 불일치(web PWA dialog vs RN Expo push), ② 크기 불일치(3파일 편집 vs 새 dep·폴더·BFF), ③ 게이트 confound(0049 PO·디자인 합의 / 0052 사람 flip 대기) — arm 차이가 substrate 가 아니라 게이트 stall 로 오염. Target Files 교집합은 ∅ 이나 그 한 기준만 충족.
- **이 부재 자체가 신호**다 — 회고 §3-1(near-ceiling·얇은 백로그)와 정합. matched-pair 는 백로그 폭이 ≥2 동일도메인·유사크기·비게이트일 때만 성립한다.

### 권고 — 두 경로(둘 다 0052 선결)

1. **최적 matched-pair 후보 = EVAL-0053 + EVAL-0055** (EVAL-0052 완료 후). 둘 다 RN/port·둘 다 0052 _단독_ 의존이라 **동시 unblock**, 파일 비커플링(0053=`capabilities`·`_layout`·`app.config` ∩ 0055=`features/profile`·`me.tsx` = **∅**), 유사 크기(spec ~99줄·target 2~3). 잔여 이질성: 핸들러 로직 vs 설정 UI(완전 동일 불가 — stratify 로 완화).
2. **더 robust = 자연-stream arm 교차**(plan §실험 설계). 클러스터 0052→{0053,0055}→0054 는 시퀀셜/트리 의존이라 진짜 동시 병렬은 제한적 → 강제 pair 대신 ready 도달 순서대로 arm 을 번갈아 배정하고 분포 비교. 얇고 시퀀셜한 현 백로그엔 pair 보다 이쪽이 편향이 적다.

> **probe 착수 선결**: 두 경로 모두 **EVAL-0052 완료**가 전제다(0053·0055 의 유일 blocker). 따라서 probe _실행_(단계 3~5)은 0052 가 done 된 뒤 RN notification 스트림에서 개시한다. 0052 자체를 control arm 의 첫 표본으로 쓰는 것도 가능(자연-stream 교차의 시작점).

## 검증

```bash
pnpm validate:docs
```

설계(본 문서) 검증은 링크 무결성까지. probe *실행*의 검증은 §판정 규칙(A/B/C 수렴)이 대신한다.

수동 확인 항목(해당 시):

- [ ] ~~모바일 viewport~~ — 해당 없음(문서·머시너리 측정, src 무관)
- [ ] ~~인증 플로우~~ — 해당 없음
- [ ] ~~migration 재적용~~ — 해당 없음

## 리스크 / 미해결

- ~~**측정 도구 미검증(선결 리스크)**~~ — **완전 해소(2026-06-26)**. 세 proxy 모두 원천 JSONL에서 계산 가능 + **전용 파서 `scripts/probe-context-footprint.mjs` 작성·검증 완료**(코퍼스 분포 재현) + **서브에이전트 usage 위치 확정**(부모 세션 `Agent` tool_result `toolUseResult` 집계, sidechain 미사용 0/1361). 잔여 없음.
- **서브에이전트 내부 곡선 미기록(잔여 측정 한계)** — sidechain transcript 부재로 implementer 의 _내부_ HWM 곡선·compaction 은 못 잰다(위임당 _집계_ totalTokens 만 가능). 단 서브에이전트는 설계상 fresh 윈도 단발이라 내부 HWM ≈ totalTokens peak, compaction 가능성 희박 → relocation 판정(orchestrator bounded?)엔 무영향. probe 의 treatment footprint 는 집계로 충분.
- **probe 착수가 EVAL-0052 에 게이트됨(단계 2 신규)** — 권고된 두 경로(0053+0055 pair · 자연-stream) 모두 0052 완료가 선결. 0052 는 현재 사람 flip 대기(unblock 후보). 즉 단계 3~5 실행은 0052 done 이후로 자연 지연된다.
- **작은 N** — 회고 경고 상속(±6%p). 결론은 통계적 단정이 아니라 _방향 신호_. 특히 secondary(결과 지표)는 near-ceiling이라 거의 못 움직인다.
- **task 이질성 confound** — pair가 완벽히 같을 수 없다. 도메인·크기 stratify로 완화하되 잔여 편향 존재.
- **자기측정 편향** — probe의 오케스트레이터(메인 LLM)가 곧 측정 instrument다. 그래서 주관 인상 배제·JSONL 객관 proxy만 채택(위 §측정 지표).
- **공유 Supabase 플레이크** — 회고 §3-4 모노레포/공유DB 비결정성이 treatment의 oracle 재실행(pass@3)을 오염시킬 수 있다(probe도 영향).
- **결론 C의 함의** — 양 arm 모두 문제 미발생이면 spec 전체가 "예상된 문제" 위에 섰음을 확증 → 8-컴포넌트 defer가 정직한 귀결. probe가 _기각_ 근거가 될 수 있음을 사전 수용한다([05](../../migration/05-rn-harness-decisions.md) "2주 MVP에 공장 동시 건설" 경고 정합).

## 용어집

- **substrate(실행 기질)**: 무인 루프 step을 무엇으로 실행하나 — inline(같은 세션) vs 격리(서브에이전트/헤드리스).
- **context-rot**: 긴 세션에서 컨텍스트가 누적·열화되어 판단 품질이 떨어지는 현상. 자동 compaction의 손실도 포함.
- **compaction**: 컨텍스트가 한계에 가까우면 과거 대화를 요약 압축하는 동작. 손실이 있어 context-rot 신호로 본다.
- **relocation(이사)**: implementer를 격리해도 그 컨텍스트 부담이 오케스트레이터로 옮겨가는 것. 순이득을 0으로 만드는 실패 모드.
- **premise-defeater**: 가설의 전제 자체를 무너뜨리는 반례. 여기선 relocation이 "위생 이득" 전제를 깬다.
- **arm**: 대조 실험의 한 갈래(control = inline, treatment = 서브에이전트 격리).
- **oracle / pass@3**: 통과를 판정하는 외부 결정론 기준(typecheck·lint·test). 3회 시도 내 green 못 만들면 task 과대.
- **D6**: push·PR·merge 등 외부로 나가는 행위의 사람 게이트(절대 경계). 서브에이전트엔 해당 도구가 없어 자동 보존.
- **AUTONOMY_EXPANDED**: 하네스 자율 범위를 넓히는 meta-eval weaken reason-code. PO 승인 필요, 같은 코드 ×3 시 침식 경보(현재 2/3).
- **HWM(high-water-mark)**: 측정 기간 중 관측된 최고치(여기선 context-window 토큰 최고치).
