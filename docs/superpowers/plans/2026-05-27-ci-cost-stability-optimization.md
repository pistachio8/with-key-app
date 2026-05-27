---
plan: 2026-05-27-ci-cost-stability-optimization
title: CI 비용 + 안정성 최적화 (D 목표)
author: pistachio8
date: 2026-05-27
status: draft
---

## 목표

GitHub Actions 분 소진을 줄이면서, 공유 Supabase 프로젝트(`ohvcaytmzzwxkbxsmyny`) 동시 접근으로 발생하는 integration 테스트 race(예: PR #105 의 `action_logs_challenge_id_fkey` FK 위반) 를 결정론화한다. 우선순위는 **비용 + 안정성 균형**(속도 향상은 부수 효과로만 허용).

배경: 리포는 private → Actions 분이 실제 소진. PR #105(`chore(docs)` — 문서만 변경) 도 integration · e2e 가 풀로 돌면서 분 낭비와 race 양쪽 비용을 동시에 유발하고 있음.

## 영향 범위

- 변경 경로:
  - `.github/workflows/ci.yml` — trigger types · job-level `if:` (라벨이 draft 도 뚫는 형태) · job-level `concurrency:` · paths-filter step (`*.md` 중심 보수화) · playwright cache (`restore-keys` 포함) · build 잡 신설 · cleanup step (step timeout 명시) · `SUPABASE_CLEANUP_ALLOWED_REF` env 추가
  - `package.json` — `test:integration:cleanup` npm script 1개 추가
  - `scripts/test/integration-cleanup.mjs` — 신규 (기존 `truncate_test_data` RPC 재사용 + project ref guard, 추가 의존 0)
- 데이터/RLS 영향: 없음 (CI · npm script 만 변경, 코드/스키마 무수정). cleanup 은 기존 `truncate_test_data` RPC 호출만.
- 외부 서비스: GitHub Actions(트리거·concurrency), Supabase(공유 프로젝트 동시 접근 직렬화로 race 차단 + cleanup 으로 부분 잔존 방지). 신규 외부 의존 0
- 재사용 후보: 기존 `./.github/actions/setup-pnpm` 그대로. `actions/cache@v4` 는 표준. `truncate_test_data` RPC 기존 인프라
- 비분리 결정: 워크플로/잡 분리(stage·도메인·trigger·paths 별) 는 채택하지 않음 — `pnpm install` 반복으로 setup 분이 N 배 늘어 D 목표(비용 축) 와 역행. 단일 `ci.yml` 유지. (단 Q11 의 nightly/release 가 도입되는 시점엔 trigger 가 본질적으로 다르므로 그때 분리)

## 결정 로그 (Q1~Q11 그릴 + 피드백 보완 결과)

> 2026-05-27 피드백 반영: release 안정성 정책 강화 (**병합 후 최소 1회 무거운 검증**) · 라벨 escape hatch · cleanup 보장 · main build 위치 명시. 비용 절감만 강조했던 Q5 결정을 안정성 축으로 일부 되돌림.

| #          | 결정                           | 채택                                                                             | 비채택 이유 / 보완                                                                                                                                                                                                                                                                                                                                               |
| ---------- | ------------------------------ | -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q1         | 1순위 목표                     | **D) 비용 + 안정성 균형**                                                        | A(비용 only) 는 race 미해결, B(속도) 는 분 한도 상황에 역행, C(안정성 only) 는 분 소진 그대로                                                                                                                                                                                                                                                                    |
| Q2         | docs-only PR 스킵 범위         | **B) integration · e2e 만 스킵, quick 은 유지**                                  | A 는 `validate:docs`/`spec-required` 가드 동시 상실, C 라벨 opt-in 은 누락 위험(escape hatch 로 별도 제공 → Q8), D 는 비용 효과 없음                                                                                                                                                                                                                             |
| Q2-impl    | 스킵 구현 방식                 | **iii) shell `git diff` 자체 판별**                                              | 외부 action 의존 0, fetch-depth: 0 이미 충족. 조건 늘면 `dorny/paths-filter` 로 이행 (리스크 명시)                                                                                                                                                                                                                                                               |
| Q3         | 공유 Supabase race 격리        | **A) job-level concurrency mutex (직렬화)**                                      | B(시드 prefix) 시드 코드 전반 리팩터, C(docker) 매 잡 +2~3분, D(branching) 인프라 변경/ADR 필요. 장기 병목 가능 → 리스크 명시                                                                                                                                                                                                                                    |
| Q4         | E2E 분 절감                    | **A + C) Playwright 캐시 + draft 스킵**                                          | B(smoke split) 별도 분류 작업, D(PR 에서 완전 제거) 안정성 축 손상, E 변경없음은 D 목표 절반 달성                                                                                                                                                                                                                                                                |
| Q5 (수정)  | post-merge develop 검증        | **B') push: develop 에선 quick + integration 실행, e2e 만 스킵**                 | 기존 Q5 결정은 "quick 만" 이었으나 피드백 반영: develop tip 이 PR head 와 다를 수 있어 무거운 회귀 안전망 필요. e2e 만 스킵해 비용 절반 절감하면서 통합 회귀는 잡음                                                                                                                                                                                              |
| Q6         | draft PR 에서 integration      | **A) draft 에선 integration 도 스킵** (Q4-C 와 대칭)                             | B 는 절감 폭 작음, C 라벨 opt-in 누락 위험, D 변경없음은 비용 효과 없음. 라벨 강제 실행 escape hatch 는 Q8 에서 제공                                                                                                                                                                                                                                             |
| Q7 (신규)  | push: main 검증                | **quick + build 실행**                                                           | release 시점 production 빌드 회귀 안전망. Vercel deploy workflow 가 build 를 별도 보장하지 않는 한 본 CI 에서 명시. integration · e2e 는 별도 release/nightly 트리거에서 (Q11)                                                                                                                                                                                   |
| Q8 (신규)  | full CI 강제 라벨 escape hatch | **`run-full-ci` 라벨로 docs-only · draft 양쪽 모두 무시하고 풀 파이프라인 실행** | 라벨 기본은 사용 안 함(누락 위험 해소). 의심스러운 PR 또는 release prep 시 명시적 opt-in. **라벨의 의미와 `if:` 조건은 반드시 일치 — 라벨은 `(draft == false && has_code == 'true')` 와 동급의 OR 분기로 위치한다. `draft == false && (has_code OR label)` 형태(라벨이 괄호 안에 들어감)는 라벨이 draft 를 뚫지 못해 의미와 조건이 어긋난다 → 금지 형태로 명시** |
| Q9 (신규)  | integration cleanup 보장       | **`if: always()` cleanup step 추가** (기존 `truncate_test_data` RPC 재사용)      | 잡이 중간에 실패해도 시드 잔존 0 보장 → mutex(Q3) 와 함께 race 위험의 두 번째 방어선. `pnpm test:integration:cleanup` npm script 신설 필요                                                                                                                                                                                                                       |
| Q10 (명시) | timeout 정책                   | **integration 15m · e2e 20m · quick 8m (현재 그대로)**                           | 변경 없음, plan 에 명시만 함. cleanup 이 항상 실행되도록 `if: always()` 가 timeout 도 적용받음 (cleanup 이 step level 에서 자체 timeout 짧게 설정)                                                                                                                                                                                                               |
| Q11 (신규) | release/nightly full e2e       | **본 plan 범위 외 — 별도 ADR/plan 으로 분리**                                    | release prep 시점에 nightly schedule 또는 `workflow_dispatch` 로 full e2e 실행하는 워크플로는 `release.yml` 또는 `nightly.yml` 신설 필요. POC 단계라 우선 라벨(Q8) escape hatch 로 대체                                                                                                                                                                          |
| 추가       | 워크플로 역할별 분리           | **채택하지 않음 — 단일 워크플로 유지**                                           | stage/도메인/trigger/paths 분리 모두 setup-pnpm 반복으로 비용 ↑, Q2~Q5 의 `if:` 로 표현 충분. 단 Q11(release/nightly) 가 도입되는 시점엔 trigger 가 본질적으로 다르므로 그때 분리                                                                                                                                                                                |

