# Proposal: 헤드리스 substrate 전환 — 구현 착수 게이트 (meta-eval)

**Date**: 2026-06-26
**작성**: 오케스트레이터(게이트 통과 _준비_) · **승인 필요자**: PO(pistachio8)
**대상 결정**: 헤드리스 substrate 전환 spec([2026-06-26-headless-substrate-transition](../../../../docs/superpowers/specs/2026-06-26-headless-substrate-transition.md)) **구현 착수** — ADR-0042 G1~G6 closure 의 실제 머시너리 구현(C1~C8)을 시작할지 여부

> **상태: 게이트 대기 (auto-merge 차단)** — 본 proposal 은 PO 승인을 *준비*만 한다. 적용(구현 착수)은 PO 가 weaken(`AUTONOMY_EXPANDED`) 분류를 승인하고 D6 로 spec PR 을 머지한 뒤에만([UPDATE_POLICY](../../UPDATE_POLICY.md) §meta-eval 2). 본 문서는 승인하지 않는다.

## 대상

전환 spec 이 정의한 **머시너리 구현(`.agents/harness/**`·`scripts/harness-spawn.mjs`·`evals/results/agent-results.json` runs[] 스키마)\** 을 착수할지 결정한다. 박는 것은 *구현 시작 승인\*이지 자동 머지나 D6 완화가 아니다(spec §Out of scope — D6 절대 경계 보존).

- spec 문서 자체(`docs/superpowers/specs/`)는 meta-eval 트리거 경로 **밖**이라 초안 작성·머지(D6)는 게이트 무관이다.
- 그러나 spec 이 실제로 건드릴 `.agents/**`·`evals/**` 변경이 meta-eval 대상이다 — 그 변경의 **첫 PR 착수**가 본 게이트다.

## Level 분류

**Level 2 — 제안만(PR + meta-eval + 사람)**.

근거: [UPDATE_POLICY](../../UPDATE_POLICY.md) §읽는 workflow — "권한 경계 자체 변경 = Level 2 + meta-eval 자기참조(AUTONOMY_EXPANDED 등)". 본 전환은 무인 루프의 실행 기질(step별 격리 헤드리스 세션 spawn) + multi-tool 자율 오케스트레이션을 도입하므로 자율·권한 경계 변경에 해당한다. spec line 15·166 이 이미 자신을 "별도 AUTONOMY_EXPANDED meta-eval + PO 게이트" 로 자기참조한다.

- **Level 1 아님**: 경로/스크립트명 단순 반영이 아니라 새 실행 기질 도입이다.
- **Level 3 아님**: PRD goal·MVP scope·eval 수용기준(계약)을 바꾸지 않는다 — 실행 기질은 머시너리 거버넌스 결정이지 제품 계약이 아니다(spec §src 영향 "없음").

## meta-eval 결과

**weaken** — reason-code **AUTONOMY_EXPANDED**.

- **분류 근거(결정론)**: 무인 루프가 step 을 _별도 프로세스로 spawn_ 해 자율 구현·검증하도록 자율 범위를 넓힌다 + executor 를 Codex 까지 확장한다(C8). 자율 경계 확대 = AUTONOMY_EXPANDED([05-rn-harness-decisions](../../../../docs/migration/05-rn-harness-decisions.md) §6.1).
- **×3 침식 카운터**: **2번째 사용**. 1번째 = ADR-0042 proposed→accepted 승격([2026-06-26-adr-0042-accept](2026-06-26-adr-0042-accept.md)). [UPDATE_POLICY](../../UPDATE_POLICY.md) §meta-eval 4 — 같은 reason-code ×3 시 체계적 침식 PO 경보. **본 건 승인 시 다음 1건이 임계**. PO 는 누적 카운터를 인지하고 승인할 것.
- **strengthen 으로 볼 여지(PO 판단 참고)**: 본 전환은 oracle 을 *강화*한다 — 외부 결정론 재실행 검증(C2.1) + DB 격리(C4) + 비용 천장(C7) + 무인 항상 fan-out(C2.2) 추가. 그럼에도 **보수적으로 weaken 분류** — 자율 경계를 *확대*하는 결정은 자동 머지로 흘리지 않고 PO 사인을 거치게 하는 것이 게이트 설계 의도다(under-classify 하면 게이트 무력화).

