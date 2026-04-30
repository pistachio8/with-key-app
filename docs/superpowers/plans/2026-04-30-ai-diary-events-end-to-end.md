# AI 일기 + events 로깅 end-to-end 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `submitActionLog` 한 번 호출로 AI 일기 생성 · 월 예산 폴백 · `events` 테이블 기록이 end-to-end 로 동작하게 만든다. 이미 배선된 `track()` no-op 을 **실 insert** 로 바꾸고, 모든 Server Action 의 서버 이벤트(특히 `ai_generated`)가 DB 에 도달하도록 일원화한다.

**Architecture:**
- `events` 테이블은 이미 존재(`supabase/migrations/0001_init.sql` §10) — **service_role admin client** 로 insert 해 RLS(`events_insert_self_or_anon`) 와 무관하게 항상 성공시킨다. 유저 스코프는 `user_id` 컬럼으로 구분.
- admin client 는 **lazy singleton**. 모듈 top-level throw 는 하지 않고, 최초 호출 시 env 를 검증한다. (Next.js build / dotenv 늦은 로드 / vitest import 순서 에서 폭발하지 않도록.)
- 이벤트 payload 검증은 **런타임 Zod 스키마** 로 한 번 더 — RLS 는 `name` 정도까지만 강제하고 `props` shape 을 못 본다. Zod 가 그 빈틈을 막는다.
- AI 비용 가드는 **별도 테이블 `ai_cost_log(month, scope, total_micros)`** + atomic upsert RPC. `scope` 컬럼이 core — D-014(단일 Supabase 프로젝트 공유) 환경에서 test 호출이 prod 누적을 리셋하지 않도록 `scope ∈ {'prod','test'}` 로 격리.
- 단위는 **`total_micros` (1¢ = 10,000 micros)** — POC 스케일 호출당 비용이 1¢ 미만이라 cent floor 는 예산 가드를 무력화한다.
- **self-retry 는 이 plan 에서 제거**. "같은 프롬프트 재시도" 는 비용 2배 대비 효과 미미, "누락 키워드 지시 주입 + wall-clock timeout" 은 별도 plan. 본 plan 은 "예산 가드 + 템플릿 폴백 + 비용 기록" 에 집중.

**Tech Stack:** Next.js 16 App Router · Supabase JS v2 · zod · OpenAI SDK · Vitest (unit + integration).

---

## 0. Revision History

**v3 (2026-04-30)** — 구현 검증 중 발견한 환경 분리 이슈 반영:

| 심각도 | 변경 |
|-------|------|
| 🔴 | `currentScope()` 를 `NODE_ENV` → **`VERCEL_ENV`** 기반으로 변경. Vercel 은 Preview 도 `NODE_ENV=production` 이라 Preview 가 prod 누적에 섞이는 버그가 있었음. `VERCEL_ENV === "production"` 만 `'prod'`, 그 외(`preview`, undefined) 는 `'test'` → Preview 를 D-014 격리선 안쪽으로 복귀. |
| 🟢 | diary.spec.ts 에 prod/preview scope 회귀 테스트 2 case 추가. |
| 🟢 | `.env.example` 에 `VERCEL_ENV` 기반 scope 판정 설명 append. Preview 에도 OpenAI 키를 넣을 거면 `test` scope 로 누적된다는 주의. |
| 🟢 | `cost-log-budget.spec.ts` 에서 `NODE_ENV` stub 제거, `VERCEL_ENV=""` 로 교체. |

**v2 (2026-04-30)** — 초안 리뷰 후 12개 지적 반영. 요약:

| 심각도 | 변경 |
|-------|------|
| 🔴 | `ai_cost_log` 단위를 **cents → micros** 로. cent floor 제거(POC 호출당 비용이 1¢ 미만이라 선형성이 깨졌음). |
| 🔴 | `ai_cost_log` 에 `scope text` 컬럼(PK=`(month, scope)`). truncate 는 `scope='test'` 만 리셋 → D-014 안전성 복원. |
| 🔴 | `admin.ts` top-level throw → **lazy singleton `adminClient()`**. |
| 🟡 | **self-retry 제거**. 누락 키워드 지시 + wall-clock timeout 은 별도 plan 후보. |
| 🟡 | `schema.ts` 는 Zod 런타임 스키마만 export. **`AnalyticsEvent` TS union 은 기존 `track.ts` 를 SoT 로 유지** (infer drift 방지). schema vs union 일치는 통합 테스트 1 개로 방어. |
| 🟡 | Task 8 테스트를 **`generateDiary` mock + spy** 로 변경 — 실제 회귀 방어. |
| 🟡 | `events` user_id=null 누수 방지 — `truncate_test_data` 에 `delete ... where user_id is null and …` 추가. |
| 🟢 | **3 PR 분할**: PR-A(events 로깅) / PR-B(AI 비용) / PR-C(e2e + ADR). |
| 🟢 | D-017 Context 재작성 — `notification_sent` 근거 대신 "system 이벤트 + Zod 방어선" 근거. |
| 🟢 | 기존 호출부의 `.catch(console.error)` 4 곳 정리 명시 (새 track 이 never-throw). |
| 🟢 | §0.5 의존성 순서에서 "Task 3 이 admin 의존" 오표기 정정. Task 3 은 Zod 만. |
| 🟢 | Task 1 name CHECK 마이그레이션을 `NOT VALID` + 사전 cleanup 2-step 으로. |

---

## 0. 사전 이해 — 이 plan 이 해결하는 것

ONBOARDING.md §6.2 · §6.5 가 요구하지만 현재 코드에 **미배선** 인 것을 다룬다 (repo 실측):

1. **`track()` 은 no-op** — `src/lib/analytics/track.ts:59-65` 는 `console.debug` 만 수행. 실제 `events` insert 가 없다. Week 2 분석(§9.2)이 성립하지 않는다.
2. **AI 월 예산 가드 없음** — `src/lib/ai/diary.ts` 는 타임아웃/키워드 누락 폴백만 있고 PRD §5.3 AC-7 의 "월 한도 초과 시 자동 템플릿 모드" 가 전혀 구현되지 않았다.
3. **UX 문자열 인자 미사용** — `templateFallback(displayName?)` 은 `displayName` 을 받지만 `submitActionLog` (`src/app/(app)/action/_actions.ts:44-48`) 가 전달하지 않아 항상 "회원" 으로 하드코딩된다.
4. **이벤트 스키마 ↔ DB schema mismatch** — `events.name` 은 plain text. `AnalyticsEvent` TS union 과 **런타임 검증** 이 없어 오타/drift 무방비.
5. **호출부의 `.catch(console.error)` 가 dead code 후보** — 새 track 이 내부에서 swallow 하면 호출부 4 곳(`pledge/_actions.ts:30`, `action/_actions.ts:82·93`, `challenge/new/_actions.ts:36`, `challenge/[id]/_actions.ts:41`)의 `.catch` 는 영원히 안 타는 dead code.

이 plan 이 **하지 않는 것** (§3 에 명시): self-retry (누락 키워드 지시 보강과 함께 별도 plan), v1 재생성 버튼, FE 재생성 UI, `notification_sent` 의 실 cron/trigger 배선, Kakao OAuth.

---

## 0.5 실행 가드레일 (Pre-flight)

### 의존성 순서 (반드시 이 순서로)

```
Task 1 (events name CHECK, 2-step)
  → Task 2 (admin client lazy singleton)
  → Task 3 (Zod schema — admin 의존 없음)
  → Task 4 (track 실 insert — admin + schema 의존)
  → Task 5 (ai_cost_log with scope col)
  → Task 6 (cost utils in micros)
  → Task 7 (generateDiary 예산 가드 + 비용 기록; self-retry 없음)
  → Task 8 (submitActionLog displayName 주입)
  → Task 9 (end-to-end integration)
  → Task 10 (전체 검증 + D-017)
```

Task 3 은 `admin` 을 import 하지 않는다 (Zod 스키마 정의뿐). Task 4 만 `adminClient()` 와 `analyticsEventSchema` 를 동시에 사용.

### PR 분할 (권장)

| PR | Tasks | 합쳐진 상태에서 green |
|----|-------|--------------------|
| **PR-A** — events 로깅 배선 | 1 · 2 · 3 · 4 | PRD §9 이벤트 수집만 개시 |
| **PR-B** — AI 비용 가드 | 5 · 6 · 7 | PRD §5.3 AC-7 예산 가드 |
| **PR-C** — end-to-end + ADR | 8 · 9 · 10 | `submitActionLog` displayName 주입 + D-017 |

각 PR 은 독립적으로 `pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration` green. PR-A 만 머지돼도 분석은 작동.

### Task × ECC 에이전트 매핑

| Task | ECC 호출 | 핵심 체크 |
|------|---------|----------|
| 1 events 마이그레이션 | database-reviewer | `NOT VALID` → `VALIDATE` 2-step, props GIN index |
| 2 admin lazy singleton | security-reviewer | service_role 서버 전용 (`import "server-only"`), 모듈 top-level throw 없음 |
| 3 Zod schema | type-design-analyzer | TS union(SoT) ↔ Zod schema 일치 통합 테스트 |
| 4 track 실 insert | silent-failure-hunter | insert/schema 실패가 swallow (의도적) · 호출부 `.catch` 정리 |
| 5 ai_cost_log scope col | database-reviewer | PK(month,scope), truncate 가 scope='test' 만 지움 |
| 6 비용 계산 utils | /code-review | micros 단위, 선형성 테스트 pass, KRW→micros 환산 상수 주석 |
| 7 generateDiary | /code-review + silent-failure-hunter | 예산 초과 시 OpenAI 미호출, self-retry 없음, 비용 기록 |
| 8 submitActionLog | /code-review | `generateDiary` mock + spy 로 displayName 전달 검증 |
| 9 integration test | /code-review | events row 검증 + cost_log row(scope='test') 검증 |
| 10 docs/DECISIONS | architecture-decision-records | D-017 근거 재작성 |