## 트리거 매트릭스 (최종 정책)

> "PR 에서는 비용을 아끼되, develop 또는 main 병합 후 최소 1회는 통합/빌드 검증을 수행한다."

| 트리거                                             | quick | integration | e2e       | build (`next build`) |
| -------------------------------------------------- | ----- | ----------- | --------- | -------------------- |
| PR docs-only                                       | ✅    | ❌          | ❌        | ❌                   |
| PR code + draft (라벨 없음)                        | ✅    | ❌          | ❌        | ❌                   |
| PR code + ready                                    | ✅    | ✅          | ✅        | ❌                   |
| PR + `run-full-ci` 라벨 (**draft·docs-only 무관**) | ✅    | ✅          | ✅        | ❌                   |
| push: develop                                      | ✅    | ✅          | ❌        | ❌                   |
| push: main                                         | ✅    | ❌          | ❌        | ✅                   |
| (향후) nightly / release dispatch                  | ✅    | ✅          | ✅ (full) | ✅                   |

- **build 잡** 은 본 plan 신설 — Q7
- **`run-full-ci` 라벨** 은 docs-only · draft 조건을 무시하고 풀 파이프라인 강제 실행 — Q8
- **integration mutex** 는 위 표에서 ✅ 인 모든 곳에 공통 적용 — Q3
- **cleanup step** 은 integration 잡이 도는 모든 경우에 `if: always()` 로 실행 — Q9

