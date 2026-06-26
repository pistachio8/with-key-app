# ADR-0042-harness-execution-substrate-process-vs-inline: 하네스 실행 기질 — 프로세스 격리 vs inline

**Date**: 2026-06-26
**Status**: proposed <!-- accepted / superseded / deprecated -->
**Deciders**: pistachio8

> 이 ADR은 **제안(proposed)** 상태다. 즉시 전환을 적용하지 않는다 — 하네스 자기변경(자율 경계 확장)이라 PO 승인 + meta-eval 게이트 전까지는 결정 후보일 뿐이다. ([UPDATE_POLICY](../../.agents/harness/UPDATE_POLICY.md) Level 2 + `AUTONOMY_EXPANDED`)

## Context

이 결정의 배경은 두 하네스의 **실행 기질(execution substrate, 무인 루프의 step을 무엇으로 실행하나)** 비교다.

**with-key 현행** — 무인 구현 루프(Stage 4)는 **메인 세션 inline**으로 돈다([orchestrate-backlog.md](../../.agents/workflows/orchestrate-backlog.md) §실행 2: "구현은 메인 세션 inline"). 격리는 **git worktree**(1 worktree = 1 PR)이지 별도 Claude 세션이 아니다. 검증은 에이전트 **바깥**에 있다 — 결정론 커맨드 `pass@3`(typecheck·lint·test·harness:check) + 독립 reviewer fan-out + 메인이 리뷰어 주장을 소스로 재검증(merge+verify). push·PR·merge는 사람 게이트(D6). 병렬 implementer는 명시적으로 범위 밖이다(orchestrate-backlog.md §63 "별도 spec").

**다른 프로젝트 레퍼런스(gbike-mf-HML `scripts/execute.py`)** — phase 안의 step마다 **격리 헤드리스 세션을 subprocess로 spawn**한다:

```python
# gbike-labs/scripts/execute.py L243–246
subprocess.run(["claude", "-p", "--dangerously-skip-permissions",
                "--output-format", "json", prompt], cwd=root, timeout=3600)
```

작업·검증·상태갱신을 **세션 자신에게 위임**하고, execute.py는 세션이 `index.json`에 self-report한 status를 읽어 commit/재시도(최대 3회, prev_error 주입)/blocked-중단만 조율한다. 공유 working tree + 단일 `feat-<phase>` 브랜치(worktree 없음), push는 `--push` 플래그, PR/merge·병렬·모델분기·자가개선 루프는 없다.

이게 정확히 with-key가 "확장 경로 / 범위 밖"으로 미뤄둔 **step별 격리 헤드리스 세션** 패러다임의 **동작하는 레퍼런스 구현**이다. 그래서 "어느 실행 기질이 하네스에 더 걸맞나"를 박제할 필요가 생겼다.

판단 기준 한 줄: **"harness"의 본질은 그것이 감싸는 에이전트보다 더 신뢰할 수 있는 비계라는 점이고, 그 신뢰는 외부 검증 + 거버넌스에서 나온다.**

## Decision

**채택: with-key의 외부 oracle·거버넌스 철학을 유지하되, 향후 무인 스케일 확장은 execute.py식 step별 격리 헤드리스 세션 기질을 차용한다 — 단 아래 3개 결함을 반드시 수정해서.** 두 패러다임은 경쟁이 아니라 상보다 — 이상적 하네스 = with-key의 oracle을 execute.py의 프로세스 격리 기질 위에 올린 것.

- **즉시 전환 아님.** inline + worktree가 POC 현행 기본으로 유지된다. 헤드리스 격리 전환은 **별도 spec + `AUTONOMY_EXPANDED` meta-eval + PO 승인** 게이트를 통과할 때만. 본 ADR은 그 전환의 *방향과 제약*만 박제한다.
- **차용 시 필수 수정 3가지** (execute.py를 그대로 옮기면 안 되는 이유):
  1. **self-report → 외부 결정론 oracle.** 세션이 self-report한 "completed" status를 신뢰하지 않는다. **왜**: oracle이 구현 에이전트 *내부*에 있으면 학생이 자기 시험을 채점하는 것 — 환각 "통과"가 그대로 커밋된다. with-key의 `pass@3` 실측 + 리뷰어 merge·소스검증을 유지한다.
  2. **공유 working tree/단일 브랜치 → worktree.** **왜**: execute.py의 공유 체크아웃은 동시 step 충돌을 막지 못하고 한 phase가 거대한 단일 브랜치가 된다. worktree는 병렬 안전 + 1 PR 단위를 보존한다.
  3. **`--dangerously-skip-permissions` → allowlist.** **왜**: with-key 룰이 명시 금지한다([hooks.md](../../.claude/rules/web/hooks.md) "`--dangerously-skip-permissions` 는 금지 — allowlist 로만"). 무인은 권한 우회가 아니라 사전 승인된 allowlist로 달성한다.