### 환경 가드

- `AI_MONTHLY_BUDGET_KRW` 는 `.env.example` 에 이미 있음. 테스트에서는 `vi.stubEnv("AI_MONTHLY_BUDGET_KRW", "…")` 로 override.
- service_role key 는 **서버 코드에서만** 참조. `src/lib/supabase/admin.ts` 에 `import "server-only"` 가드.

---

## 1. File Structure

### 1.1 DB (2개 마이그레이션)

- Create: `supabase/migrations/0008_events_constraints.sql` — `name` CHECK (`NOT VALID` → `VALIDATE`), `props` gin index, `created_at` index 보강. `user_id=null` 누수 정리 포함.
- Create: `supabase/migrations/0009_ai_cost_log.sql` — `ai_cost_log(month date, scope text, total_micros bigint, PK(month, scope))` + `add_ai_cost(p_micros int, p_scope text)` RPC. `truncate_test_data` 는 `scope='test'` 만 리셋하도록 덮어씀.

### 1.2 서버 supabase client

- Create: `src/lib/supabase/admin.ts` — **lazy singleton** `adminClient()`. `import "server-only"` 가드.
- Create: `src/lib/supabase/admin.spec.ts` — env 누락 시 호출 시점에만 throw.

### 1.3 analytics

- Modify: `src/lib/analytics/track.ts` — no-op → `adminClient().from("events").insert(...)`. **`AnalyticsEvent` TS union 은 여기 유지** (SoT).
- Create: `src/lib/analytics/track.spec.ts` — 성공 insert, userId 전달, schema 실패 swallow, insert 실패 swallow.
- Create: `src/lib/analytics/schema.ts` — **Zod 런타임 스키마만**. TS 타입은 export 하지 않는다(track.ts 의 union 이 SoT).
- Create: `src/lib/analytics/schema.spec.ts` — 이벤트별 parse 검증.
- Create: `src/lib/analytics/schema-union-parity.spec.ts` — **TS union 의 모든 arm 이 Zod schema 로 parse 되는지** 방어 테스트 (drift 방지).

### 1.4 AI 비용 추적

- Create: `src/lib/ai/cost.ts` — `estimateCostMicros({ inputTokens, outputTokens })`, `monthlyBudgetMicros()`, `micros` 단위.
- Create: `src/lib/ai/cost.spec.ts` — 환산식 + 선형성 + 경계값.

### 1.5 AI diary 확장

- Modify: `src/lib/ai/diary.ts` — (a) 예산 가드, (b) 비용 기록. **self-retry 없음**. displayName 은 기존 signature 유지.
- Create: `src/lib/ai/diary.spec.ts` (신규).

### 1.6 Server Action 확장

- Modify: `src/app/(app)/action/_actions.ts` — `users.display_name` 조회 → `generateDiary({ displayName })` 전달. 기존 `.catch(console.error)` 2줄은 **새 track 이 never-throw 라 제거**.
- Modify: `src/app/(app)/pledge/_actions.ts` · `src/app/(app)/challenge/new/_actions.ts` · `src/app/(app)/challenge/[id]/_actions.ts` — `await track(...)` 을 `void track(...)` 로 통일(fire-and-forget). `.catch` 제거.

### 1.7 Integration test

- Create: `tests/integration/analytics/events-insert.spec.ts` — `track()` → `events` row 존재.
- Create: `tests/integration/actions/submit-action-log-display-name.spec.ts` — `display_name` self-read RLS 보장.
- Create: `tests/integration/ai/cost-log-budget.spec.ts` — `ai_cost_log(scope='test')` 상한 초과 시 OpenAI 호출 없이 폴백.

### 1.8 문서

- Modify: `docs/TEAM_SHARE_DECISIONS.md` — D-017 추가.

---

## 2. Tasks

### Task 1: events 테이블 제약 보강 마이그레이션 (PR-A)

**Files:**
- Create: `supabase/migrations/0008_events_constraints.sql`

`NOT VALID` 로 걸고 기존 row 정리 후 `VALIDATE` — Preview 환경에 수동 테스트 row 가 남아있어 `ALTER` 실패하는 상황 방어.

- [ ] **Step 1: 파일 작성**

```sql
-- 0008_events_constraints.sql
-- PRD §9.1 이벤트 목록과 1:1 보장 + 분석 쿼리 가속.
-- 2-step: NOT VALID 로 걸고, 기존 row 정리 후 VALIDATE.

-- (a) alien name row 선제 정리 — Preview 에 수동 시드된 legacy 가 있어도 안전.
delete from public.events
  where name not in (
    'user_signed_up','group_created','invite_sent','invite_opened',
    'challenge_created','challenge_signed','challenge_activated',
    'action_started','keywords_shown','keywords_reroll','keyword_selected',
    'memo_fallback_opened','action_logged','ai_generated',
    'feed_view','kudos_given','notification_sent','notification_opened',
    'penalty_displayed'
  );

-- (b) NOT VALID 로 먼저 제약 등록 (lock 최소화).
alter table public.events
  add constraint events_name_valid
  check (name in (
    'user_signed_up','group_created','invite_sent','invite_opened',
    'challenge_created','challenge_signed','challenge_activated',
    'action_started','keywords_shown','keywords_reroll','keyword_selected',
    'memo_fallback_opened','action_logged','ai_generated',
    'feed_view','kudos_given','notification_sent','notification_opened',
    'penalty_displayed'
  )) not valid;

-- (c) 검증 — 위 DELETE 후엔 반드시 통과.
alter table public.events validate constraint events_name_valid;

-- (d) Week 2 props 조회용 GIN.
create index if not exists idx_events_props_gin
  on public.events using gin (props);

-- (e) 시계열 range scan.
create index if not exists idx_events_created_at
  on public.events (created_at desc);
```

- [ ] **Step 2: 로컬 적용 + 실 프로젝트 push**

Run: `pnpm db:push`
Expected: `Applying migration 0008_events_constraints.sql ... OK`

- [ ] **Step 3: ci-health 확장 — name CHECK 가 살아있는지**

기존 `tests/integration/ci-health.spec.ts` 에 추가:

```ts
  it("events name CHECK rejects unknown names", async () => {
    const { error } = await admin.from("events").insert({
      name: "nonsense_event",
      props: {},
    });
    expect(error?.code).toBe("23514"); // check_violation
  });
```

- [ ] **Step 4: 실행**

Run: `pnpm test:integration ci-health`
Expected: 기존 + 신규 1 case PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0008_events_constraints.sql tests/integration/ci-health.spec.ts
git commit -m "feat(db): events name CHECK (NOT VALID → VALIDATE) + props gin + created_at idx"
```

---

### Task 2: service_role admin client — **lazy singleton** (PR-A)

**Files:**
- Create: `src/lib/supabase/admin.ts`
- Create: `src/lib/supabase/admin.spec.ts`

모듈 top-level throw 는 Next.js build · dotenv 늦은 로드 · vitest import 순서에서 전부 문제. 호출 시점에만 env 검증.

- [ ] **Step 1: 실패 테스트**

```ts
// src/lib/supabase/admin.spec.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

describe("adminClient()", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("throws at call-time (not import-time) when SUPABASE_SECRET_KEY missing", async () => {
    process.env.SUPABASE_SECRET_KEY = "";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://x.supabase.co";
    // Import must succeed — top-level throw would break every consumer.
    const mod = await import("./admin");
    expect(() => mod.adminClient()).toThrow(/SUPABASE_SECRET_KEY/);
  });

  it("returns a client when keys are present", async () => {
    process.env.SUPABASE_SECRET_KEY = "sb_secret_test";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://x.supabase.co";
    const { adminClient } = await import("./admin");
    expect(typeof adminClient().from).toBe("function");
  });

  it("memoizes the client across calls", async () => {
    process.env.SUPABASE_SECRET_KEY = "sb_secret_test";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://x.supabase.co";
    const { adminClient } = await import("./admin");
    expect(adminClient()).toBe(adminClient());
  });
});
```

- [ ] **Step 2: 실행 → 실패 확인**

Run: `pnpm test src/lib/supabase/admin.spec.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: 구현**

```ts
// src/lib/supabase/admin.ts
import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

export function adminClient(): SupabaseClient {
  if (client) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_URL is required for admin client");
  if (!secret) throw new Error("SUPABASE_SECRET_KEY is required for admin client");
  client = createClient(url, secret, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return client;
}
```

- [ ] **Step 4: 재실행**