## 작업 단계

작은 배치로. 각 단계는 PR 머지 없이 단독 검증 가능하지만, 본 plan 의 PR 1개로 통합 머지 권장(설정 변경만이라 외과적).

### 1. workflow trigger 에 `ready_for_review` 추가

draft → ready 전환 시 integration · e2e 가 자동으로 1회 실행되도록.

```yaml
on:
  pull_request:
    types: [opened, synchronize, reopened, ready_for_review]
  push:
    branches: [develop, main]
```

검증: 임시 draft PR → ready 전환 → integration 잡이 새로 트리거되는지 Actions 탭에서 확인.

### 2. quick 잡에 docs-only 판별 step 추가 (Q2 + Q2-impl)

`fetch-depth: 0` 은 이미 적용됨. base 와 비교해 코드 변경 유무를 output 으로 노출.

**판별 정책 (피드백 7 보수화 반영)**

기존 안은 `docs/` 디렉토리 _전체_ 를 docs-only 로 간주했으나, `docs/` 안에 비-md 파일(향후 추가될 수 있는 `.sql` · `.json` · 이미지 등) 이 들어가면 코드 영향이 있어도 스킵될 위험이 있다. 보수적으로 **`.md` 파일 중심** 으로 좁힌다.

docs-only 로 간주하는 패턴 (확장자 기반):

- `*.md` (어디에 있든 — README, docs/, 코드 옆 등 전부 포함)
- `^\.github/ISSUE_TEMPLATE/` (이슈 템플릿 디렉토리 — 코드 영향 없음 보장)
- `^LICENSE$` · `^CHANGELOG$` (확장자 없는 docs 관례 파일)

`docs/` 디렉토리라도 비-md 파일 (예: `docs/seed.sql`) 이 들어가면 코드 변경으로 본다 → false positive 위험은 비용 측면(스킵 못 함) 뿐 안정성 영향 없음.

```yaml
- name: Detect non-docs code changes
  id: changes
  if: github.event_name == 'pull_request'
  run: |
    base="origin/${{ github.base_ref }}"
    changed=$(git diff --name-only "$base"...HEAD)
    echo "$changed"
    # 코드 영향 가능 파일 = docs-only 패턴에 매칭 안 되는 모든 파일
    # docs-only 패턴: *.md (어디든), .github/ISSUE_TEMPLATE/*, LICENSE, CHANGELOG
    if echo "$changed" | grep -Ev '(\.md$|^\.github/ISSUE_TEMPLATE/|^LICENSE$|^CHANGELOG$)' | grep -q .; then
      echo "has_code=true" >> "$GITHUB_OUTPUT"
    else
      echo "has_code=false" >> "$GITHUB_OUTPUT"
    fi
- name: Expose has_code (push events default true)
  id: gate
  run: |
    if [ "${{ github.event_name }}" = "pull_request" ]; then
      echo "has_code=${{ steps.changes.outputs.has_code }}" >> "$GITHUB_OUTPUT"
    else
      echo "has_code=true" >> "$GITHUB_OUTPUT"
    fi
```

quick 잡의 `outputs:` 블록에 `has_code: ${{ steps.gate.outputs.has_code }}` 추가.

검증:

- `docs/*.md` 만 바꾼 commit → `has_code=false` 확인
- `.claude/*.md` 만 바꾼 commit → `has_code=false` 확인 (`.md` 패턴에 매칭)
- `docs/seed.sql` 같은 비-md 가 섞인 commit → `has_code=true` (보수 fallback)
- code 만 바꾼 commit → `has_code=true`
- 혼합 commit → `has_code=true`

### 3. integration 잡 `if:` 통합 (Q2 · Q5 수정 · Q6 · Q8)

**라벨 의미 ↔ `if:` 일치 원칙 (가장 중요)**

