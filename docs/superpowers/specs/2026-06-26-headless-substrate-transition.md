---
spec: 2026-06-26-headless-substrate-transition
title: Headless Substrate Transition
author: pistachio8
date: 2026-06-26
status: draft
---

## Summary

[ADR-0042](../../adr/0042-harness-execution-substrate-process-vs-inline.md)(accepted)가 박은 _방향_ — "외부 oracle·거버넌스는 유지하되, 무인 스케일 확장은 execute.py식 step별 격리 헤드리스 세션 기질을 차용한다" — 을 **실제 전환 spec**으로 푼다. ADR은 방향만 박고 6개 미해결(G1~G6)을 전환 spec의 선결 조건으로 남겼다. 본 spec은 그 6개를 **구체 설계로 닫는다**.

핵심은 두 가지를 동시에 만족시키는 실행 모델이다: ① 구현 step을 메인 세션 inline 대신 **격리 헤드리스 세션(`claude -p` / Codex 비대화형)** 으로 spawn해 컨텍스트 위생·진짜 배치 실행을 얻고, ② 그 세션의 self-report를 **신뢰하지 않고** 오케스트레이터가 결정론 oracle(`pass@3`)을 **재실행**해 판정하는 외부 검증을 보존한다.

> **이 spec은 draft(제안)다.** 머지·구현 착수는 **별도 `AUTONOMY_EXPANDED` meta-eval + PO 승인** 게이트를 다시 통과해야 한다([UPDATE_POLICY](../../../.agents/harness/UPDATE_POLICY.md) Level 2). 본 문서는 그 게이트에 올릴 *설계*일 뿐, 전환을 승인하지 않는다. `docs/superpowers/specs/`는 meta-eval 트리거 경로 밖이라 초안 작성 자체는 게이트 무관이지만, 본 설계가 실제로 건드릴 `.agents/**`·`evals/**` 변경이 meta-eval 대상이다.

## Why