Run: `pnpm test src/lib/supabase/admin.spec.ts`
Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add src/lib/supabase/admin.ts src/lib/supabase/admin.spec.ts
git commit -m "feat(supabase): add lazy service_role admin client"
```

---

### Task 3: AnalyticsEvent 런타임 Zod 스키마 (PR-A)

**Files:**
- Create: `src/lib/analytics/schema.ts`
- Create: `src/lib/analytics/schema.spec.ts`
- Create: `src/lib/analytics/schema-union-parity.spec.ts`

**Design**: `schema.ts` 는 **Zod 런타임 검증 전용**. TS 타입은 export 하지 않는다 — `track.ts` 의 discriminated union 이 SoT. 대신 두 쪽이 drift 하지 않도록 `schema-union-parity.spec.ts` 로 방어.

- [ ] **Step 1: 런타임 스키마 테스트**

```ts
// src/lib/analytics/schema.spec.ts
import { describe, it, expect } from "vitest";
import { analyticsEventSchema } from "./schema";

describe("analyticsEventSchema", () => {
  it("accepts ai_generated with required props", () => {
    const r = analyticsEventSchema.safeParse({
      name: "ai_generated",
      props: {
        actionLogId: "11111111-1111-4111-8111-111111111111",
        latencyMs: 1234,
        fallback: false,
        keywordCoverage: 1,
        promptVersion: "v1",
      },
    });
    expect(r.success).toBe(true);
  });

  it("rejects unknown event names (matches DB CHECK)", () => {
    const r = analyticsEventSchema.safeParse({ name: "nonsense", props: {} });
    expect(r.success).toBe(false);
  });

  it("rejects ai_generated when keywordCoverage is not numeric", () => {
    const r = analyticsEventSchema.safeParse({
      name: "ai_generated",
      props: {
        actionLogId: "11111111-1111-4111-8111-111111111111",
        latencyMs: 1234,
        fallback: false,
        keywordCoverage: "high",
        promptVersion: "v1",
      },
    });
    expect(r.success).toBe(false);
  });
});
```

- [ ] **Step 2: union ↔ schema parity 테스트**

```ts
// src/lib/analytics/schema-union-parity.spec.ts
import { describe, it, expect } from "vitest";
import { analyticsEventSchema } from "./schema";
import type { AnalyticsEvent } from "./track";

// One fixture per arm of the union. TypeScript compile = proof every name is covered.
const fixtures: Record<AnalyticsEvent["name"], AnalyticsEvent> = {
  user_signed_up: { name: "user_signed_up", props: { provider: "email" } },
  group_created: { name: "group_created", props: { groupId: "11111111-1111-4111-8111-111111111111", memberTarget: 3 } },
  invite_sent: { name: "invite_sent", props: { groupId: "11111111-1111-4111-8111-111111111111" } },
  invite_opened: { name: "invite_opened", props: { groupId: "11111111-1111-4111-8111-111111111111", fromOrganicUser: true } },
  challenge_created: { name: "challenge_created", props: { challengeId: "11111111-1111-4111-8111-111111111111", penaltyAmount: 3000, goalCount: 3 } },
  challenge_signed: { name: "challenge_signed", props: { challengeId: "11111111-1111-4111-8111-111111111111", userId: "22222222-2222-4222-8222-222222222222" } },
  challenge_activated: { name: "challenge_activated", props: { challengeId: "11111111-1111-4111-8111-111111111111", signToActiveMs: 1000 } },
  action_started: { name: "action_started", props: { challengeId: "11111111-1111-4111-8111-111111111111" } },
  keywords_shown: { name: "keywords_shown", props: { activityType: "gym", shownKeywords: ["펌핑"], source: "initial" } },
  keywords_reroll: { name: "keywords_reroll", props: { activityType: "gym", rerollCount: 1 } },
  keyword_selected: { name: "keyword_selected", props: { keyword: "펌핑", selectedCount: 1, activityType: "gym", action: "add" } },
  memo_fallback_opened: { name: "memo_fallback_opened", props: {} },
  action_logged: { name: "action_logged", props: { challengeId: "11111111-1111-4111-8111-111111111111", activityType: "gym", selectedKeywords: ["펌핑"], keywordCount: 1, hasMemo: false, rerollCount: 0, photoSize: 0 } },
  ai_generated: { name: "ai_generated", props: { actionLogId: "11111111-1111-4111-8111-111111111111", latencyMs: 100, fallback: false, keywordCoverage: 1, promptVersion: "v1" } },
  feed_view: { name: "feed_view", props: { unreadCount: 0 } },
  kudos_given: { name: "kudos_given", props: { emoji: "🔥", actionLogId: "11111111-1111-4111-8111-111111111111" } },
  notification_sent: { name: "notification_sent", props: { type: "start" } },
  notification_opened: { name: "notification_opened", props: { type: "start" } },
  penalty_displayed: { name: "penalty_displayed", props: { amount: 3000 } },
};

describe("TS union ↔ Zod schema parity", () => {
  for (const [name, fixture] of Object.entries(fixtures)) {
    it(`Zod schema accepts ${name}`, () => {
      const r = analyticsEventSchema.safeParse(fixture);
      expect(r.success, JSON.stringify(r, null, 2)).toBe(true);
    });
  }
});
```

이 테스트가 실패하면 **TS union 에 새 arm 을 추가했는데 Zod 업데이트를 깜빡한 것**. TypeScript 가 `Record<AnalyticsEvent["name"], …>` 의 키 누락을 잡아줘서 역방향(Zod 에 추가하고 union 빠뜨림) 은 fixture object literal 이 unknown key 라 typecheck 실패로 잡힌다.

- [ ] **Step 3: 실행 → 실패**

Run: `pnpm test src/lib/analytics/schema.spec.ts src/lib/analytics/schema-union-parity.spec.ts`
Expected: FAIL — schema 모듈 미존재.

- [ ] **Step 4: 구현**

```ts
// src/lib/analytics/schema.ts
// Runtime validation for analytics events. The TS discriminated union in
// track.ts is the source of truth — this file mirrors it for runtime.
// A parity test (schema-union-parity.spec.ts) fails if the two drift.
import { z } from "zod";
import { ACTIVITY_TYPES } from "@/lib/keywords/pool";

const activityType = z.enum(ACTIVITY_TYPES);
const uuid = z.string().uuid();

export const analyticsEventSchema = z.discriminatedUnion("name", [
  z.object({ name: z.literal("user_signed_up"), props: z.object({ provider: z.enum(["kakao", "email"]), invitedBy: z.string().optional() }) }),
  z.object({ name: z.literal("group_created"), props: z.object({ groupId: uuid, memberTarget: z.number().int().min(2) }) }),
  z.object({ name: z.literal("invite_sent"), props: z.object({ groupId: uuid }) }),
  z.object({ name: z.literal("invite_opened"), props: z.object({ groupId: uuid, fromOrganicUser: z.boolean() }) }),
  z.object({ name: z.literal("challenge_created"), props: z.object({ challengeId: uuid, penaltyAmount: z.number().int(), goalCount: z.number().int() }) }),
  z.object({ name: z.literal("challenge_signed"), props: z.object({ challengeId: uuid, userId: uuid }) }),
  z.object({ name: z.literal("challenge_activated"), props: z.object({ challengeId: uuid, signToActiveMs: z.number().int() }) }),
  z.object({ name: z.literal("action_started"), props: z.object({ challengeId: uuid }) }),
  z.object({ name: z.literal("keywords_shown"), props: z.object({ activityType, shownKeywords: z.array(z.string()).min(1), source: z.enum(["initial", "reroll"]) }) }),
  z.object({ name: z.literal("keywords_reroll"), props: z.object({ activityType, rerollCount: z.number().int().min(1) }) }),
  z.object({ name: z.literal("keyword_selected"), props: z.object({ keyword: z.string(), selectedCount: z.number().int().min(0), activityType, action: z.enum(["add", "remove"]) }) }),
  z.object({ name: z.literal("memo_fallback_opened"), props: z.object({}).strict() }),
  z.object({ name: z.literal("action_logged"), props: z.object({ challengeId: uuid, activityType, selectedKeywords: z.array(z.string()).min(1), keywordCount: z.number().int().min(1).max(3), hasMemo: z.boolean(), rerollCount: z.number().int().min(0).max(5), photoSize: z.number().int().min(0) }) }),
  z.object({ name: z.literal("ai_generated"), props: z.object({ actionLogId: uuid, latencyMs: z.number().int().min(0), fallback: z.boolean(), keywordCoverage: z.number().min(0).max(1), promptVersion: z.string() }) }),
  z.object({ name: z.literal("feed_view"), props: z.object({ unreadCount: z.number().int().min(0) }) }),
  z.object({ name: z.literal("kudos_given"), props: z.object({ emoji: z.string(), actionLogId: uuid }) }),
  z.object({ name: z.literal("notification_sent"), props: z.object({ type: z.enum(["start", "deadline"]) }) }),
  z.object({ name: z.literal("notification_opened"), props: z.object({ type: z.enum(["start", "deadline"]) }) }),
  z.object({ name: z.literal("penalty_displayed"), props: z.object({ amount: z.number().int() }) }),
]);
```

> Note: `AnalyticsEvent` TS 타입은 **이 파일에서 export 하지 않는다**. Zod infer 가 TS union 과 미묘하게 달라져 (예: `Record<string, never>` ↔ `{}`) 호출부에 회귀를 일으킬 수 있다. TS union 은 `track.ts` 에서 계속 유지.

- [ ] **Step 5: 재실행**

Run: `pnpm test src/lib/analytics/schema.spec.ts src/lib/analytics/schema-union-parity.spec.ts`
Expected: 3 + 19 passed.

- [ ] **Step 6: Commit**

```bash
git add src/lib/analytics/schema.ts src/lib/analytics/schema.spec.ts src/lib/analytics/schema-union-parity.spec.ts
git commit -m "feat(analytics): add runtime Zod schema + union parity guard"
```

---

### Task 4: track() 를 실 insert 로 교체 + 호출부 정리 (PR-A)

**Files:**
- Modify: `src/lib/analytics/track.ts`
- Create: `src/lib/analytics/track.spec.ts`
- Modify: `src/app/(app)/action/_actions.ts` · `src/app/(app)/pledge/_actions.ts` · `src/app/(app)/challenge/new/_actions.ts` · `src/app/(app)/challenge/[id]/_actions.ts` (`.catch` 제거)

`track` 은 never-throw. 기존 호출부의 `.catch(console.error)` 는 dead code 라 함께 정리.

- [ ] **Step 1: 실패 테스트**

```ts
// src/lib/analytics/track.spec.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const insertMock = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({
  adminClient: () => ({ from: () => ({ insert: insertMock }) }),
}));