`run-full-ci` 라벨은 "docs-only · draft 양쪽 모두 무시" 의미. 따라서 `if:` 조건은 라벨이 **OR 의 동급 분기** 로 위치해야 한다. 즉:

✅ 올바름: `(draft == false && has_code == 'true') || label`
❌ 금지: `draft == false && (has_code == 'true' || label)` — 라벨이 draft 를 못 뚫음 (의미 불일치)

```yaml
integration:
  needs: quick
  timeout-minutes: 15
  if: |
    (
      github.event_name == 'pull_request' &&
      github.event.pull_request.head.repo.full_name == github.repository &&
      (
        (
          github.event.pull_request.draft == false &&
          needs.quick.outputs.has_code == 'true'
        ) ||
        contains(github.event.pull_request.labels.*.name, 'run-full-ci')
      )
    ) ||
    (
      github.event_name == 'push' &&
      github.ref == 'refs/heads/develop'
    )
  concurrency:
    group: integration-shared-supabase
    cancel-in-progress: false
  # steps 는 Step 4 cleanup 까지 합쳐 최종안에서 통합
```

> **참고**: PR + same-repo head 베이스 조건은 fork PR 의 secrets 노출 방지 (현행 정책 유지).

검증:

- docs-only PR(라벨 없음) → integration "Skipped"
- 코드 PR(draft, 라벨 없음) → integration "Skipped"
- 코드 PR(ready) → integration 실행
- docs-only PR + `run-full-ci` 라벨 → integration 실행
- **draft PR + `run-full-ci` 라벨 → integration 실행** (라벨이 draft 도 뚫음, 피드백 1)
- push: develop → integration 실행 (release 안전망)
- push: main → integration "Skipped" (Q7 의 build 만 실행)

### 3-bis. e2e 잡 `if:` 통합 (Q4-C · Q6 · Q8 · 피드백 2 · 3)

**needs 명시 + integration 결과 의존성 명시**

```yaml
e2e:
  needs: [quick, integration]
  timeout-minutes: 20
  if: |
    always() &&
    needs.integration.result == 'success' &&
    github.event_name == 'pull_request' &&
    github.event.pull_request.head.repo.full_name == github.repository &&
    (
      (
        github.event.pull_request.draft == false &&
        needs.quick.outputs.has_code == 'true'
      ) ||
      contains(github.event.pull_request.labels.*.name, 'run-full-ci')
    )
```

근거:

- **`needs: [quick, integration]`** — `needs.quick.outputs.has_code` 접근하려면 `needs:` 에 `quick` 명시 필수. 단순히 `needs: integration` 만 두면 outputs 접근 불가 (GitHub Actions 명세).
- **`always()`** — `needs.*.result` 표현을 `if:` 안에서 평가하려면 `always()` 가 선행해야 함. 없으면 needs 가 skipped/failed 인 경우 e2e 가 자동 skip 되어 `result` 평가 자체가 발생 안 함. 명시적 success 게이트로 만들고 싶을 때의 표준 패턴.
- **`needs.integration.result == 'success'`** — integration 실패 시 e2e 안 돌게 명시. 분 절약 + 의미적으로 e2e 는 integration 통과 후의 다음 단계.

검증:

- 코드 PR(ready) + integration pass → e2e 실행
- 코드 PR(ready) + integration fail → e2e Skipped (분 절약)
- 코드 PR(draft, 라벨 없음) → e2e Skipped (integration 도 skip)
- push: develop → e2e Skipped (integration 만 실행, e2e 는 PR 전용)
- push: main → e2e Skipped
- docs-only PR + `run-full-ci` 라벨 → e2e 실행 (integration 통과 시)
- **draft PR + `run-full-ci` 라벨 + integration pass → e2e 실행** (라벨이 draft 도 뚫음, 피드백 1)

### 4. integration cleanup step (Q9 · 피드백 4 · 5 · 6)

`if: always()` 로 잡 성공/실패 무관하게 cleanup 보장. 기존 `truncate_test_data` RPC 재사용. 신규 npm script + 가드 추가.

**4-a. cleanup 실패 정책 (피드백 4)**