- **보존 불변**: D6 사람 게이트(push/PR/merge), meta-eval 거버넌스(strengthen/neutral/weaken + reason-code + ×3 침식경보), 회고 루프([retro-loop 설계](../superpowers/specs/)). 실행 기질을 바꿔도 신뢰·승인 경계는 그대로다.
- **상태 핸드오프 차용**: execute.py의 `index.json`(step status·summary를 세션 간 핸드오프 SoT로 쓰는 명시적 상태 파일)은 좋은 패턴 — 차용 시 with-key의 `evals/tasks` + `runs[]`와 정합시킨다.
- **Multi-tool 역할 분담은 본 결정의 따름정리다** — 격리 헤드리스 step의 CLI를 tool별로 분기한다(planner=Claude · executor=Codex · reviewer=cross-tool 쌍). 상세는 아래 "Multi-tool 확장" 절. **왜**: step이 격리 세션이면 그 세션이 어느 tool인지는 자유 변수다.

## Alternatives Considered

### 1. inline 단일 세션 영구 유지 (현행 그대로, 확장 안 함)

- **Pros**: 단순. POC 규모(시퀀셜 1-tick)에 충분. 모든 분기가 사람 게이트로 수렴하므로 멀티세션 오케스트레이션이 주는 이득이 게이트에서 사라진다. 디스크·setup 비용 0.
- **Cons**: 긴 task에서 컨텍스트 누적·열화(context-rot·compaction 손실). 본질적 시퀀셜이라 fan-out 불가. step 단위 replay 약함. "무인"이 인터랙티브 세션 inline이라 진짜 배치 실행이 아니다.
- **Why not**: POC 현행 기본으로는 **유지**하되, 스케일·컨텍스트 위생 한계 때문에 *영구 종착*으로 박지는 않는다. 그래서 "영구 유지"는 기각, "현행 기본"은 채택.

### 2. execute.py를 그대로 차용 (self-report oracle 포함)

- **Pros**: 프로세스 격리로 컨텍스트 위생·스케일·replay·진짜 헤드리스 배치 확보. 얇은 오케스트레이터.
- **Cons**: **self-report = oracle이 에이전트 내부** → 신뢰 근거 붕괴. 공유 브랜치 충돌. `--dangerously-skip-permissions`는 with-key 룰 위반. 자가개선·거버넌스 단절.
- **Why not**: 하네스의 정의적 가치(외부 검증)를 버리는 거래. 기질은 빌리되 oracle은 절대 내부화하지 않는다.

> **채택안은 위 둘의 하이브리드** — #1의 "현행 기본 유지"를 단기로, #2의 "프로세스 격리 기질"을 장기 확장으로 결합하고, #2의 3개 결함을 with-key 철학으로 교정한다.

## Consequences

### 긍정적

- 장기 확장 시 컨텍스트 위생·스케일·step replay를 얻으면서 oracle·거버넌스 신뢰를 보존한다.
- execute.py가 **동작하는 레퍼런스**라 후속 spec이 추상론이 아니라 실물 기반("이렇게 spawn하되 oracle은 외부로·worktree로·allowlist로")으로 작성된다.
- 회고가 밝힌 "비용은 라우팅 입구에 집중"(retro 2026-06-26)과 **분리된 별도 트랙**이라, 실행 기질 결정이 입구 개선을 지연시키지 않는다.

### 부정적 / 비용

- 멀티세션 오케스트레이션 복잡도(세션 spawn·timeout·재시도·동시성 제어).
- worktree N개 = 디스크·`pnpm install` setup 비용.
- 상태 핸드오프 파일(index.json류) 추가 = SoT 표면 증가 → drift 점검 대상 1개 늘어남.
- 즉시 이득 없음 — 현행 inline 유지라 전환 비용은 미래로 이연된다.

### 후속 영향

- 별도 spec 필요: `parallel-implementer` 또는 `headless-substrate` — `AUTONOMY_EXPANDED` meta-eval + PO 게이트 대상. retro-loop spec과는 **별개 트랙**.
- [orchestrate-backlog.md](../../.agents/workflows/orchestrate-backlog.md) §63 "병렬 implementer 범위 밖" 갱신 시 본 ADR을 인용한다.
- 전환 착수 전 [UPDATE_POLICY](../../.agents/harness/UPDATE_POLICY.md) Level 2 분류 + meta-eval(`AUTONOMY_EXPANDED` reason-code) 통과 확인.

## Multi-tool 확장 (따름정리)