import { track } from "./track";

describe("track", () => {
  beforeEach(() => {
    insertMock.mockReset();
    insertMock.mockResolvedValue({ error: null });
  });

  it("inserts into events with normalized payload", async () => {
    await track({
      name: "kudos_given",
      props: { emoji: "🔥", actionLogId: "11111111-1111-4111-8111-111111111111" },
    });
    expect(insertMock).toHaveBeenCalledTimes(1);
    expect(insertMock).toHaveBeenCalledWith({
      name: "kudos_given",
      props: { emoji: "🔥", actionLogId: "11111111-1111-4111-8111-111111111111" },
      user_id: null,
    });
  });

  it("passes userId when provided", async () => {
    await track(
      {
        name: "ai_generated",
        props: {
          actionLogId: "11111111-1111-4111-8111-111111111111",
          latencyMs: 1500,
          fallback: false,
          keywordCoverage: 1,
          promptVersion: "v1",
        },
      },
      { userId: "22222222-2222-4222-8222-222222222222" },
    );
    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: "22222222-2222-4222-8222-222222222222" }),
    );
  });

  it("swallows insert errors (does not throw)", async () => {
    insertMock.mockResolvedValue({ error: { message: "boom" } });
    await expect(
      track({ name: "memo_fallback_opened", props: {} }),
    ).resolves.toBeUndefined();
  });

  it("swallows schema validation errors without hitting DB", async () => {
    const bad = { name: "ai_generated", props: {} } as never;
    await expect(track(bad)).resolves.toBeUndefined();
    expect(insertMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: 실행 → 실패**

Run: `pnpm test src/lib/analytics/track.spec.ts`
Expected: FAIL — 현재 `track` 은 no-op.

- [ ] **Step 3: 구현**

```ts
// src/lib/analytics/track.ts — AnalyticsEvent TS union 은 이 파일이 SoT.
import type { ActivityType } from "@/lib/keywords/pool";
import { adminClient } from "@/lib/supabase/admin";
import { analyticsEventSchema } from "./schema";

export type AnalyticsEvent =
  | { name: "user_signed_up"; props: { provider: "kakao" | "email"; invitedBy?: string } }
  | { name: "group_created"; props: { groupId: string; memberTarget: number } }
  | { name: "invite_sent"; props: { groupId: string } }
  | { name: "invite_opened"; props: { groupId: string; fromOrganicUser: boolean } }
  | { name: "challenge_created"; props: { challengeId: string; penaltyAmount: number; goalCount: number } }
  | { name: "challenge_signed"; props: { challengeId: string; userId: string } }
  | { name: "challenge_activated"; props: { challengeId: string; signToActiveMs: number } }
  | { name: "action_started"; props: { challengeId: string } }
  | { name: "keywords_shown"; props: { activityType: ActivityType; shownKeywords: string[]; source: "initial" | "reroll" } }
  | { name: "keywords_reroll"; props: { activityType: ActivityType; rerollCount: number } }
  | { name: "keyword_selected"; props: { keyword: string; selectedCount: number; activityType: ActivityType; action: "add" | "remove" } }
  | { name: "memo_fallback_opened"; props: Record<string, never> }
  | {
      name: "action_logged";
      props: {
        challengeId: string;
        activityType: ActivityType;
        selectedKeywords: string[];
        keywordCount: number;
        hasMemo: boolean;
        rerollCount: number;
        photoSize: number;
      };
    }
  | {
      name: "ai_generated";
      props: {
        actionLogId: string;
        latencyMs: number;
        fallback: boolean;
        keywordCoverage: number;
        promptVersion: string;
      };
    }
  | { name: "feed_view"; props: { unreadCount: number } }
  | { name: "kudos_given"; props: { emoji: string; actionLogId: string } }
  | { name: "notification_sent"; props: { type: "start" | "deadline" } }
  | { name: "notification_opened"; props: { type: "start" | "deadline" } }
  | { name: "penalty_displayed"; props: { amount: number } };

type TrackOptions = { userId?: string };

/**
 * Fire-and-forget analytics insert. Never throws.
 *
 * Why service_role: the events RLS policy `events_insert_self_or_anon` allows
 * only `user_id = auth.uid()` or `user_id is null`. System events (AI cost,
 * notification delivery) need to reference recipient user_ids that differ from
 * the acting session — admin client bypasses RLS cleanly. Zod validation
 * (schema.ts) replaces RLS as the defensive boundary on shape.
 */
export async function track<E extends AnalyticsEvent>(
  event: E,
  options: TrackOptions = {},
): Promise<void> {
  const parsed = analyticsEventSchema.safeParse(event);
  if (!parsed.success) {
    console.error("[track] schema violation", parsed.error.flatten());
    return;
  }

  const { error } = await adminClient().from("events").insert({
    name: parsed.data.name,
    props: parsed.data.props,
    user_id: options.userId ?? null,
  });

  if (error) {
    console.error("[track] insert failed", { name: parsed.data.name, error });
  }
}
```

- [ ] **Step 4: 호출부 `.catch` 정리**

`src/app/(app)/action/_actions.ts` 의 두 `track(...).catch(...)` 를:
```ts
void track({ name: "action_logged", props: { ... } });
void track({ name: "ai_generated", props: { ... } });
```

`src/app/(app)/pledge/_actions.ts:30` · `src/app/(app)/challenge/new/_actions.ts:36` · `src/app/(app)/challenge/[id]/_actions.ts:41` 의 `await track(...)` 은 **서버 응답 지연을 줄이려면 `void track(...)`** 로 통일. 단, 응답 본문에 `success` 를 리턴한 **뒤** 해도 상관없다면 현재 `await` 유지도 무해. **이 plan 에선 응답 속도 우선 → `void` 로 변경**.

- [ ] **Step 5: 재실행**

Run: `pnpm test src/lib/analytics/track.spec.ts && pnpm typecheck`
Expected: 4 passed, 0 typecheck errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/analytics/track.ts src/lib/analytics/track.spec.ts \
        src/app/\(app\)/action/_actions.ts \
        src/app/\(app\)/pledge/_actions.ts \
        src/app/\(app\)/challenge/new/_actions.ts \
        src/app/\(app\)/challenge/\[id\]/_actions.ts
git commit -m "feat(analytics): track writes to events + drop dead .catch at call sites"
```

> **PR-A 체크포인트**: Task 1~4 가 끝난 상태에서 `pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration` 전부 green 이면 PR-A 올리기.

---

### Task 5: ai_cost_log — scope 컬럼 + micros 단위 (PR-B)

**Files:**
- Create: `supabase/migrations/0009_ai_cost_log.sql`

`scope ∈ {'prod','test'}` 로 D-014 환경에서 test 호출이 prod 누적을 오염시키지 않는다. 단위는 `micros` (1¢ = 10,000 micros).

- [ ] **Step 1: 파일 작성**

```sql
-- 0009_ai_cost_log.sql
-- Why: PRD §5.3 AC-7 "월 AI 비용 한도 초과 시 자동 템플릿 모드".
-- Scope 컬럼: test/prod 호출 격리 (D-014: 단일 Supabase 프로젝트 공유).
-- 단위 micros: 1 cent = 10_000 micros. POC 스케일 호출당 비용이 1¢ 미만이라
--             cent floor 가 예산 가드의 선형성을 깬다.

create table public.ai_cost_log (
  month date not null,
  scope text not null check (scope in ('prod','test')),
  total_micros bigint not null default 0 check (total_micros >= 0),
  updated_at timestamptz not null default now(),
  primary key (month, scope)
);

alter table public.ai_cost_log enable row level security;
-- RLS 정책 없음 = service_role 외 deny.

create or replace function public.add_ai_cost(p_micros int, p_scope text)
returns bigint
language plpgsql
security definer
set search_path = public as $$
declare
  v_month date := date_trunc('month', now() at time zone 'utc')::date;
  v_total bigint;
begin
  if p_micros < 0 then
    raise exception 'p_micros must be >= 0';
  end if;
  if p_scope not in ('prod','test') then
    raise exception 'p_scope must be prod or test';
  end if;

  insert into public.ai_cost_log (month, scope, total_micros, updated_at)
    values (v_month, p_scope, p_micros, now())
    on conflict (month, scope) do update
      set total_micros = public.ai_cost_log.total_micros + excluded.total_micros,
          updated_at = now();

  select total_micros into v_total
    from public.ai_cost_log
    where month = v_month and scope = p_scope;
  return v_total;
end;
$$;

revoke all on function public.add_ai_cost(int, text) from public, anon, authenticated;
grant execute on function public.add_ai_cost(int, text) to service_role;

-- truncate_test_data 덮어쓰기:
--   1) scope='test' 행만 0 리셋 (prod 누적 보호)
--   2) user_id=null 인 events 도 정리 (track() 의 anon 이벤트 누수 방지)
create or replace function public.truncate_test_data()
returns void
language plpgsql security definer
set search_path = public as $$
declare
  v_test_user_ids uuid[];
begin
  select coalesce(array_agg(id), array[]::uuid[]) into v_test_user_ids
    from auth.users where email like '%@test.local';

  if array_length(v_test_user_ids, 1) is not null then
    delete from public.kudos where user_id = any(v_test_user_ids);
    delete from public.action_logs where user_id = any(v_test_user_ids);
    delete from public.challenge_participants where user_id = any(v_test_user_ids);
    delete from public.challenges where group_id in (
      select id from public.groups where owner_id = any(v_test_user_ids)
    );
    delete from public.invites where created_by = any(v_test_user_ids);
    delete from public.group_members where user_id = any(v_test_user_ids);
    delete from public.groups where owner_id = any(v_test_user_ids);
    delete from public.push_subscriptions where user_id = any(v_test_user_ids);
    delete from public.events where user_id = any(v_test_user_ids);
    delete from auth.users where id = any(v_test_user_ids);
  end if;

  -- anon (user_id IS NULL) events 중 최근 24h 것만 정리.
  -- 기존 prod 분석 데이터(더 오래된) 보호. test 가 매 run 마다 찍는 anon event 만 타깃.
  delete from public.events
    where user_id is null
      and created_at > now() - interval '24 hours';

  -- scope='test' 의 현재 월 누적만 리셋. prod 는 건드리지 않음.
  update public.ai_cost_log
    set total_micros = 0, updated_at = now()
    where month = date_trunc('month', now() at time zone 'utc')::date
      and scope = 'test';
end;
$$;

revoke all on function public.truncate_test_data() from public, anon, authenticated;
grant execute on function public.truncate_test_data() to service_role;
```

- [ ] **Step 2: 적용**

Run: `pnpm db:push`
Expected: `Applying migration 0009_ai_cost_log.sql ... OK`

- [ ] **Step 3: Sanity integration test**

```ts
// tests/integration/ai/cost-log-rpc.spec.ts
import { describe, it, expect } from "vitest";
import { admin } from "../setup";

describe("add_ai_cost RPC", () => {
  it("accumulates micros atomically per (month, scope)", async () => {
    const a = await admin.rpc("add_ai_cost", { p_micros: 10_000, p_scope: "test" });
    expect(a.error).toBeNull();
    const b = await admin.rpc("add_ai_cost", { p_micros: 15_000, p_scope: "test" });
    expect(b.error).toBeNull();
    expect(Number(b.data)).toBeGreaterThanOrEqual(25_000);
  });

  it("keeps prod and test scopes isolated", async () => {
    await admin.rpc("add_ai_cost", { p_micros: 5_000, p_scope: "test" });
    const { data: rows } = await admin
      .from("ai_cost_log")
      .select("scope, total_micros")
      .eq("month", new Date().toISOString().slice(0, 7) + "-01");
    const test = rows?.find((r) => r.scope === "test");
    expect(Number(test?.total_micros)).toBeGreaterThan(0);
    // prod 행은 truncate_test_data 가 건드리지 않음 — 존재 여부는 환경에 따라 다르므로 미검증.
  });

  it("rejects negative micros", async () => {
    const { error } = await admin.rpc("add_ai_cost", { p_micros: -1, p_scope: "test" });
    expect(error).not.toBeNull();
  });

  it("rejects invalid scope", async () => {
    const { error } = await admin.rpc("add_ai_cost", { p_micros: 1, p_scope: "staging" });
    expect(error).not.toBeNull();
  });
});
```

- [ ] **Step 4: 실행**

Run: `pnpm test:integration cost-log-rpc`
Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0009_ai_cost_log.sql tests/integration/ai/cost-log-rpc.spec.ts
git commit -m "feat(db): ai_cost_log(month,scope) + add_ai_cost RPC + truncate scope guard"
```

---

### Task 6: 비용 계산 유틸 — micros 단위 (PR-B)

**Files:**
- Create: `src/lib/ai/cost.ts`
- Create: `src/lib/ai/cost.spec.ts`

OpenAI `gpt-4o-mini` 가격 (2026-04 기준, $/1M tokens): input $0.150 / output $0.600.
KRW 환산은 USD→KRW 고정 1,400 (킥오프 가정). 단위는 **micros = 1/10,000 cent**.

**수학 검증 (미리)**:
- 250 in + 200 out: (250 · 0.15 + 200 · 0.6) / 1e6 USD = 0.0001575 USD = 0.01575 ¢ = **157.5 micros → round 158**.
- 선형성: 10x 토큰 → 10x micros. `Math.round` 로 인한 끝자리 미세 오차는 허용.

- [ ] **Step 1: 실패 테스트**

```ts
// src/lib/ai/cost.spec.ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { estimateCostMicros, costMicrosToKrw, monthlyBudgetMicros } from "./cost";

describe("cost estimation (micros)", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("estimateCostMicros: 250 in + 200 out ≈ 158 micros", () => {
    // USD = (250*0.15 + 200*0.6) / 1_000_000 = 0.0001575
    // micros = USD * 100 * 10_000 = 157.5 → round 158
    expect(estimateCostMicros({ inputTokens: 250, outputTokens: 200 })).toBe(158);
  });

  it("is linear across scales", () => {
    const small = estimateCostMicros({ inputTokens: 1000, outputTokens: 500 });
    const big = estimateCostMicros({ inputTokens: 10_000, outputTokens: 5_000 });
    // Tolerate ±1 from Math.round on boundary.
    expect(Math.abs(big - small * 10)).toBeLessThanOrEqual(1);
  });

  it("returns 0 for zero tokens (no min-floor)", () => {
    expect(estimateCostMicros({ inputTokens: 0, outputTokens: 0 })).toBe(0);
  });

  it("costMicrosToKrw uses 1400 USD/KRW", () => {
    // 1_000_000 micros = 100 cents = $1 → 1400 KRW
    expect(costMicrosToKrw(1_000_000)).toBe(1400);
  });

  it("monthlyBudgetMicros reads AI_MONTHLY_BUDGET_KRW", () => {
    vi.stubEnv("AI_MONTHLY_BUDGET_KRW", "70000");
    // 70000 KRW / 1400 USD/KRW = 50 USD = 5000 cents = 50_000_000 micros
    expect(monthlyBudgetMicros()).toBe(50_000_000);
  });

  it("monthlyBudgetMicros defaults to 50000 KRW when env missing", () => {
    vi.stubEnv("AI_MONTHLY_BUDGET_KRW", "");
    // 50000 / 1400 ≈ 35.714 USD → 3571.4 cents → floor 3571 cents = 35_710_000 micros
    expect(monthlyBudgetMicros()).toBe(35_710_000);
  });
});
```

- [ ] **Step 2: 실행 → 실패**

Run: `pnpm test src/lib/ai/cost.spec.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: 구현**

```ts
// src/lib/ai/cost.ts
// OpenAI gpt-4o-mini pricing (2026-04 snapshot):
//   input  = $0.15 per 1M tokens
//   output = $0.60 per 1M tokens
// Source: https://openai.com/api/pricing — verify on model upgrade.
const INPUT_USD_PER_TOKEN = 0.15 / 1_000_000;
const OUTPUT_USD_PER_TOKEN = 0.6 / 1_000_000;

// Fixed FX for POC — kickoff assumption. Revisit monthly.
const USD_TO_KRW = 1400;

// 1 cent = 10_000 micros. Storing in micros avoids floor-to-1-cent collapse at
// POC call volume (each call is sub-cent) which previously made the budget
// guard degrade to "N calls" instead of tracking real cost.
const MICROS_PER_CENT = 10_000;

type Tokens = { inputTokens: number; outputTokens: number };

export function estimateCostMicros({ inputTokens, outputTokens }: Tokens): number {
  const usd = inputTokens * INPUT_USD_PER_TOKEN + outputTokens * OUTPUT_USD_PER_TOKEN;
  const micros = usd * 100 * MICROS_PER_CENT;
  return Math.round(micros);
}

export function costMicrosToKrw(micros: number): number {
  const usd = micros / (100 * MICROS_PER_CENT);
  return Math.round(usd * USD_TO_KRW);
}

export function monthlyBudgetMicros(): number {
  const raw = process.env.AI_MONTHLY_BUDGET_KRW;
  const krw = raw && raw.length > 0 ? Number(raw) : 50_000;
  const usd = krw / USD_TO_KRW;
  const cents = Math.floor(usd * 100);
  return cents * MICROS_PER_CENT;
}
```

- [ ] **Step 4: 재실행**

Run: `pnpm test src/lib/ai/cost.spec.ts`
Expected: 6 passed.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/cost.ts src/lib/ai/cost.spec.ts
git commit -m "feat(ai): cost estimator in micros (no cent floor) + monthly budget helper"
```

---

### Task 7: generateDiary — 예산 가드 + 비용 기록 (self-retry **제거**) (PR-B)

**Files:**
- Modify: `src/lib/ai/diary.ts`
- Create: `src/lib/ai/diary.spec.ts`

이 plan 에서 self-retry 는 **하지 않는다** (Revision History 참조). "같은 프롬프트 재시도" 는 비용 2배 대비 효과가 통계적으로 낮고, "누락 키워드 지시 주입" 은 wall-clock timeout 재설계와 함께 별도 plan 에서 다뤄야 한다. 본 plan 은 예산 가드 + 비용 기록 + 템플릿 폴백.

- [ ] **Step 1: 실패 테스트**

```ts
// src/lib/ai/diary.spec.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const createMock = vi.fn();
vi.mock("openai", () => ({
  default: class {
    chat = { completions: { create: createMock } };
  },
}));

const rpcMock = vi.fn();
const selectChain = {
  eq: (_col: string, _val: string) => ({
    eq: (_col2: string, _val2: string) => ({
      maybeSingle: () => Promise.resolve({ data: null, error: null }),
    }),
  }),
};
const fromMock = vi.fn(() => ({ select: () => selectChain }));

vi.mock("@/lib/supabase/admin", () => ({
  adminClient: () => ({
    rpc: rpcMock,
    from: fromMock,
  }),
}));

import { generateDiary, templateFallback } from "./diary";

function okCompletion(content: string, { prompt = 200, completion = 150 } = {}) {
  return {
    choices: [{ message: { content } }],
    usage: { prompt_tokens: prompt, completion_tokens: completion },
  };
}

beforeEach(() => {
  createMock.mockReset();
  rpcMock.mockReset();
  fromMock.mockClear();
  rpcMock.mockResolvedValue({ data: 0, error: null });
  vi.stubEnv("OPENAI_API_KEY", "sk-test");
  vi.stubEnv("AI_MONTHLY_BUDGET_KRW", "50000");
  vi.stubEnv("NODE_ENV", "test");
});

afterEach(() => vi.unstubAllEnvs());

describe("generateDiary", () => {
  it("returns AI summary when keywords covered and records cost", async () => {
    createMock.mockResolvedValue(okCompletion("오늘 헬스에서 펌핑이 제대로 왔어요."));
    const r = await generateDiary({
      activityType: "gym",
      keywords: ["펌핑"],
    });
    expect(r.fallback).toBe(false);
    expect(r.summary).toContain("펌핑");
    expect(rpcMock).toHaveBeenCalledWith(
      "add_ai_cost",
      expect.objectContaining({ p_scope: "test" }),
    );
  });

  it("falls back to template when AI response misses keyword (no retry)", async () => {
    createMock.mockResolvedValue(okCompletion("오늘 운동 좋았어요.")); // "하체" 누락
    const r = await generateDiary({
      activityType: "gym",
      keywords: ["하체"],
    });
    expect(createMock).toHaveBeenCalledTimes(1); // self-retry 없음
    expect(r.fallback).toBe(true);
    expect(r.summary).toContain("하체");
  });

  it("skips OpenAI entirely when monthly budget exceeded", async () => {
    // budget = 50000 / 1400 = ~35.71 USD = ~35_710_000 micros
    // Seed 999_999_999 to exceed.
    const over = {
      eq: (_c: string, _v: string) => ({
        eq: (_c2: string, _v2: string) => ({
          maybeSingle: () => Promise.resolve({ data: { total_micros: 999_999_999 }, error: null }),
        }),
      }),
    };
    fromMock.mockReturnValueOnce({ select: () => over } as never);

    const r = await generateDiary({
      activityType: "gym",
      keywords: ["펌핑"],
    });
    expect(createMock).not.toHaveBeenCalled();
    expect(rpcMock).not.toHaveBeenCalled();
    expect(r.fallback).toBe(true);
    expect(r.summary).toContain("펌핑");
  });

  it("falls back with template when OPENAI_API_KEY missing", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    const r = await generateDiary({ activityType: "gym", keywords: ["펌핑"] });
    expect(createMock).not.toHaveBeenCalled();
    expect(r.fallback).toBe(true);
    expect(r.summary).toContain("펌핑");
  });

  it("uses displayName in template fallback", () => {
    expect(
      templateFallback({ activityType: "gym", keywords: ["스쿼트"] }, "지우"),
    ).toContain("지우");
  });
});
```

- [ ] **Step 2: 실행 → 실패**

Run: `pnpm test src/lib/ai/diary.spec.ts`
Expected: FAIL — 현재 `generateDiary` 는 예산 가드 · 비용 기록 · admin import 모두 없음.

- [ ] **Step 3: 구현 (diary.ts 전면 교체)**

```ts
// src/lib/ai/diary.ts
import OpenAI from "openai";
import { adminClient } from "@/lib/supabase/admin";
import { estimateCostMicros, monthlyBudgetMicros } from "./cost";
import { PROMPT_VERSION, SYSTEM_PROMPT, buildUserPrompt, type DiaryPromptInput } from "./prompts";

const AI_TIMEOUT_MS = 4500; // PRD §5.3 AC-4 — P95 < 5s with 500ms buffer.

export type DiaryResult = {
  summary: string;
  fallback: boolean;
  keywordCoverage: number;
  latencyMs: number;
  promptVersion: string;
};

const ACTIVITY_LABEL_KO: Record<DiaryPromptInput["activityType"], string> = {
  running: "러닝",
  gym: "헬스",
  yoga: "요가",
  other: "운동",
};

export function templateFallback(input: DiaryPromptInput, displayName = "회원"): string {
  const label = ACTIVITY_LABEL_KO[input.activityType];
  const kw = input.keywords.join(" · ");
  return `${displayName}님, 오늘 ${label}에서 ${kw} 🔥 수고하셨어요!`;
}

function keywordCoverage(summary: string, keywords: string[]): number {
  if (keywords.length === 0) return 0;
  const hit = keywords.filter((kw) => summary.includes(kw)).length;
  return hit / keywords.length;
}

function currentMonthIso(): string {
  const d = new Date();
  d.setUTCDate(1);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}

function currentScope(): "prod" | "test" {
  // VERCEL_ENV distinguishes preview from production; NODE_ENV cannot
  // (Vercel sets NODE_ENV=production even on Preview). Preview budget must
  // stay isolated from prod accumulation under D-014.
  return process.env.VERCEL_ENV === "production" ? "prod" : "test";
}

async function readCurrentMonthCostMicros(scope: "prod" | "test"): Promise<number> {
  const { data, error } = await adminClient()
    .from("ai_cost_log")
    .select("total_micros")
    .eq("month", currentMonthIso())
    .eq("scope", scope)
    .maybeSingle();
  if (error || !data) return 0;
  return Number(data.total_micros ?? 0);
}

async function logCost(micros: number, scope: "prod" | "test"): Promise<void> {
  const { error } = await adminClient().rpc("add_ai_cost", { p_micros: micros, p_scope: scope });
  if (error) console.error("[generateDiary] add_ai_cost failed", error);
}

function templateResult(input: DiaryPromptInput, displayName: string | undefined, started: number): DiaryResult {
  return {
    summary: templateFallback(input, displayName),
    fallback: true,
    keywordCoverage: 0,
    latencyMs: Date.now() - started,
    promptVersion: PROMPT_VERSION,
  };
}

export async function generateDiary(
  input: DiaryPromptInput,
  options: { displayName?: string; signal?: AbortSignal } = {},
): Promise<DiaryResult> {
  const started = Date.now();
  const scope = currentScope();

  // Budget guard (PRD §5.3 AC-7).
  const budget = monthlyBudgetMicros();
  const spent = await readCurrentMonthCostMicros(scope);
  if (spent >= budget) {
    return templateResult(input, options.displayName, started);
  }

  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL ?? "gpt-4o-mini";
  if (!apiKey) return templateResult(input, options.displayName, started);

  const client = new OpenAI({ apiKey });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);
  if (options.signal) {
    options.signal.addEventListener("abort", () => controller.abort(), { once: true });
  }

  try {
    const completion = await client.chat.completions.create(
      {
        model,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: buildUserPrompt(input) },
        ],
        temperature: 0.7,
        max_tokens: 220,
      },
      { signal: controller.signal },
    );

    // Always log cost — we paid for the call whether keywords covered or not.
    const usage = completion.usage;
    if (usage) {
      const micros = estimateCostMicros({
        inputTokens: usage.prompt_tokens ?? 0,
        outputTokens: usage.completion_tokens ?? 0,
      });
      if (micros > 0) await logCost(micros, scope);
    }

    const summary = completion.choices[0]?.message?.content?.trim() ?? "";
    const coverage = keywordCoverage(summary, input.keywords);

    if (summary && coverage >= 1) {
      return {
        summary,
        fallback: false,
        keywordCoverage: coverage,
        latencyMs: Date.now() - started,
        promptVersion: PROMPT_VERSION,
      };
    }
    // Keyword missing → template fallback. No self-retry (see Revision History).
    return templateResult(input, options.displayName, started);
  } catch (err) {
    console.error("[generateDiary] call failed", err);
    return templateResult(input, options.displayName, started);
  } finally {
    clearTimeout(timeout);
  }
}
```

- [ ] **Step 4: 재실행**

Run: `pnpm test src/lib/ai/diary.spec.ts`
Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/diary.ts src/lib/ai/diary.spec.ts
git commit -m "feat(ai): budget guard + cost logging in generateDiary (no self-retry)"
```

> **PR-B 체크포인트**: Task 5~7 이 끝난 상태에서 `pnpm test && pnpm test:integration` green 이면 PR-B 올리기.

---

### Task 8: submitActionLog 에 displayName 주입 — **회귀 방어 테스트 포함** (PR-C)

**Files:**
- Modify: `src/app/(app)/action/_actions.ts`
- Create: `src/app/(app)/action/_actions.spec.ts`

핵심: 테스트가 **"action 이 generateDiary 에 displayName 을 전달한다"** 를 직접 검증해야 한다. precondition-only 테스트는 구현 실수를 잡지 못한다.

- [ ] **Step 1: action 수정**

```ts
// src/app/(app)/action/_actions.ts — generateDiary 호출부 교체
    // 기존:
    // const diary = await generateDiary({
    //   activityType: parsed.data.activityType,
    //   keywords: parsed.data.selectedKeywords,
    //   memo: parsed.data.memo,
    // });

    const { data: profile } = await supabase
      .from("users")
      .select("display_name")
      .eq("id", user.id)
      .maybeSingle();
    const displayName = profile?.display_name ?? undefined;

    const diary = await generateDiary(
      {
        activityType: parsed.data.activityType,
        keywords: parsed.data.selectedKeywords,
        memo: parsed.data.memo,
      },
      { displayName },
    );
```

- [ ] **Step 2: 회귀 방어 unit 테스트**

```ts
// src/app/(app)/action/_actions.spec.ts
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const generateMock = vi.fn();
vi.mock("@/lib/ai/diary", () => ({
  generateDiary: (input: unknown, opts: unknown) => generateMock(input, opts),
}));
vi.mock("@/lib/analytics/track", () => ({ track: vi.fn() }));

const maybeSingleUser = vi.fn();
const insertLog = vi.fn();
const supabaseMock = {
  from: (t: string) => {
    if (t === "users") {
      return {
        select: () => ({ eq: () => ({ maybeSingle: maybeSingleUser }) }),
      };
    }
    if (t === "challenge_participants") {
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: () =>
                Promise.resolve({
                  data: {
                    user_id: "22222222-2222-4222-8222-222222222222",
                    challenges: {
                      status: "active",
                      start_at: new Date(Date.now() - 60_000).toISOString(),
                      end_at: new Date(Date.now() + 86_400_000).toISOString(),
                    },
                  },
                  error: null,
                }),
            }),
          }),
        }),
      };
    }
    if (t === "action_logs") {
      return {
        insert: () => ({
          select: () => ({
            single: () => insertLog(),
          }),
        }),
      };
    }
    throw new Error(`unexpected table ${t}`);
  },
};

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => supabaseMock,
}));