- **선택**: `continue-on-error: false` (기본값) — cleanup 실패 시 잡 전체 실패
- **이유**: cleanup 실패 = 공유 Supabase 에 부분 시드 잔존 가능성 → 다음 잡에 race 위험을 강제 전파해 무시 못 하게 한다. 안정성(Q3 mutex 와 같은 D 목표의 두 번째 방어선) 측면에서 빨강이 정답.
- **트레이드오프**: 테스트는 모두 통과했는데 cleanup 만 실패해서 PR 가 빨갛게 표시될 수 있음 (가짜 fail 느낌). 그러나 cleanup 자체는 단일 RPC 호출이라 실패 빈도가 낮다 — 실제로 빨갛게 되면 _진짜 문제_ 일 확률이 높다.
- **명시 금지**: `continue-on-error: true` 로 두지 않음. 무시 가능한 cleanup 실패가 누적되면 race 위험을 발견 못 해 D 목표의 안정성 축이 무너진다.
- **운영 가이드**: cleanup 만 실패한 PR 는 (1) Actions 로그에서 `truncate_test_data` 에러 원인 확인 → (2) 일시적이면 PR re-run, 반복되면 RPC/권한/네트워크 점검. test 결과 자체는 cleanup 이전 step 의 status 로 확인 가능.

**4-b. `package.json` 에 npm script 추가**

```json
"test:integration:cleanup": "node scripts/test/integration-cleanup.mjs"
```

**4-c. `scripts/test/integration-cleanup.mjs` 신설 (피드백 6 — project ref guard)**

```js
// scripts/test/integration-cleanup.mjs
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;
// 피드백 6: 잘못된 (production) 프로젝트에 cleanup 실수로 붙는 사고 방지.
// SUPABASE_CLEANUP_ALLOWED_REF env 가 없으면 안전 사이드로 차단.
const allowedRef = process.env.SUPABASE_CLEANUP_ALLOWED_REF;

if (!url || !key) {
  console.error("[cleanup] missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY");
  process.exit(1);
}
if (!allowedRef) {
  console.error(
    "[cleanup] SUPABASE_CLEANUP_ALLOWED_REF not set — refuse to cleanup unknown project",
  );
  process.exit(1);
}

// URL 형태: https://<project_ref>.supabase.co
const actualRef = url.match(/^https:\/\/([^.]+)\.supabase\.co/)?.[1];
if (actualRef !== allowedRef) {
  console.error(
    `[cleanup] project ref mismatch — expected ${allowedRef}, got ${actualRef ?? "<unparseable>"}. refusing to cleanup.`,
  );
  process.exit(1);
}

const admin = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const { error } = await admin.rpc("truncate_test_data");
if (error) {
  console.error("[cleanup] truncate_test_data failed:", error.message);
  process.exit(1);
}
console.log(`[cleanup] truncate_test_data ok (project=${actualRef})`);
```

> 추가 안전망: `truncate_test_data` RPC 는 이미 `@test.local` 사용자 scope 만 처리 (확인됨, `tests/integration/setup.ts:50`). 두 layer (스크립트 guard + RPC scope) 모두 통과해야 데이터 변경 가능 → 실수로 production 프로젝트에 붙어도 row 안 지움. 본 가드는 _RPC 호출 자체_ 를 사전에 차단해 production audit log 노이즈도 줄임.

**4-d. workflow 의 integration 잡 env 에 `SUPABASE_CLEANUP_ALLOWED_REF` 추가**

```yaml
env:
  # ... 기존 env 유지
  SUPABASE_CLEANUP_ALLOWED_REF: ohvcaytmzzwxkbxsmyny # apply-migrations.sh 의 SUPABASE_PROJECT_REF 와 동일
```

> `apply-migrations.sh` 의 `SUPABASE_PROJECT_REF` 와 같은 값이지만, 변수명을 분리해 두는 이유는 cleanup 의 가드 목적이 _어떤 경우라도 실수로 다른 ref 에 대해 truncate 호출 안 함_ 이라는 의도를 코드에 박기 위함. 변경 시 두 곳을 의식적으로 같이 바꾸도록.

**4-e. integration 잡 step timeout 정책 (피드백 5)**

job timeout 15m 안에 test step + cleanup step 이 모두 들어가도록, **test step 자체 timeout 을 12분으로 짧게** 잡는다. 그러면 test 가 폭주해도 cleanup 이 항상 1~2분의 여유를 갖고 실행됨.

```yaml
- name: Apply pending migrations (no-op if up to date)
  timeout-minutes: 2
  run: bash scripts/ci/apply-migrations.sh

- name: Run integration tests
  timeout-minutes: 12
  run: pnpm test:integration

- name: Cleanup integration test data
  if: always()
  timeout-minutes: 2
  run: pnpm test:integration:cleanup
```