- ADR-0042가 accepted됐으나 *방향*만 박혔다. G1~G6이 닫히지 않으면 "외부 oracle·격리 기질" 전제 자체가 성립하지 않아 전환을 착수할 수 없다 — 이 spec이 그 선결을 닫는 설계다.
- 현행 inline + worktree는 긴 task에서 **컨텍스트 누적·열화**(context-rot·compaction 손실)를 겪고, 본질적 시퀀셜이라 fan-out이 불가능하다(ADR Alternative #1 Cons). 격리 기질은 컨텍스트 위생을 무조건 얻는다.
- 단, execute.py를 그대로 옮기면 **self-report = oracle 내부화**(학생이 자기 시험 채점) + 공유 브랜치 충돌 + `--dangerously-skip-permissions` 룰 위반이 따라온다(ADR Alternative #2). 기질은 빌리되 결함 3가지는 with-key 철학으로 교정해야 한다.
- 본 spec이 닫지 않으면 후속 구현 PR이 추상론 위에서 작성된다. ADR은 "execute.py가 동작하는 레퍼런스라 실물 기반으로 쓸 수 있다"고 했으나, 그 실물의 *결함*까지 구체적으로 교정한 설계가 있어야 안전하다.

## Impact Scope

### 변경 경로

- 신규:
  - `.agents/harness/workflows/orchestrate-headless.md` — step별 CLI 분기 spawn 오케스트레이터(현 inline `orchestrate-backlog.md`의 헤드리스 변종)
  - `scripts/harness-spawn.mjs` — 헤드리스 세션 spawn + 재실행 검증 + 타임아웃/abort 제어(execute.py 대응, 단 외부 oracle)
  - `.agents/harness/config/headless.config.example.json` — allowlist · 타임아웃 · 토큰 상한 · 전역 abort 예산
- 수정:
  - [`.agents/workflows/orchestrate-backlog.md`](../../../.agents/workflows/orchestrate-backlog.md) §63 "병렬 implementer 범위 밖" — 본 spec을 인용해 _조건부_ 확장으로 갱신(ADR 후속영향)
  - [`.agents/workflows/implement-agent-task.md`](../../../.agents/workflows/implement-agent-task.md) §4·5·7 — 헤드리스 경로에서 oracle 재실행 주체·reviewer 화해 step·index.json 휘발성 경계 추가
  - `evals/results/agent-results.json` `runs[]` 스키마 — per-step tool 메타(`review.reviewers`에 `claude:backend`·`codex:backend`) 추가(회고 트랙 §4와 공유)

### src/ 영향

없음 — 머시너리(하네스 실행 기질)만 바꾼다. 앱 코드(`apps/web/**`)는 건드리지 않는다. 헤드리스 세션이 _구현하는_ task가 src를 바꿀 뿐, 본 전환 자체는 src 무관.

### Supabase / RLS / migration 영향

스키마 변경 없음. 단 **G2(병렬 DB 테스트 비결정성)** 해소를 위해 worktree별 Supabase branch(MCP `create_branch`) 또는 DB-touching test 직렬화 중 택1이 필요 — 이건 _테스트 실행 격리_ 설계이지 migration이 아니다(아래 C4).

### 외부 서비스

- Claude CLI(`claude -p`) + Codex CLI 비대화형 exec — multi-tool executor(따름정리). 양쪽 auth·과금·rate limit 이중화는 하네스 R&D 비용(feature 트랙과 분리, ADR Multi-tool §거버넌스).
- Supabase branch 차용 시 branch 생성 비용.

## Design

8개 컴포넌트(C1~C8)로 분해한다. **C2~C7이 ADR의 G3·G1·G2·G4·G5·G6을 각각 닫는다.** C8은 multi-tool 따름정리.

### C1 — 실행 모델: step별 격리 헤드리스 세션 spawn

오케스트레이터(얇은 스크립트 + 메인 LLM 감독)가 1 tick의 구현 step을 메인 세션 inline 대신 **별도 프로세스로 spawn**한다.

- spawn 형태: `claude -p --allowedTools <allowlist> --output-format json "<goal 렌더 프롬프트>"` (Codex executor는 등가 비대화형 exec — C8). `--dangerously-skip-permissions`는 **쓰지 않는다**(C5).
- 입력 핸드오프: 이미 portable한 Agent Task + `/goal` 렌더 프롬프트(≤4000자) + `runs[]`(ADR Multi-tool — 추가 발명 최소).
- 격리 단위: **1 worktree = 1 task = 1 PR**(현행 보존). 헤드리스 세션은 자기 worktree 안에서만 구현·커밋.
- **왜 inline을 버리나**: 긴 task의 컨텍스트 열화 제거 + 진짜 헤드리스 배치(인터랙티브 세션 의존 제거). **왜 worktree는 유지하나**: 공유 working tree(execute.py 결함 2)는 동시 step 충돌을 못 막는다(G1 closure C3과 연결).

### C2 — 외부 oracle 보존 (G3 closure)

**self-report를 신뢰하지 않는다.** 헤드리스 세션은 `pass@3`을 자기 worktree에서 돌려 green을 *주장*하고 그 결과를 핸드오프 파일(C6)에 쓴다. 하지만 통과 판정의 권위는 세션 밖에 있다:

1. **오케스트레이터 재실행 검증** — 세션이 "green" 주장 시, 오케스트레이터가 **같은 Verification Commands를 worktree에서 재실행**해 결과를 독립 확인한다. 재실행이 red면 self-claimed green은 환각으로 보고 기각 → fix-verification 분기 또는 abandon. **왜**: oracle이 구현 에이전트 *내부*에 있으면(execute.py 결함 1) 학생이 자기 시험을 채점한다 — 재실행이 외부 oracle을 복원한다.
2. **reviewer 화해를 별도 헤드리스 step으로** — 현행 merge+verify(리뷰어 주장을 소스로 재검증)는 메인 LLM이 inline으로 한다([implement-agent-task §5](../../../.agents/workflows/implement-agent-task.md)). 헤드리스로 빼면: ① 도메인 reviewer fan-out을 각각 헤드리스 step으로 spawn, ② 두 리뷰 불일치 시 **소스 재검증(화해)** 를 오케스트레이터(또는 전용 화해 step)가 수행. 무인 경로는 diff 크기 무관 **항상 fan-out**(implement-agent-task §5 Phase 4 §C1 보존).

> **얇은 스크립트만으로는 외부 oracle이 성립하지 않는다.** execute.py식 "세션이 self-report한 status를 읽어 commit"은 oracle을 포기한다. 재실행 검증 + 화해 step이 오케스트레이터의 필수 책임이다.

### C3 — 병렬성 모델 + 이득 한정 (G1 closure)

ADR G1: 시퀀셜 + PR마다 D6 게이트를 유지하면 살아남는 이득은 *컨텍스트 위생*뿐. 스케일·fan-out을 실제로 얻으려면 D6/시퀀셜을 _어떻게_ 푸는지 명시해야 한다. **본 spec의 결정:**

- **병렬성은 _구현~검증~리뷰_ 국면에만 둔다.** `harness:next`의 `ready` 폭 ≥2 이고 **파일 비커플링**(Target Files 교집합 ∅)인 task들을 각자 worktree에서 동시 spawn한다(orchestrate-backlog §63 조건 충족 시).
- **D6 게이트는 PR마다 유지한다(완화하지 않음).** N개 task가 동시에 review-ready에 도달해도 push·PR·merge는 사람이 PR마다 처리한다.
- **그래서 이득은 *명시적으로 한정*된다**: ① 컨텍스트 위생(무조건), ② **게이트까지의 wall-clock 단축**(N task가 시퀀셜이 아니라 동시에 review-ready 도달). **자동 머지 throughput은 얻지 않는다** — 그건 D6를 푸는 것이고 본 spec 범위 밖. **왜**: Alternative #1을 기각한 "게이트에서 이득 소멸" 논리에 대칭 정직하게 답한다 — 게이트는 안 사라지되, 게이트에 _도달하는_ 비용이 준다. 그 이상을 주장하지 않는다.

### C4 — 결정론 oracle 보존: DB 테스트 격리 (G2 closure)

병렬 worktree가 공유 Supabase를 동시 타격하면 `pass@N`이 비결정적이 되어 oracle 자격을 잃는다(이미 문서화된 결함 — 회고 §3-4 공유DB 플레이크). **2-tier 테스트 실행:**

- **비-DB 테스트**(typecheck·lint·unit) → worktree별 **완전 병렬**. 공유 상태 없음.
- **DB-touching 테스트**(E2E·integration) → 둘 중 택1:
  - **(기본·POC) 전역 직렬화 락** — DB-touching test는 전역 mutex를 잡고 한 번에 하나만. 병렬 worktree라도 DB 단계는 줄 세운다. **왜**: 무비용·즉시. 트레이드오프 = DB 테스트가 wall-clock 병목.
  - **(스케일 경로) worktree별 Supabase branch** — MCP `create_branch`로 worktree마다 격리 DB. **왜**: 진짜 병렬. 트레이드오프 = branch 생성·정리 비용.
- **병렬 도입의 선결 조건**: 위 격리 없이는 병렬화하지 않는다. C3의 병렬 spawn은 C4 격리가 켜진 뒤에만 활성.

### C5 — allowlist · 실패모드 · tool 등가물 (G4 closure)

헤드리스는 사람이 권한 프롬프트에 답할 수 없다. `--dangerously-skip-permissions`(룰 위반, [common/hooks.md §자동 수락 권한](../../../.claude/rules/common/hooks.md)) 대신:

- **allowlist 정의**(`headless.config`): `Read`·`Edit`·`Write`·`Grep`·`Glob` + 범위 한정 `Bash`(`pnpm typecheck|lint|test|harness:*`, `git add|commit`, worktree 내 한정) + 하네스 커맨드. **push·PR 생성·merge tool은 allowlist에서 명시 제외**(D6 — worktree 커밋까지만 자율, implement-agent-task §8).
- **allowlist 밖 행위 = step 실패·에스컬레이트** — 헤드리스엔 권한 프롬프트에 답할 사람이 없으므로, allowlist 밖 도구 호출은 즉시 step 실패 처리 → 오케스트레이터가 사람에게 에스컬레이트하고 그 step 정지. **왜**: 무인은 권한 우회가 아니라 *사전 승인된 allowlist*로 달성한다.
- **Codex 등가물**(C8) — `allowedTools`는 `.claude.json` 기준이라 Codex executor에는 sandbox/approval 정책 등가물로 재표현(예: Codex sandbox + approval policy). push/PR 배제는 동일.

### C6 — 상태 핸드오프: index.json 휘발성 경계 (G5 closure)

execute.py의 `index.json`(step status·summary 세션 간 핸드오프 SoT)은 좋은 패턴이나, **권위 status로 쓰면 안 된다.**

- **index.json = 휘발성 오케스트레이션 scratch.** 한 tick 안에서 헤드리스 세션 → 오케스트레이터 핸드오프용. git-ignore 또는 transient. 세션은 여기에 self-report(주장)를 쓴다.
- **권위 status = `runs[]` via `harness:finalize`(single-writer).** 통과 판정은 C2 재실행 검증을 거친 뒤에만 finalize가 기록한다. finalize는 in_progress 전제 + review 증거 backstop이 있어 단일 writer다([implement-agent-task §7](../../../.agents/workflows/implement-agent-task.md)).
- **왜**: 이중 status SoT는 막 세운 status-drift 차단 가드레일(§7 "머지 후 별도 편집 금지")을 후퇴시킨다. index.json을 권위화하면 그 가드레일이 무력화된다 — 그래서 *휘발성*으로 못 박는다.

### C7 — 비용·시한 상한 (G6 closure)

execute.py의 `timeout=3600`×3회를 그대로 들이면 `pass@3` × CI 재시도(3, orchestrate-backlog §39) × spawn이 **곱해진다**. 상한을 명시:

- **per-step**: wall-clock 상한(예: 30분) + 토큰 상한. 초과 시 그 step abort·에스컬레이트.
- **pass@3**: 3회 유지(task 크기 oracle). CI 재시도: 3회 유지(flaky/환경 — task 크기와 무관).
- **전역 abort**: 한 배치(병렬 N worktree)의 합산 wall-clock·토큰 예산. 초과 시 **모든 worktree abort + 사람 에스컬레이트**. **왜**: per-step 상한만으로는 N×재시도×spawn 곱이 폭주할 수 있다 — 전역 천장이 POC 예산을 지킨다.

### C8 — multi-tool 역할 분담 (ADR 따름정리)

step이 격리 세션이면 그 세션이 어느 CLI인지는 자유 변수(ADR Multi-tool). 본 spec이 구현 조각을 정의:

- **역할 배치**: planner=Claude · executor=Codex · reviewer=**cross-tool 쌍**. 오케스트레이터가 step별 올바른 CLI를 분기 spawn.
- **핵심 규칙 — 리뷰어 tool ≠ 실행 tool.** **왜**: 같은 모델 패밀리는 상관된 blind spot을 공유 — 이질성의 검증 가치는 *실행*이 아니라 *리뷰*에 있다.
- **선행조건 = 외부 oracle(C2).** tool을 섞는 유일한 안전 근거는 oracle이 에이전트 바깥(결정론 `pass@3`)이라 Codex 산출물을 tool-중립 판정한다는 점. self-report 위에서 tool을 섞으면 신뢰 문제가 곱해진다.
- **runs[] tool 메타**: `review.reviewers`에 `claude:backend`·`codex:backend`로 tool 기록(회고 트랙 §4 후보 4와 스키마 공유 — 조율 대상).
- **옵션(기본 아님)**: executor 토너먼트(best-of-N) — 실행 비용 ×2라 default 아님.

## Alternatives Considered

### 1. execute.py를 그대로 차용 (self-report oracle 포함)

- Pros: 얇은 오케스트레이터, 즉시 격리 이득.
- Why not: self-report = oracle 내부화로 신뢰 근거 붕괴(ADR Alternative #2). C2 재실행 검증이 이 대안을 명시 기각한다.

### 2. inline 영구 유지 (전환 안 함)

- Pros: 단순, 디스크·setup 0.
- Why not: ADR이 이미 "현행 기본 유지하되 영구 종착 아님"으로 결론. 컨텍스트 위생·배치 실행을 영영 포기.

### 3. 병렬 + D6 완화(자동 머지)

- Pros: 진짜 throughput.
- Why not: D6는 절대 경계(05 결정 6). 자동 머지는 별도 PO 결정이고 본 spec 범위 밖 — C3가 이득을 "게이트까지 wall-clock"으로 한정한 이유.

## Verification

### 명령

```bash
# 머시너리 무결성
pnpm harness:check
pnpm harness:drift
pnpm validate:docs

# 헤드리스 spawn 단위(구현 PR에서)
node scripts/harness-spawn.mjs --dry-run   # spawn 프롬프트·allowlist 렌더만, 실행 안 함
```

### 시나리오

- **정상**: ready 폭 2(파일 비커플링) → 2 worktree 동시 spawn → 각자 pass@3 green 주장 → 오케스트레이터 재실행 검증 통과 → fan-out 리뷰 → finalize 2건 → 사람이 PR 2개 D6 게이트.
- **self-report 환각(C2)**: 세션이 green 주장하나 오케스트레이터 재실행이 red → green 기각 → fix-verification 또는 abandon. self-claimed green이 머지로 새지 않음 확인.
- **DB 비결정성(C4)**: DB-touching test 2개가 동시 worktree → 전역 락이 직렬화 → pass@N 결정론 유지 확인(락 없으면 플레이크 재현되는지 대조).
- **allowlist 위반(C5)**: 헤드리스 세션이 push 시도 → step 실패·에스컬레이트, 머지 안 됨 확인.
- **전역 abort(C7)**: 합산 예산 초과 → 모든 worktree abort + 정지 확인.

## Rollout

1. 본 spec 머지 = **방향 설계 확정**(전환 착수 아님).
2. **게이트 재통과** — 구현 착수 전 `.agents/**`·`evals/**` 변경에 대해 새 `AUTONOMY_EXPANDED` meta-eval + PO 승인.
3. 구현 PR 순서: C5 allowlist + C6 핸드오프(저위험·격리) → C2 재실행 검증(oracle 코어) → C7 상한 → C4 DB 격리 → C3 병렬 활성 → C8 multi-tool. **C3(병렬)은 C4(DB 격리)·C2(재실행)·C7(상한)이 모두 머지된 뒤에만 켠다.**
4. dogfood: 단일 worktree 헤드리스(병렬 off)로 먼저 실측 → 컨텍스트 위생·재실행 검증 신뢰 확인 후 병렬 활성.
5. 재검토: 첫 병렬 배치 운영 데이터(wall-clock 단축 실측 vs spawn·worktree 비용)로 G1 이득 한정이 맞았는지 재평가.

### 롤백

머시너리 변경이라 **워크플로 문서·스크립트 revert로 inline 경로 복원**. inline `orchestrate-backlog.md`가 그대로 남아 있으므로 헤드리스 오케스트레이터를 끄면 즉시 현행 기질로 복귀(헤드리스는 추가 경로이지 inline 대체가 아니다). runs[] 권위 status(C6)는 헤드리스/inline 공통이라 데이터 손실 없음.

## Out of scope

- **D6 게이트 완화·자동 머지** — 절대 경계(05 결정 6). 병렬은 게이트까지 wall-clock만 단축(C3).
- **PRD goal·MVP scope·eval 수용기준 변경** — Level 3, PO 전용.
- **회고 루프(harness-retrospector)** — 별개 트랙(ADR Consequences). 단 runs[] 스키마는 조율(C8).
- **앱 feature 배달** — 본 전환은 하네스 R&D, feature 트랙과 분리(ADR Multi-tool §거버넌스).

## 용어집

- **실행 기질(execution substrate)**: 무인 루프 step을 무엇으로 실행하나 — inline(같은 세션) vs 격리 헤드리스 세션(step별 새 프로세스).
- **외부 oracle**: 통과 판정 기준이 구현 에이전트 *바깥*에 있는 것 — 여기선 오케스트레이터가 `pass@3`을 재실행해 판정. 반대는 self-report(세션이 자기 통과를 보고).
- **헤드리스(headless)**: 대화형 UI 없이 한 프롬프트를 처리하고 종료하는 비대화형 실행(`claude -p`).
- **worktree**: git이 같은 저장소를 여러 작업 디렉토리로 동시 체크아웃. with-key는 1 worktree = 1 task = 1 PR.
- **pass@3**: 검증을 3회 시도 안에 green으로 만드는 oracle. 못 만들면 task 과대로 보고 분할.
- **D6**: [05-rn-harness-decisions](../../migration/05-rn-harness-decisions.md) 결정 6 — push·PR·merge·spec·adr·po는 사람 게이트(절대 경계).
- **AUTONOMY_EXPANDED**: meta-eval weaken reason-code — 하네스 자율 범위를 넓히는 변경. PO 승인 + ADR 필요.
- **merge+verify**: 리뷰어 fan-out 결과를 병합하되 리뷰어 간 사실 충돌은 소스로 재검증해 채택하는 절차.
- **cross-tool 교차검증**: 같은 산출물을 _다른 tool_(Claude + Codex) 리뷰어가 독립 검토. 같은 tool 두 인스턴스는 상관된 blind spot 공유.
- **index.json**: execute.py의 step status 핸드오프 파일. 본 spec에선 *휘발성 scratch*로만 차용(권위 status는 runs[]).
