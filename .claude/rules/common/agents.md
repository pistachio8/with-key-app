# 에이전트 오케스트레이션

이 파일은 Claude Code 서브에이전트(Task 도구) 활용 어댑터입니다.
공통 품질 기준은 [`../../../docs/QUALITY_GATE.md`](../../../docs/QUALITY_GATE.md)를 따릅니다.

## 사용 가능한 서브에이전트

Claude Code 기본 제공 서브에이전트를 Task 도구로 호출합니다. 프로젝트 `.claude/agents/` 또는 글로벌 `~/.claude/agents/`에 커스텀 에이전트를 두면 그쪽이 우선 해석됩니다.

### 기본 (built-in)

| 에이전트        | 용도                | 사용 시점                                          |
| --------------- | ------------------- | -------------------------------------------------- |
| general-purpose | 다단계 탐색·구현    | 키워드/파일을 여러 번 찾아야 하거나 복합 작업일 때 |
| Explore         | 읽기 전용 광역 탐색 | 여러 디렉토리·네이밍을 훑어 결론만 필요할 때       |
| Plan            | 구현 계획 설계      | 복잡한 기능·리팩토링 전략 수립                     |

### with-key 도메인 리뷰어 (`.claude/agents/`)

ECC(everything-claude-code) 플러그인의 범용 reviewer를 대체하는, with-key 가드레일 기반 **읽기 전용** 리뷰어. 각자 자기 도메인 규칙만 들고 독립 컨텍스트로 깊게 본다. 출력 심각도(Blocker/Major/Minor)는 [`../../../docs/QUALITY_GATE.md`](../../../docs/QUALITY_GATE.md) §리뷰 기준과 정렬돼 병합이 쉽다.

| 에이전트           | 도메인 / 범위                                                                                                                            | 핵심 가드레일                                                                                                        |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| migration-reviewer | `supabase/migrations/**` · `src/lib/supabase/**`                                                                                         | append-only 번호·단방향, 전 테이블 RLS ON, SECURITY DEFINER `search_path`, ledger immutability, ADR/BE_SCHEMA parity |
| frontend-reviewer  | `apps/web/src/app/**` · `src/components/ui/**` · `src/lib/db/reads/**`                                                                   | route colocation, Server Action 경계, RSC/client, Cache Components(`"use cache: private"`+`cacheTag`), zod SoT       |
| backend-reviewer   | `**/_actions.ts` · `apps/web/src/lib/{ai,push,analytics,supabase}/**` · `packages/domain/src/{validators,keywords}/**` · `middleware.ts` | Server Action 계약, analytics parity(PRD §9.1), AI 일기 4.5s/fallback, keyword freeze, env/시크릿, service-role/RLS  |

### with-key 운영 에이전트 (`.claude/agents/`)

| 에이전트         | 역할 / 범위                                                                                                              | 하드 제약                                                                                      |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| harness-engineer | spec/plan → WP 분해 → `evals/tasks/NNNN-*.md` Agent Task 생성·Status 갱신, `pnpm harness:check` PASS 까지 자체 루프 | 컨벤션 비복사(매 실행 `.agents/workflows/*` fresh 읽기) · `.agents/**` 수정 금지 · PRD/AC 신설 금지 · evals append-only · 푸시 금지 |

> **로드 시점**: `.claude/agents/`는 Claude Code 시작 시 한 번 로드된다. 방금 추가한 에이전트는 **재시작 후**에야 `subagent_type` 이름으로 호출된다. 재시작 전에는 같은 지침을 `general-purpose`에 인라인해 동등하게 돌릴 수 있다. **왜**: 세션 레지스트리는 시작 시점 스냅샷이라 핫리로드되지 않는다.
> **추적**: `.claude/agents/`는 `.gitignore` 대상(로컬 전용). 팀·CI 공유가 필요하면 `.gitignore`에 `!/.claude/agents/` 화이트리스트를 추가해 커밋한다. **왜**: 추적 제외 상태에서는 같은 디렉토리를 가진 사용자만 이름 호출이 가능하다.

## 리뷰 오케스트레이션 — fan-out → 병합 → 검증

브랜치 자가 리뷰는 `withkey-review` 스킬이 오케스트레이터다. diff가 **크고 여러 도메인에 걸치면** 도메인 리뷰어로 fan-out한다. 작은 POC diff는 단일 컨텍스트 인라인 리뷰가 기본(스킬이 튜닝된 baseline).

1. **분류** — 변경 파일을 도메인별로 가른다(위 표 범위). 닿지 않은 도메인은 건너뛴다.
2. **병렬 호출** — 닿은 도메인마다 Task 하나씩 동시에. 각 리뷰어는 자기 도메인 가드레일만 격리된 컨텍스트에서 적용한다.
3. **병합·검증** — 서브에이전트 출력을 **그대로 믿지 않는다**. 리포트를 하나로 합치되, 두 리뷰어가 **사실에서 충돌하면 소스로 검증**한 뒤 보고한다. 서브에이전트는 오독할 수 있다(있는 함수를 없다고 하는 등). 소스로 교정한 발견이 단독 리포트보다 더 정확하다.
4. **단일 리포트** — 병합·검증된 발견만 최종 출력.

**왜 검증 단계가 핵심인가**: 독립 컨텍스트 리뷰어는 빠르고 깊지만 개별적으로 틀릴 수 있다. 메인(오케스트레이터)이 모순을 소스로 잡는 것이 fan-out이 비용을 지불할 가치를 만드는 지점이다. 이 분류·병렬·병합·검증 절차의 실행 본문은 `withkey-review` 스킬에 있다.

## 병렬 Task 실행

독립적인 작업에는 병렬 Task 실행을 사용합니다. 의존 관계가 없는 호출은 한 번에 묶어 보냅니다.

```markdown
# 좋음: 병렬 실행

3개 서브에이전트를 병렬로 실행:

1. migration-reviewer: 0044 migration RLS/RPC
2. backend-reviewer: settlement 도메인 로직·테스트
3. frontend-reviewer: point-balance cache read

# 나쁨: 불필요하게 순차 실행

먼저 1, 그다음 2, 그다음 3
```

## 다중 관점 분석

복잡한 문제에는 역할 분리 서브에이전트를 사용합니다. 같은 프롬프트를 그대로 복제해 병렬로 돌리면 관점이 중복되므로, 각 에이전트에 **서로 다른 역할/범위**를 부여합니다.

- 사실 검증 리뷰어
- 시니어 엔지니어
- 보안 전문가
- 일관성 검토자
- 중복 검사자