| step             | timeout                 | 누적 max  |
| ---------------- | ----------------------- | --------- |
| setup-pnpm       | (composite, ~1m 평균)   | ~1m       |
| apply-migrations | 2m                      | 3m        |
| test:integration | **12m** (job 보다 짧게) | 15m       |
| cleanup          | 2m (`if: always()`)     | 17m total |

> job timeout-minutes 15m 은 그대로. test step 이 12m 안에 끝나지 않으면 GitHub 가 test step 만 죽이고 cleanup 으로 진행 → 시드 잔존 방지. 만약 cleanup 까지 포함해 job 이 17분 가까이 가더라도 job timeout 15m 에 걸려 잘리는데, 이 경우 cleanup 자체는 시작은 했지만 도중에 끊긴 상태가 될 수 있음. 빈도가 잦다면 job timeout 을 18m 로 늘리는 대안 있음 — 일단 15m 유지하고 관찰.

검증:

- integration 잡 의도적으로 실패시킨 PR → Actions 로그에 `[cleanup] truncate_test_data ok (project=...)` 확인
- cleanup 후 `@test.local` user row count = 0 (Supabase Studio 또는 admin SQL)
- `SUPABASE_CLEANUP_ALLOWED_REF` env 를 일부러 잘못된 값으로 설정한 PR → cleanup 이 `project ref mismatch` 로 즉시 실패하고 RPC 호출 안 함
- test:integration 이 12분 초과하는 의도적 시뮬레이션 → test step 만 죽고 cleanup 정상 실행 확인 (timeout cascade)

### 5. push: main 에 build 잡 신설 (Q7)

production 빌드 회귀 안전망. Vercel 이 이미 build 하지만 본 CI 에서 main push 검증을 명시해 deploy 와 검증을 분리.

```yaml
build:
  name: Production build (main only)
  needs: quick
  if: |
    github.event_name == 'push' &&
    github.ref == 'refs/heads/main'
  runs-on: ubuntu-latest
  timeout-minutes: 10
  steps:
    - uses: actions/checkout@v4
    - uses: ./.github/actions/setup-pnpm
    - run: pnpm build
```

검증:

- main 으로 PR 머지 → Actions 탭에서 build 잡 1회 실행 + pass
- develop push → build 잡 Skipped

### 6. Playwright 브라우저 캐시 (Q4-A · 피드백 8 restore-keys)

e2e 잡의 `playwright install` 앞에 캐시 step 추가. **`restore-keys` 폴백으로 부분 캐시 hit 허용** — lockfile 해시 변경(Playwright 패치 bump 등) 시에도 이전 캐시에서 가능한 브라우저 재활용.

```yaml
- name: Cache Playwright browsers
  id: pw-cache
  uses: actions/cache@v4
  with:
    path: ~/.cache/ms-playwright
    key: pw-${{ runner.os }}-${{ hashFiles('**/pnpm-lock.yaml') }}
    restore-keys: |
      pw-${{ runner.os }}-
- name: Install Playwright browsers
  run: pnpm exec playwright install --with-deps chromium
```

`--with-deps` 는 캐시 hit 여부와 무관하게 OS 의존만 가볍게 갱신. 브라우저 바이너리는 캐시에서.

**restore-keys 동작**:

- 정확 hit (full key 일치) → 다운로드 0
- 부분 hit (`pw-Linux-` prefix 만 일치) → 이전 캐시 복원 → `playwright install` 이 누락된/변경된 브라우저만 다운로드 (전체 다운로드 회피)
- 0 hit (첫 실행) → 전체 다운로드 + 새 키로 저장

검증:

- 첫 실행 → 캐시 miss, 전체 다운로드 + 새 캐시 저장 확인
- 두 번째 실행 (lockfile 동일) → 정확 hit, "browsers already installed" 로그
- pnpm-lock 변경 commit (예: 다른 dep bump 로 해시만 바뀜) → restore-keys 폴백으로 이전 캐시 복원 + 부분 다운로드 확인. 전체 다운로드 30-60s → 0-15s 감소.

### 7. 결과 측정 (1주일 관찰)

머지 후 일주일 평균 비교:

- PR 당 총 분 (이전 평균 vs 적용 후)
- integration 잡 실패율 (race 기인 실패가 0 인지)
- draft 푸시 빈도 대비 integration·e2e 스킵율
- develop push 후 integration 잡 안정성 (post-merge 실패 감지율)
- main push 후 build 잡 실패 발생 여부 (Q7 안전망 가치 검증)
- `run-full-ci` 라벨 사용 빈도 (escape hatch 가 실제로 쓰이는지)
- cleanup step 실패 빈도 (false-fail 비율 모니터링 — 잦으면 정책 재검토)