vi.mock("@/lib/auth/with-user", () => ({
  withUser:
    <I, O>(fn: (u: { id: string; email: string }, i: I) => Promise<O>) =>
    (input: I) =>
      fn({ id: "22222222-2222-4222-8222-222222222222", email: "u@test.local" }, input),
}));

import { submitActionLog } from "./_actions";

beforeEach(() => {
  generateMock.mockReset();
  maybeSingleUser.mockReset();
  insertLog.mockReset();
  generateMock.mockResolvedValue({
    summary: "AI summary",
    fallback: false,
    keywordCoverage: 1,
    latencyMs: 100,
    promptVersion: "v1",
  });
  insertLog.mockResolvedValue({
    data: { id: "33333333-3333-4333-8333-333333333333" },
    error: null,
  });
});

const validInput = {
  challengeId: "11111111-1111-4111-8111-111111111111",
  activityType: "gym" as const,
  photoUrl: "https://example.com/p.jpg",
  selectedKeywords: ["펌핑"],
  shownKeywords: ["펌핑", "집중"],
  rerollCount: 0,
};

describe("submitActionLog", () => {
  it("passes users.display_name into generateDiary", async () => {
    maybeSingleUser.mockResolvedValue({ data: { display_name: "지우" }, error: null });
    await submitActionLog(validInput);
    expect(generateMock).toHaveBeenCalledWith(
      expect.objectContaining({ activityType: "gym", keywords: ["펌핑"] }),
      expect.objectContaining({ displayName: "지우" }),
    );
  });

  it("passes undefined displayName when profile has no display_name", async () => {
    maybeSingleUser.mockResolvedValue({ data: null, error: null });
    await submitActionLog(validInput);
    expect(generateMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ displayName: undefined }),
    );
  });
});
```

이 테스트가 **실제 회귀 방어력** 을 가진다: action 에서 `display_name` 조회나 `{ displayName }` 전달을 지우면 mock 검증 불일치로 fail.

- [ ] **Step 3: integration precondition test (RLS 가 self-read 허용하는지)**

```ts
// tests/integration/actions/submit-action-log-display-name.spec.ts
import { describe, it, expect } from "vitest";
import { asUser } from "../setup";
import { createUser } from "../factories";