## G-closure 검증 결과 (적대적 검증 2026-06-26)

spec 의 "G1~G6 을 닫는다" 주장을 독립 read-only 리뷰어가 소스 대조로 검증함. 결과를 spec §검증 보완에 반영 완료.

| Gate           | 매핑 | 판정           | 한 줄                                                                                      |
| -------------- | ---- | -------------- | ------------------------------------------------------------------------------------------ |
| G1 이득 한정   | C3   | **부분**       | "닫힘" 아닌 정직한 재범위 — 컨텍스트 위생(확정)+wall-clock 단축(미검증)뿐, throughput 아님 |
| G2 DB 결정론   | C4   | **닫힘**       | ADR 두 옵션(직렬화 락/Supabase branch) 반영 + "격리 없이는 병렬화 안 함" 선결 게이트화     |
| G3 oracle 주체 | C2   | **부분**       | pass@3 재실행은 결정론 외부화(닫힘); merge+verify 화해 주체·감독 LLM 컨텍스트 위생 미정    |
| G4 allowlist   | C5   | **닫힘(설계)** | 3개 하위요구 매핑; Bash 체이닝 push-누수 차단은 구현으로 이연                              |
| G5 index.json  | C6   | **닫힘**       | 휘발성 scratch + 권위 runs[]/finalize single-writer, §7 가드레일 보존                      |
| G6 비용 상한   | C7   | **닫힘**       | per-step + 전역 abort 천장으로 N×재시도×spawn 폭주 차단                                    |

**불변 충돌·은닉 약화·Rollout 순서 모순 없음.** push/PR/merge 사람 게이트·§7 single-writer·meta-eval 보존 확인. spec §검증 보완이 G1·G3·C5 를 착수 전 보완 대상으로 명시.

## 서브 리뷰 결과 (3-렌즈, 2026-06-26)

spec 을 3개 서브에이전트(구현가능성·정합성·회의론)로 병렬 리뷰 후 메인이 소스 교차검증(서브 주장도 그대로 신뢰 안 함 — 회의 렌즈의 "Codex grep=0" 주장은 소스에서 *틀림*으로 반증, 단 결론은 유효). 결과를 spec §검증 보완·Alternatives #4 에 반영 완료.