**main build 잡 유지/제거 의사결정 룰 (피드백 9)**

1주일 데이터 수집 후 다음 룰로 결정:

| 조건                                                                                                | 결정                                      | 이유                                                   |
| --------------------------------------------------------------------------------------------------- | ----------------------------------------- | ------------------------------------------------------ |
| main push 횟수 ≥ 3 회 **AND** build 잡 실패 0 회 **AND** Vercel deploy 빌드 동기간 항상 통과        | **build 잡 제거**                         | Vercel 빌드가 신뢰 가능한 release gate. 중복 비용 제거 |
| main push 횟수 ≥ 3 회 **AND** build 잡 실패 ≥ 1 회 (Vercel 도 동시에 실패했든 아니든)               | **build 잡 유지**                         | 실제로 회귀를 잡은 사례 있음                           |
| main push 횟수 ≥ 3 회 **AND** build 잡은 통과했으나 Vercel deploy 빌드는 같은 commit 에서 실패 발생 | **build 잡 유지 + Vercel 환경 차이 조사** | 두 빌드 환경의 mismatch → 본 잡이 _유일한_ 사전 안전망 |
| main push 횟수 < 3 회                                                                               | **관찰 1주일 연장**                       | 표본 부족                                              |

기록 위치: `.claude/PROJECT_LOG.md` Performance 카테고리. 결정 시 ADR 신설 여부도 함께 판단(제거 결정은 release gate 정책 변경이라 ADR 권장).

## 검증

```bash
# 본 plan PR 자체 검증 (변경은 워크플로 1개라 코드 검증은 가벼움)
pnpm validate:docs
```

수동 확인 항목:

- [ ] 임시 draft PR 로 `ready_for_review` 트리거 동작 확인
- [ ] docs-only 변경 PR 에서 integration · e2e "Skipped" 표시 확인
- [ ] 코드 변경 + draft PR (라벨 없음) 에서 integration · e2e "Skipped" 표시 확인
- [ ] 동시 코드 PR 2개로 integration 직렬화 확인 (Q3)
- [ ] e2e 캐시 정확 hit 시 install 시간 감소 확인 (Q4-A)
- [ ] e2e 캐시 restore-keys 폴백: lockfile 해시만 바뀐 PR 에서 부분 캐시 hit 동작 확인 (피드백 8)
- [ ] develop merge 후 push: develop 에서 **quick + integration 실행, e2e Skipped** 확인 (Q5 수정)
- [ ] main merge 후 push: main 에서 **quick + build 실행, integration · e2e Skipped** 확인 (Q7)
- [ ] docs-only PR 에 `run-full-ci` 라벨 부착 → integration · e2e 풀 실행 확인 (Q8)
- [ ] **draft PR + `run-full-ci` 라벨 → integration · e2e 풀 실행 확인** (피드백 1 — 라벨이 draft 도 뚫는지)
- [ ] integration 의도 실패 PR → cleanup step `if: always()` 가 `truncate_test_data ok (project=...)` 로그 남기는지 확인 (Q9)
- [ ] cleanup 의 project ref guard: `SUPABASE_CLEANUP_ALLOWED_REF` 를 고의로 잘못된 값으로 두고 실행 → `project ref mismatch` 로 즉시 실패, RPC 호출 안 되는지 확인 (피드백 6)
- [ ] test step 12m timeout: 시뮬레이션으로 test 가 길어져도 cleanup 이 정상 실행되는지 확인 (피드백 5)
- [ ] e2e 의 `always() && needs.integration.result == 'success'`: integration 실패 시 e2e 가 Skipped, integration 통과 시 e2e 실행 (피드백 3)
- [ ] docs-only regex 보수화: `docs/*.sql` 같은 비-md 파일이 섞이면 `has_code=true` 인지 (피드백 7)

## 리스크 / 미해결