describe("display_name self-read RLS", () => {
  it("authed user can read their own display_name", async () => {
    const owner = await createUser({ displayName: "지우" });
    const client = await asUser(owner);
    const { data } = await client.from("users").select("display_name").eq("id", owner.id).single();
    expect(data?.display_name).toBe("지우");
  });
});
```

unit 테스트가 action 로직을, integration 테스트가 RLS 전제를 각각 커버.

- [ ] **Step 4: 전체 실행**

Run: `pnpm test src/app/\(app\)/action/_actions.spec.ts && pnpm test:integration submit-action-log-display-name`
Expected: 2 unit passed, 1 integration passed.

- [ ] **Step 5: Commit**

```bash
git add src/app/\(app\)/action/_actions.ts src/app/\(app\)/action/_actions.spec.ts \
        tests/integration/actions/submit-action-log-display-name.spec.ts
git commit -m "feat(action): pass display_name to generateDiary + regression guard"
```

---

### Task 9: End-to-end integration test (PR-C)

**Files:**
- Create: `tests/integration/analytics/events-insert.spec.ts`
- Create: `tests/integration/ai/cost-log-budget.spec.ts`

- [ ] **Step 1: events insert integration test**

```ts
// tests/integration/analytics/events-insert.spec.ts
import { describe, it, expect } from "vitest";
import { admin } from "../setup";
import { createUser } from "../factories";
import { track } from "@/lib/analytics/track";