- **사실 오류 2건(소스 확정) → spec 반영**: ① `D6` 오인용 — 05 결정 6 은 *자기유지 권한 경계 3단*이지 push/PR/merge 가 아님(전역 관행 상속, glossary 정정). ② `orchestrate-headless.md` 위치 — `.agents/harness/workflows/`(self-maintenance 전용) → `.agents/workflows/`(ADR-0031 §4) 로 정정.
- **첫 PR 빈틈(구현가능성 렌즈) → spec 반영**: C5 push-누수 차단(Blocker)·C6 index.json 핸드오프 스키마 미정의(Major 신규)·allowlist 주입 SoT 미확정(Major 신규). 핵심 인용(G1~G6·implement-agent-task §4/5/7/8·UPDATE_POLICY·hooks)은 정합성 렌즈가 **전부 정확**으로 확인.
- **방향 도전(회의 렌즈) → PO 결정 사안**: 확정 이득(컨텍스트 위생)이 회고 데이터에 **0건 관측**(abandon 0·pass@1 29/31·attempts>1 0) + **무비용 대안 누락**(inline + 구현 step만 서브에이전트 격리 = 0 인프라로 컨텍스트 위생 획득, spec Alternatives #4 신설) + premise-defeater(감독 LLM 컨텍스트 미격리 시 순이득 0) + 헌장 "공장 함정" 경고. **PO 가 '전체 전환 착수' vs 'Rollout 4 probe(서브에이전트 격리) 선행 후 재평가' 를 결정해야 한다.**

## diff 요약

- **현재 머시너리 mechanics diff = 0.** 본 게이트는 *구현 착수 승인*이라 아직 코드 변경이 없다(ADR-0042-accept 가 1줄 Status diff 였던 것과 다른 점). 승인 시 발생할 변경 표면:
  - 신규: `.agents/harness/workflows/orchestrate-headless.md` · `scripts/harness-spawn.mjs` · `.agents/harness/config/headless.config.example.json`
  - 수정: `.agents/workflows/orchestrate-backlog.md` §63 · `implement-agent-task.md` §4·5·7 · `evals/results/agent-results.json` runs[] 스키마
- **이번 작업으로 실제 변경된 파일(게이트 *준비*분, mechanics 아님)**:
  - spec `docs/superpowers/specs/2026-06-26-headless-substrate-transition.md` — line 11 과대 주장 정정 + §검증 보완 신설(강화 방향, 게이트 트리거 밖)
  - 본 proposal 신설

## risks

- 착수 승인이 "전 컴포넌트 백지 위임"으로 읽혀 D6 완화·자동 머지로 번질 오해. → spec §Out of scope + C3·C5 가 D6 3중 보존. 본 proposal 도 "착수 승인 ≠ D6 완화" 명시.
- **G1 미검증 이득** — wall-clock 단축이 사람 게이트 병목에서 실재하지 않으면 전환 ROI 가 컨텍스트 위생뿐일 수 있다. Rollout 4(단일 worktree 먼저)→5(병렬 실측) 가 완화하나 착수 전엔 미입증.
- **AUTONOMY_EXPANDED 2/3** — 다음 1건이 ×3 침식 경보. 누적 추적 책임이 여기서 명시된다.
- 구현 PR 에서 C2 화해 주체·C5 push-누수 차단이 설계대로 안 닫히면 무인 모드 신뢰(외부 oracle·D6)가 샌다. → spec §검증 보완이 두 PR(C2·C5)의 선결로 못박음.

## validation-plan

- `pnpm harness:check` PASS — spec·proposal 추가가 구조 무결성 깨지 않음.
- `pnpm harness:drift` — 거버넌스 문서 추가가 drift 유발 안 함 확인.
- `pnpm validate:docs` — spec·proposal·ADR·UPDATE_POLICY 내부 링크 무결.
- (구현 착수 후, 각 PR) spec §Verification 명령 — `node scripts/harness-spawn.mjs --dry-run` 등.

## next-step

**revise→approve 대기 (PO 게이트)**:

1. ⬜ PO 가 **방향 결정** — 3-렌즈 리뷰의 회의 렌즈가 도전: 확정 이득(컨텍스트 위생)이 데이터에 미관측 + 무비용 서브에이전트 격리 대안(spec Alternatives #4) 존재. **(A) 전체 8-컴포넌트 전환 착수** vs **(B) Rollout 4 probe(서브에이전트 격리)로 이득 실재성 먼저 측정 후 재평가** 택1.
1. ⬜ PO 가 spec §검증 보완의 **보완 항목**을 검토 — G1(재범위)·G3(화해 주체)·C5(push-누수, 첫 PR Blocker)·C6(핸드오프 스키마)·allowlist SoT 를 착수 전 spec 보완으로 닫을지, 구현 PR 선결로 둘지 방향 택1.
1. ⬜ PO 가 meta-eval **weaken(AUTONOMY_EXPANDED, 2/3)** 분류 승인 여부 결정.
1. ⬜ (D6) 사람이 spec PR 을 `develop` 으로 머지 = 방향 설계 확정(전환 착수 아님, spec Rollout 1).
1. ⬜ 승인 시 구현 PR 순서: C5+C6 → C2 → C7 → C4 → C3 → C8 (spec Rollout 3, "C3 병렬은 C4·C2·C7 머지 후에만").

**오케스트레이터 정지점**: 위 1~2 는 PO 전용(D6·Level 2). 본 턴은 게이트 *준비*까지만 — 승인·머지·착수는 사람.

읽는 workflow: [review-harness-update](../../workflows/review-harness-update.md).