- **draft 에서 큰 변경을 오래 쌓는 흐름** 일 경우 ready 전환 시 처음 integration 이 한꺼번에 실패할 수 있음. 완화: with-key 의 "작은 배치 단위" 정책과 정합 + Q8 의 `run-full-ci` 라벨로 명시적 강제 실행 가능 (라벨은 draft 도 뚫음 — 피드백 1 반영).
- **공유 Supabase 직렬화로 wall-clock 지연 (Q3 의 장기 병목 가능성)**: 동시 PR 빈도가 낮은 POC 단계에선 체감 작음. 빈도 ↑ 시 시드 prefix 격리(Q3-B) 또는 Supabase Branching(Q3-D) 으로 이행 — 별도 ADR.
- **shell `git diff` 판별의 유지보수성 (Q2-impl)**: 스킵 경로 룰이 4-5개를 넘어 복잡해지면 `dorny/paths-filter@v3` 로 이행 검토 — 외부 action 의존 1개 추가 vs 가독성 트레이드오프. 본 plan 의 룰 (`*.md` · `.github/ISSUE_TEMPLATE/` · `LICENSE` · `CHANGELOG`) 까지는 shell 로 충분. (피드백 7 보수화로 룰 자체도 단순해짐)
- **paths 판별이 git diff 기반**: rename/이동 시 양쪽 경로가 모두 등장해 `has_code=true` 로 가는 case 있음. 보수적 fallback 이라 비용 측면에서만 손해(스킵 못 함). 안정성에는 영향 없음.
- **docs-only PR 이 develop 머지될 때 push: develop 에서도 integration 1회 실행됨 (피드백 10 — 의도적 선택)**: 본 plan 은 push: develop 에서 `has_code` 와 무관하게 integration 을 항상 실행한다. 이유: develop tip 의 _직전 PR_ 가 코드 PR 이었더라도 그 후 docs PR 들이 누적되면서 lockfile/CI/env 가 변할 수 있고, develop tip 회귀를 PR 단계가 아닌 곳에서 1회 더 확인하는 것이 D 목표의 안정성 축. **결과적으로 docs-only PR 머지 ≠ 비용 0** — 의도된 비용(integration 잡 1회 ≈ 3분) 으로 받아들임. 빈도 ↑ 또는 분 한도 압박 시 push: develop 에도 has_code 판별을 적용하는 대안 검토 — 별도 plan.
- **build 잡이 Vercel deploy 와 중복일 수 있음 (Q7)**: Vercel preview/production 빌드가 이미 돌고 있으므로, Vercel 빌드가 실패하면 deploy 가 안 됨. 본 CI 의 build 잡은 _Vercel 외부에서 빌드 회귀를 발견할 안전망_ 으로 의미가 있지만, 비용 절감 우선이라면 본 잡을 제거하고 Vercel 빌드 통과를 release gate 로 신뢰하는 대안도 가능 → 1주일 관찰 후 Step 7 의 의사결정 룰로 재평가 (피드백 9 반영).
- **release/nightly full e2e 분리 (Q11)**: 본 plan 범위 외. `run-full-ci` 라벨이 단기 대체. release prep 빈도가 늘면 `nightly.yml` 또는 `release.yml` 신설 — 별도 plan.
- **cleanup 실패 정책의 가짜 fail 리스크 (피드백 4)**: cleanup 실패 시 잡 빨강 (`continue-on-error: false`). 테스트 통과 + cleanup 만 실패 시 PR 가 가짜 빨강처럼 보일 수 있으나, 안정성 우선 원칙으로 수용. 빈도 ↑ 이면 RPC/권한 점검 또는 정책 재검토.
- **cleanup 의 project ref guard 가 production 사고를 완전히 막진 못함 (피드백 6)**: `SUPABASE_CLEANUP_ALLOWED_REF` env 도 결국 사람이 설정. 그러나 (1) 스크립트 guard + (2) `truncate_test_data` RPC 의 `@test.local` scope, 두 layer 가 모두 통과해야 변경 발생 → 단일 실수 한 번으로 production 손상되지 않음.
- **e2e 의 `always() && needs.integration.result == 'success'` 의 의도 (피드백 3)**: GitHub Actions 의 기본 동작(needs 가 success 면 자동 실행) 과 동일한 효과지만, **명시적으로 의도를 박아두는** 가독성/유지보수 가치. 향후 `needs.*.result == 'failure'` 같은 다른 분기를 추가할 때 baseline 으로 활용.
- **cleanup 스크립트 신설 필요 (Q9)**: `package.json` 의 `test:integration:cleanup` 과 `scripts/test/integration-cleanup.mjs` 가 본 plan 구현 시 함께 추가됨. 추가 의존 0 (이미 `@supabase/supabase-js` 설치됨).
- **다른 env/코드 영향 없음** — 본 변경은 워크플로 YAML + cleanup 스크립트 2 파일 + `package.json` 의 npm script 1 줄.