실행 기질을 step별 격리 헤드리스 세션으로 두면(위 Decision), 각 세션이 **어느 CLI인지는 자유 변수**가 된다 — `claude -p`든 Codex 비대화형 exec든. 따라서 본 ADR의 따름정리로 multi-tool 역할 분담을 함께 박제한다. 별도 ADR로 분리하지 않는다 — multi-tool은 격리 기질 결정의 corollary지 독립 축이 아니다.

- **역할별 tool 배치**: planner=Claude · executor=Codex · reviewer=cross-tool 쌍. 오케스트레이터가 step별로 올바른 CLI를 분기 spawn한다. 핸드오프 SoT(Agent Task · `/goal` 렌더 프롬프트 ≤4000자 · `runs[]`)가 이미 portable이라 추가 발명이 최소다 — 워크플로 평문 markdown은 Claude·Codex 공통 원본(ADR-0031).
- **핵심 규칙 — 리뷰어 tool ≠ 실행 tool.** **왜**: 같은 모델 패밀리는 상관된 blind spot을 공유한다. 이질성의 검증 가치는 _실행_(executor 1명 → 교차검증 0)이 아니라 **리뷰**에 있다. "교차검증"은 *두 인스턴스*가 아니라 *cross-tool*이어야 의미가 있다.
- **외부 oracle이 선행조건.** tool을 섞을 때 유일한 안전 근거는 oracle이 에이전트 바깥(결정론 `pass@3`)이라는 점 — Codex 산출물을 tool-중립으로 객관 판정한다. 위 Decision의 "self-report → 외부 oracle" 수정이 multi-tool의 전제조건이다(self-report 위에서 tool을 섞으면 신뢰 문제가 곱해진다).
- **빠진 구현 조각**: ① step별 CLI 분기 오케스트레이터, ② per-step tool 배치 메타(`runs[]`의 `review.reviewers`에 `claude:backend` · `codex:backend`로 tool 기록), ③ cross-review 화해 — 두 리뷰 불일치 시 소스 재검증(기존 merge+verify의 cross-tool 확장).
- **옵션(기본 아님)**: executor 토너먼트 — 두 tool이 같은 Agent Task를 각자 worktree에서 구현하고 oracle/리뷰어가 통과본을 채택(best-of-N). 실행 이질성에 검증 가치를 주는 유일한 길이나 실행 비용 ×2라 default 아님.
- **거버넌스·비용 경계**: 본 따름정리도 `AUTONOMY_EXPANDED`(multi-tool 무인 오케스트레이션) — 위 Decision과 동일 게이트(별도 spec + meta-eval + PO). tool 양쪽 auth·과금·rate limit 이중화는 하네스 R&D 역량 비용이지 POC feature 배달 비용이 아니다(feature 트랙과 분리).

## 용어집

- **실행 기질(execution substrate)**: 무인 루프의 step을 무엇으로 실행하나 — inline(같은 세션) vs 격리 헤드리스 세션(step별 새 프로세스).
- **oracle**: 작업이 통과인지 판정하는 기준. _외부_ oracle = 구현 에이전트 바깥의 결정론 검증(테스트·lint). _self-report_ = 구현 세션 자신이 통과를 보고.
- **헤드리스(headless)**: 대화형 UI 없이 한 프롬프트를 처리하고 종료하는 비대화형 실행(`claude -p`).
- **worktree**: git이 같은 저장소를 여러 작업 디렉토리로 동시 체크아웃하는 기능. with-key는 1 worktree = 1 task = 1 PR.
- **pass@3**: 검증을 3회 시도 안에 green으로 만드는 oracle. 못 만들면 task 과대로 보고 분할.
- **D6**: [05-rn-harness-decisions](../migration/05-rn-harness-decisions.md) 결정 6 — push·PR·merge·spec·adr·po는 사람 게이트(절대 경계).
- **AUTONOMY_EXPANDED**: meta-eval의 weaken reason-code 하나 — 하네스 자율 범위를 넓히는 변경. PO 승인 + ADR 필요, 같은 코드 ×3 반복 시 체계적 침식 경보.
- **meta-eval**: 하네스 자기변경을 strengthen/neutral/weaken으로 분류하는 게이트. weaken은 reason-code + ADR + PO.
- **cross-tool 교차검증**: 같은 산출물을 _다른 tool_(예: Claude + Codex) 리뷰어가 독립 검토하는 것. 같은 tool 두 인스턴스는 상관된 blind spot을 공유하므로 교차검증 가치가 낮다.
- **best-of-N (judge panel)**: 여러 에이전트가 같은 task를 각자 구현하고 oracle/리뷰어가 통과본을 채택하는 패턴. 실행 비용이 N배라 기본값이 아님.