describe("track() writes to events table", () => {
  it("inserts a row the admin client can read back", async () => {
    const u = await createUser();
    await track(
      {
        name: "kudos_given",
        props: { emoji: "🔥", actionLogId: "11111111-1111-4111-8111-111111111111" },
      },
      { userId: u.id },
    );

    const { data, error } = await admin
      .from("events")
      .select("name, props, user_id")
      .eq("user_id", u.id)
      .order("created_at", { ascending: false })
      .limit(1);
    expect(error).toBeNull();
    expect(data?.[0]?.name).toBe("kudos_given");
    expect((data?.[0]?.props as Record<string, unknown>).emoji).toBe("🔥");
  });

  it("swallows CHECK-violating names (unknown event → no row, no throw)", async () => {
    const u = await createUser();
    await track(
      { name: "nonsense_event" as never, props: {} as never },
      { userId: u.id },
    );
    const { data } = await admin
      .from("events")
      .select("name")
      .eq("user_id", u.id);
    expect(data).toEqual([]);
  });
});
```

- [ ] **Step 2: cost-log-budget integration test**

```ts
// tests/integration/ai/cost-log-budget.spec.ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { admin } from "../setup";
import { generateDiary } from "@/lib/ai/diary";

afterEach(() => vi.unstubAllEnvs());

describe("ai_cost_log budget guard", () => {
  it("skips OpenAI when current (month, scope='test') exceeds budget", async () => {
    // Force a monthly budget of 10_000 micros (= 1 cent) by setting KRW low.
    vi.stubEnv("AI_MONTHLY_BUDGET_KRW", "14"); // 14 KRW / 1400 * 100 cents * 10_000 micros = 10_000
    vi.stubEnv("OPENAI_API_KEY", "sk-should-not-be-used");
    vi.stubEnv("NODE_ENV", "test");

    // Seed the test-scope cost log above the budget.
    const seeded = await admin.rpc("add_ai_cost", { p_micros: 50_000, p_scope: "test" });
    expect(seeded.error).toBeNull();

    const started = Date.now();
    const r = await generateDiary({
      activityType: "gym",
      keywords: ["펌핑"],
    });
    const elapsed = Date.now() - started;

    expect(r.fallback).toBe(true);
    expect(r.summary).toContain("펌핑");
    expect(elapsed).toBeLessThan(500); // no network call
  });
});
```

- [ ] **Step 3: 실행**

Run: `pnpm test:integration events-insert cost-log-budget`
Expected: 3 passed total.

- [ ] **Step 4: Full integration suite**

Run: `pnpm test:integration`
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add tests/integration/analytics/events-insert.spec.ts tests/integration/ai/cost-log-budget.spec.ts
git commit -m "test(integration): events insert + ai budget guard end-to-end"
```

---

### Task 10: 전체 검증 + DECISIONS D-017 (PR-C)

**Files:**
- Modify: `docs/TEAM_SHARE_DECISIONS.md`

- [ ] **Step 1: 전체 검증 체인**

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration`
Expected: 전부 green.

- [ ] **Step 2: DECISIONS 엔트리 추가**

`docs/TEAM_SHARE_DECISIONS.md` 상단의 `### D-016` 바로 **위에** 추가:

```markdown
### D-017 — analytics 이벤트는 service_role admin client 로 insert하고 Zod 로 런타임 검증, AI 월예산은 (month, scope) 분리된 micros 테이블 + RPC로 가드

- **날짜**: 2026-04-30
- **상태**: ✅ Active
- **참여자**: Ian

- **맥락 (Context)**
  - PRD §9 이벤트 로깅 + §5.3 AC-7 월 예산 폴백을 end-to-end 로 배선해야 한다.
  - D-014 에 따라 Supabase 프로젝트 1 개를 local/CI/Preview 가 공유 → test 호출이 prod 누적을 오염시키면 안 된다.
  - OpenAI gpt-4o-mini POC 스케일 호출 비용이 **호출당 1 cent 미만** — cent 단위 저장은 선형성/누적 의미를 잃는다.

- **이벤트 로깅 옵션**
  - A) Server Action 세션 client 로 events insert — 거부: `events_insert_self_or_anon` 정책상 system 이벤트(AI 비용·알림 발송 등 acting session 과 다른 user_id) insert 불가능. RLS 가 `name` 은 CHECK 로 강제해도 **`props` shape 은 못 본다**.
  - B) Edge Function + 큐 — 거부: POC 범위 초과.
  - C) **service_role admin client 직접 insert + Zod 런타임 검증 (채택)** — `import "server-only"` 가드, lazy singleton, Zod `discriminatedUnion` 이 RLS 가 못 보는 `props` shape 을 대신 방어.

- **AI 비용 가드 옵션**
  - A) In-memory cache — 거부: 서버 인스턴스 재시작마다 0.
  - B) 외부 KV/Redis — 거부: POC 인프라 최소화 위반.
  - C) **`ai_cost_log(month, scope, total_micros)` + atomic upsert RPC (채택)** — PK=(month, scope) 로 test/prod 호출 격리. `truncate_test_data` 는 `scope='test'` 만 리셋 → D-014 안전성 유지. micros 단위로 POC 스케일 정확도 확보.

- **결정 (Decision)**
  - 이벤트: **service_role admin + Zod discriminatedUnion 이중 방어**. TS union(SoT, `track.ts`) ↔ Zod(`schema.ts`) drift 는 parity 테스트로 방어.
  - AI 비용: **`ai_cost_log(month, scope)` + `add_ai_cost(p_micros, p_scope) RPC`**, 단위는 micros.
  - self-retry 는 이 ADR 범위에 포함하지 않는다 — "누락 키워드 지시 주입 + wall-clock timeout" 재설계와 한 번에 다뤄야 함.

- **영향 범위 (Impact)**
  - `src/lib/supabase/admin.ts` (lazy singleton) + 이벤트/비용 insert 경로가 RLS 를 우회 → Zod 가 방어선.
  - 모든 `track()` 호출부의 `.catch(console.error)` 가 dead code 가 됨 → 제거.
  - `truncate_test_data` 가 scope='test' / user_id=null 24h 범위까지 추가 정리.

- **되돌릴 조건 (Reversal trigger) ⚠️**
  - 이벤트 insert 가 월 수십만 건 수준으로 늘어나면 admin client 일원화가 병목 → 배치 insert / Edge Function 으로 승격.
  - `events_insert_self_or_anon` 정책이 recipient user_id 를 허용하도록 확장되면 admin bypass 전제가 무너짐 → 재평가.

- **되돌리기 비용**: 낮음~중간. `track` 내부 교체 + RPC 유지하면 FE 영향 없음.

- **Follow-up**
  - `notification_sent` / `notification_opened` 배선은 Web Push plan 에서.
  - self-retry 는 "누락 키워드 지시 + wall-clock timeout" plan 에서.
  - `/admin/ai-cost` read-only 대시보드는 v1.
```

- [ ] **Step 3: Commit**

```bash
git add docs/TEAM_SHARE_DECISIONS.md
git commit -m "docs(decisions): log D-017 — analytics insert pattern + ai cost guard"
```

> **PR-C 체크포인트**: Task 8~10 끝내고 전체 green 이면 PR-C 올리기.

---

## 3. Out of Scope (이 계획에서 하지 않는 것)

- **self-retry** — "같은 프롬프트 재시도" 는 효과 미미. "누락 키워드 지시 주입 + wall-clock timeout" 으로 한 번에 다룰 별도 plan 필요.
- **재생성 버튼 UI** (PRD §5.3 AC-5) — `regenerate_count` 컬럼은 이미 있지만 FE 배선/상한은 후속 PR.
- **Web Push 배선 / `notification_sent` 이벤트 emit** — 별도 Plan.
- **AI 예산 80% 경고 Slack** — v1 운영 기능.
- **FE 용 AI 비용 대시보드** — service_role 필요 → `/admin/ai-cost` Server Component 전용. v1.
- **Kakao OAuth** — 별도 plan.
- **editedAt 편집 플로우** — 기존 코드 유지.

---

## 4. Follow-up (다음 PR 후보)

1. **self-retry + 누락 키워드 지시 주입** — 2nd 시도 프롬프트에 "반드시 다음 키워드 포함: {missing}" 추가 + wall-clock timeout (attempt 합산이 아니라 전체 시간). PRD §5.3 AC-3 정식 구현.
2. **Web Push 배선** — 구독 + cron + `track({ name: "notification_sent" })` 호출 부.
3. **AI 비용 대시보드** — `/admin/ai-cost` Server Component. 월별 trend + 예산 대비 % 게이지.
4. **events materialized view** — Week 2 분석 쿼리 (`action_logged_count / participant_count`) 사전 집계.
5. **AI 예산 80% 도달 시 운영 알림** — Slack incoming webhook 또는 email.

---

## 5. 자체 검토 (Self-Review)

### 5.1 Spec coverage

| Spec 요구 | Task | 검증 |
|----------|------|-----|
| PRD §5.3 AC-4 P95 < 5s | 기존 `AI_TIMEOUT_MS=4500` 유지 | — |
| PRD §5.3 AC-7 월 예산 폴백 | Task 5 + 6 + 7 | `cost-log-budget.spec.ts` |
| PRD §5.3 AC-8 키워드 템플릿 | Task 7 (기존 유지 + displayName 주입) | `diary.spec.ts` fallback + Task 8 unit |
| PRD §9 events 1:1 기록 | Task 1 (CHECK) + Task 3 (Zod) + Task 4 (track) | `events-insert.spec.ts` + parity test |
| ONBOARDING §6.5 "서버 이벤트도 서버에서 track" | Task 4 admin client 경유 | `track.spec.ts` |
| ONBOARDING §6.2 PROMPT_VERSION 추적 | 기존 `PROMPT_VERSION` 유지, `ai_generated` 이벤트에 포함 | 기존 코드 |
| PRD §5.3 AC-3 self-retry | **Out of Scope** — 후속 plan | — |

### 5.2 수식 검증 (cost.ts)

| 입력 | 수식 | 결과 |
|-----|------|-----|
| 250 in + 200 out | (250·0.15 + 200·0.6)/1e6 USD → × 100 × 10000 | **157.5 → 158 micros** |
| 1000 in + 500 out | (1000·0.15 + 500·0.6)/1e6 USD | 450 / 1_000_000 USD · 100 · 10000 = 450 micros |
| 10000 in + 5000 out | ×10 | **4500 micros = small × 10** ✓ 선형 |
| budget 50000 KRW | / 1400 USD/KRW → floor cents → × 10000 | **35_710_000 micros** |

`Math.round` 의 반올림 오차는 `Math.abs(big - small*10) ≤ 1` 로 허용 (테스트에 반영).

### 5.3 Placeholder scan

모든 Step 에 실 코드 블록 또는 실 SQL 이 들어있다. "TODO", "implement later" 없음. self-retry 는 명시적으로 **별도 plan 대상** 으로 표기.

### 5.4 Type consistency

- `AnalyticsEvent` TS union (track.ts SoT) ↔ Zod schema.ts ↔ DB CHECK (0008) — 세 곳 동기화를 `schema-union-parity.spec.ts` 가 방어.
- `DiaryResult` · `DiaryPromptInput` — 기존 시그니처 유지.
- `estimateCostMicros({ inputTokens, outputTokens })` · `monthlyBudgetMicros()` — Task 6 에서 정의, Task 7 이 호출.

### 5.5 POC 스케일 검토

- 새 마이그레이션 2개 (0008, 0009). `NOT VALID → VALIDATE` 2-step 으로 Preview 환경 legacy row 대응.
- 새 런타임 의존성 0개 (`@supabase/supabase-js`, `zod`, `openai` 재사용).
- admin client 는 `import "server-only"` + lazy singleton — FE 번들 누출 없음, top-level throw 없음.

---

## 6. 실행 핸드오프

Plan 완료 (v2 리비전). 저장 위치: `docs/superpowers/plans/2026-04-30-ai-diary-events-end-to-end.md`.

**권장 실행**: **3 PR 분할** (PR-A/B/C, §0.5 참조). 각 PR 은 독립적으로 `pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration` green.

**두 가지 실행 옵션:**

1. **Subagent-Driven (권장)** — PR 단위 fresh subagent dispatch. PR-A 머지 후 PR-B 시작이 가장 안전.
2. **Inline Execution** — 본 세션에서 `executing-plans` 로 batch 진행. PR 경계마다 체크포인트.

어느 쪽으로 진행할까요?
