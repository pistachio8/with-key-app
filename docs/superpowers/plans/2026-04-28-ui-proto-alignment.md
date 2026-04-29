# UI 프로토타입 → 프로젝트 구조 정렬 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `.claude/drafts/TEAM_SHARE_UI_PROTO_TYPE.tsx`의 8개 화면(Login·Home·MyPage·Notification·CreateBet·Contract·Camera·Status)을 BE_SCHEMA v0.3 / PRD / Design Brief에 정합하도록 **Next.js App Router route colocation + Server Action + zod SoT** 구조로 이식한다.

**Architecture:**

- 프로토타입의 단일 `App.tsx` 뷰 전환(`useState("currentView")`)을 **Next.js 라우트**로 분해 — 각 화면은 `src/app/<route>/page.tsx` + 콜로케이션 `_components/` 로 옮긴다.
- UI 재사용 블록(KeywordChip, FeedCard, PledgeCard 등)은 **route 내부 `_components/`에 두고**, 2곳 이상 등장할 때만 `src/components/`로 승격한다.
- 클라이언트 상태(`betDuration`, `selectedBetId`, `signed`, `aiState`)는 **각 route 스코프의 로컬 state**로 남기고, 전역 store/Context는 도입하지 않는다(POC 범위).
- 도메인 제약은 `src/lib/validators/*` zod 스키마를 BE_SCHEMA §1/§9에 맞춰 업데이트하고, UI는 이 스키마를 직접 import해 가드한다.

**Tech Stack:** Next.js 16 App Router · React 19 · Tailwind v4 · shadcn/ui(base-ui) · zod · Vitest · lucide-react · Supabase SSR(이미 설정됨).

---

## 0. 프로토타입 vs 프로젝트 정합성 이슈 요약

이 계획이 해결해야 하는 것:

1. **용어 불일치** — 프로토타입은 "내기/각서/FitSync", 프로젝트는 "서약서/챌린지/윗키". Design Brief §2.5 "따뜻한 톤" 원칙에 따라 **"서약서·챌린지"**로 통일. 식별자는 영문 `challenge`/`pledge` 유지(D-005).
2. **금액/기간 제약 미반영** — 프로토타입은 `500/1,000/5,000원` · `1주/2주/4주/직접선택(3개월)`. BE_SCHEMA §5.5는 **1,000~10,000원(1,000원 단위) · 1~90일**(D-006/007). UI와 validator 모두 이 값에 맞춰야 함.
3. **픽셀/고정 레이아웃 안티패턴** — 프로토타입은 `max-w-[390px] h-[844px]`, `w-[240px]`, 임의 blur/offset(`top-[-10%]`) 다수. Design Brief §3은 "**360~430px 반응형**", §9는 "애니메이션 과다 금지" 요구.
4. **상태가 UI 구조에 결합** — `currentView: "login"|"home"|...` 문자열 라우팅. Next.js 라우트로 풀어내면 상태 자체가 사라진다.
5. **validator 현재값이 구버전** — `durationDays: literal(7)` · `penaltyAmount.max(20000)` (BE_SCHEMA v0.3 §1 플래그). 이 계획에서 수정.
6. **`kudos.feedItemId` 컬럼명 불일치** — BE_SCHEMA v0.3 §5.8은 `action_log_id`(feed_items 폐지). validator 갱신 필요.
7. **프로토타입 "상호 인증(인정/반려)" · "AI 트레이너 판독"** — PRD/BE_SCHEMA에 없음. POC 범위 밖이라 **UI에서 제거**하고 스키마 기반 기능(키워드 칩, AI 일기, Kudos 3이모지)으로 대체한다.
8. **카카오페이 송금** — PRD §11 주간 정산 맥락에서 **경량 정산 UI만 유지**: QR 이미지 + 송금 링크 + "링크 복사" + "카카오페이로 송금하기"(외부 링크 open). 실결제 연동은 v1(DECISIONS §12.1 결제 백로그).
9. **설계 원칙 준수** — §1.1 "친구 단톡방" · §1.4 "실패에도 따뜻하게" · §1.5 "알림 2종"만. 프로토타입의 "벌금 정산 요청" 모달은 PRD §11(주간 정산) 맥락의 **SettlementSheet**(Task 15)로 이식.

---

## 0.5 실행 가드레일 (Pre-flight)

### 30초 사전 체크리스트

구현 시작 전에 4가지를 확인한다:

- [ ] `vitest.config.ts` 에 `environmentMatchGlobs` 세팅 — `_components/**/*.spec.tsx` → `jsdom` (Task 9/13/15 RTL 테스트 전제)
- [ ] **Task 0 (신규) 먼저 실행** — `withUser` / `actionResult` 헬퍼 선행. Task 11/12/13 이 이 헬퍼에 의존.
- [ ] `NEXT_PUBLIC_KAKAOPAY_SEND_URL` **호스트 allowlist 합의** — `qr.kakaopay.com`, `pay.kakao.com`, `link.kakao.com` (Task 5 RED 테스트로 고정).
- [ ] **`(app)/layout.tsx` guard 와 `withUser` wrapper 는 서로 대체재가 아님** — layout 은 "페이지 접근" 가드, wrapper 는 "Server Action endpoint" 가드. 둘 다 유지.

### Task × ECC 에이전트 매핑

각 Task 의 Commit 직전 step 에서 아래 에이전트를 호출한다. (plan 본문 각 Task Step 에 한 줄 체크박스로 재확인)

| Task | ECC 호출 | 핵심 체크 포인트 |
|------|----------|-----------------|
| 0 (신규) withUser / actionResult | /code-review | 세션 가드 + response 타입 계약 |
| 1 challenge validator | type-design-analyzer | Zod 가 invariant 를 강제하는지 |
| 2 kudos validator | type-design-analyzer | `KUDOS_EMOJIS` tuple type narrowing |
| 3 group/invite | type-design-analyzer | optional name 의 의미 명확성 |
| 4 duration/penalty utils | /code-review | `computeEndAt` timezone/DST 안전성 |
| 5 kakaopay link | security-reviewer | **host allowlist** (open-redirect 방지), env fallback |
| 6 BottomNav + layout | a11y-architect | `aria-current`, focus, auth guard |
| 7 Login | a11y-architect | semantic landmarks, label sr-only |
| 8 Home + ProgressCard | /code-review | mock → real fetch 경계 명확화 |
| 9 DurationPicker | a11y-architect | `aria-pressed` button group (radio 승격 여부) |
| 10 PenaltyPicker | a11y-architect | 동일 패턴 |
| 11 CreateChallenge form + action | security-reviewer + silent-failure-hunter | **withUser 적용**, `{ ok, error, issues }` 패턴 |
| 12 Pledge + sign action | security-reviewer | withUser, 소유 챌린지 검증은 Day 2 |
| 13 Action submission | security-reviewer + silent-failure-hunter + /code-review | withUser, `photoUrl` hardcoded → Storage URL (Day 2) |
| 14 Challenge detail (server) | /code-review | Server component 유지 경계 |
| 15 SettlementSheet | security-reviewer | `target=_blank rel=noopener` ✓, clipboard 거부 케이스, QR data URL |
| 16 Settings | a11y-architect | `role=switch` + label 연결 |
| 17 전체 검증 | /verify | typecheck + lint + test 일괄 |
| 18 DECISIONS log | architecture-decision-records | **D-008 / D-009 / D-010** |

---

## 1. File Structure

생성/수정 파일 목록 (경로는 실제 path):

### 1.0 공용 헬퍼 (Task 0 선행)

Server Action 세 곳(Task 11/12/13) 이 공유하므로 가장 먼저 만든다.

- Create: `src/lib/auth/with-user.ts` — Server Action 세션 가드 wrapper
- Create: `src/lib/auth/with-user.spec.ts`
- Create: `src/lib/actions/response.ts` — `ActionResult<T>` 공통 타입 + `validationFailure` 헬퍼
- Create: `src/lib/actions/response.spec.ts`

### 1.1 validators (SoT 업데이트)

- Modify: `src/lib/validators/challenge.ts` — `durationDays` 1~90, `penaltyAmount` 1,000~10,000
- Modify: `src/lib/validators/kudos.ts` — `feedItemId` → `actionLogId`
- Create: `src/lib/validators/challenge.spec.ts`
- Create: `src/lib/validators/kudos.spec.ts`
- Create: `src/lib/validators/group.ts` — 그룹 생성 입력 (BE_SCHEMA §5.2)
- Create: `src/lib/validators/invite.ts` — 초대 토큰 파라미터 (§5.4)
- Create: `src/lib/validators/group.spec.ts`

### 1.2 도메인 유틸 (신규)

- Create: `src/lib/challenge/duration.ts` — `DURATION_PRESETS` (7/14/28 일) · `computeEndAt`
- Create: `src/lib/challenge/duration.spec.ts`
- Create: `src/lib/challenge/penalty.ts` — `PENALTY_PRESETS` (1000/3000/5000/10000) · `formatKRW`
- Create: `src/lib/challenge/penalty.spec.ts`
- Create: `src/lib/kakaopay/link.ts` — `buildKakaoPayLink` (송금 딥링크 + 금액/메시지 query)
- Create: `src/lib/kakaopay/link.spec.ts`

### 1.3 라우트 재구성 (기존 stub 대체/추가)

- Modify: `src/app/(auth)/login/page.tsx` — 프로토타입 Login 이식(픽셀 고정 제거)
- Modify: `src/app/(app)/home/page.tsx` — 홈 대시보드
- Modify: `src/app/(app)/pledge/page.tsx` — 서약서 서명 화면
- Modify: `src/app/(app)/action/page.tsx` — 키워드 칩 인증 (프로토타입 Camera 대체)
- Modify: `src/app/(app)/settings/page.tsx` — MyPage + 알림 설정 통합
- Create: `src/app/(app)/challenge/new/page.tsx` — 챌린지 생성(프로토타입 CreateBet)
- Create: `src/app/(app)/challenge/[id]/page.tsx` — 현황판(프로토타입 Status)

### 1.4 콜로케이션 컴포넌트

- Create: `src/app/(app)/challenge/new/_components/duration-picker.tsx`
- Create: `src/app/(app)/challenge/new/_components/duration-picker.spec.tsx`
- Create: `src/app/(app)/challenge/new/_components/penalty-picker.tsx`
- Create: `src/app/(app)/challenge/[id]/_components/member-strip.tsx`
- Create: `src/app/(app)/challenge/[id]/_components/feed-card.tsx`
- Create: `src/app/(app)/challenge/[id]/_components/settlement-sheet.tsx`
- Create: `src/app/(app)/challenge/[id]/_components/settlement-sheet.spec.tsx`
- Create: `src/app/(app)/action/_components/keyword-chip-group.tsx`
- Create: `src/app/(app)/action/_components/keyword-chip-group.spec.tsx`
- Create: `src/app/(app)/action/_components/reroll-button.tsx`
- Create: `src/app/(app)/pledge/_components/pledge-card.tsx`
- Create: `src/app/(app)/home/_components/progress-card.tsx`

### 1.5 공용 UI

- Create: `src/components/app-shell/bottom-nav.tsx` — 3탭(홈·인증·내 서약서)
- Create: `src/app/(app)/layout.tsx` — (app) 그룹 레이아웃: `<BottomNav/>` 마운트

### 1.6 Server Action 시그니처 (스텁)

> 실제 DB 연결은 `0001_init.sql` 확정 후 별도 PR. 본 계획에서는 **입력 검증 + 이벤트 track + 더미 응답** 까지 구현.

- Create: `src/app/(app)/challenge/new/_actions.ts`
- Create: `src/app/(app)/pledge/_actions.ts`
- Create: `src/app/(app)/action/_actions.ts`

---

## 2. Tasks

### Task 0: Server Action 공용 헬퍼 — `withUser` + `ActionResult`

> **선행 Task**. Task 11/12/13 의 Server Action 세 곳이 모두 이 헬퍼를 사용한다. 에러 응답 포맷(`{ ok, error, issues }`)과 세션 가드(open-endpoint 방어)를 한곳에서 고정.

**Files:**

- Create: `src/lib/actions/response.ts`
- Create: `src/lib/actions/response.spec.ts`
- Create: `src/lib/auth/with-user.ts`
- Create: `src/lib/auth/with-user.spec.ts`

- [ ] **Step 1: response 타입 + 헬퍼 테스트 작성 (failing)**

```ts
// src/lib/actions/response.spec.ts
import { describe, it, expect } from "vitest";
import { z } from "zod";
import { validationFailure, type ActionResult } from "./response";

describe("validationFailure", () => {
  const schema = z.object({
    title: z.string().min(1),
    count: z.number().int().min(1),
  });

  it("flattens fieldErrors and fixes error code", () => {
    const parsed = schema.safeParse({ title: "", count: 0 });
    expect(parsed.success).toBe(false);
    if (parsed.success) return;
    const res = validationFailure(parsed.error);
    expect(res.ok).toBe(false);
    expect(res.error).toBe("invalid_input");
    expect(res.issues.title?.[0]).toContain("");
    expect(res.issues.count).toBeDefined();
  });

  it("typed as discriminated union", () => {
    const ok: ActionResult<{ id: string }> = { ok: true, data: { id: "x" } };
    const fail: ActionResult<{ id: string }> = {
      ok: false,
      error: "invalid_input",
      issues: {},
    };
    expect(ok.ok).toBe(true);
    expect(fail.ok).toBe(false);
  });
});
```

- [ ] **Step 2: response.ts 구현**

```ts
// src/lib/actions/response.ts
import type { ZodError } from "zod";

// Server Action 공용 응답 계약.
// - ok=true 면 data 만, ok=false 면 error(단일 code) + issues(field → messages)
// - error 는 기계가 읽는 code 문자열("invalid_input" | "unauthorized" | ...),
//   사용자 노출 메시지는 UI 레이어에서 i18n.
export type ActionSuccess<T> = { ok: true; data: T };
export type ActionFailure = {
  ok: false;
  error: string;
  issues?: Record<string, string[] | undefined>;
};
export type ActionResult<T> = ActionSuccess<T> | ActionFailure;

export function success<T>(data: T): ActionSuccess<T> {
  return { ok: true, data };
}

export function failure(error: string, issues?: ActionFailure["issues"]): ActionFailure {
  return { ok: false, error, ...(issues ? { issues } : {}) };
}

export function validationFailure<T>(err: ZodError<T>): ActionFailure {
  return {
    ok: false,
    error: "invalid_input",
    issues: err.flatten().fieldErrors as Record<string, string[] | undefined>,
  };
}
```

- [ ] **Step 3: 테스트 통과 확인**

Run: `pnpm vitest run src/lib/actions/response.spec.ts`
Expected: PASS (2 tests)

- [ ] **Step 4: withUser 테스트 작성 (failing)**

```ts
// src/lib/auth/with-user.spec.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { withUser } from "./with-user";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

import { createClient } from "@/lib/supabase/server";

describe("withUser", () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset();
  });

  it("returns unauthorized when no session", async () => {
    vi.mocked(createClient).mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
    } as never);
    const action = withUser(async (_user, input: { x: number }) => ({ ok: true as const, data: input }));
    const res = await action({ x: 1 });
    expect(res).toEqual({ ok: false, error: "unauthorized" });
  });

  it("passes user to wrapped handler when authed", async () => {
    const user = { id: "u-1", email: "a@b.c" };
    vi.mocked(createClient).mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user } }) },
    } as never);
    const handler = vi.fn(async (u, input: { x: number }) => ({ ok: true as const, data: { user: u.id, x: input.x } }));
    const action = withUser(handler);
    const res = await action({ x: 2 });
    expect(handler).toHaveBeenCalledWith(user, { x: 2 });
    expect(res).toEqual({ ok: true, data: { user: "u-1", x: 2 } });
  });
});
```

- [ ] **Step 5: with-user.ts 구현**

```ts
// src/lib/auth/with-user.ts
import { createClient } from "@/lib/supabase/server";
import { failure, type ActionResult } from "@/lib/actions/response";

type AuthedUser = { id: string; email?: string | null };

// Server Action 엔드포인트 가드.
// - layout guard 는 페이지 접근만 막는다. Action 은 별도 endpoint 이므로 본문 첫 줄에서 세션 재확인 필수.
// - 실패 시 { ok:false, error:"unauthorized" } 고정 응답(UI 가 로그인 화면으로 라우팅).
export function withUser<TInput, TData>(
  handler: (user: AuthedUser, input: TInput) => Promise<ActionResult<TData>>,
): (input: TInput) => Promise<ActionResult<TData>> {
  return async (input) => {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return failure("unauthorized");
    return handler({ id: user.id, email: user.email }, input);
  };
}
```

- [ ] **Step 6: 테스트 통과 확인**

Run: `pnpm vitest run src/lib/auth/with-user.spec.ts`
Expected: PASS (2 tests)

- [ ] **Step 7: /code-review 실행 후 Commit**

```bash
git add src/lib/actions/response.ts src/lib/actions/response.spec.ts src/lib/auth/with-user.ts src/lib/auth/with-user.spec.ts
git commit -m "feat(actions): add withUser guard and ActionResult response contract"
```

---

### Task 1: challenge validator를 D-006/007에 맞춰 업데이트

**Files:**

- Modify: `src/lib/validators/challenge.ts:1-30`
- Create: `src/lib/validators/challenge.spec.ts`

- [ ] **Step 1: 테스트 먼저 작성 (failing)**

```ts
// src/lib/validators/challenge.spec.ts
import { describe, it, expect } from "vitest";
import { challengeInputSchema } from "./challenge";

const base = {
  title: "주 3회 운동",
  type: "fitness" as const,
  goalCount: 3,
};

describe("challengeInputSchema", () => {
  it("accepts 1~90 day duration (D-006)", () => {
    expect(
      challengeInputSchema.safeParse({ ...base, durationDays: 1, penaltyAmount: 1000 }).success,
    ).toBe(true);
    expect(
      challengeInputSchema.safeParse({ ...base, durationDays: 7, penaltyAmount: 1000 }).success,
    ).toBe(true);
    expect(
      challengeInputSchema.safeParse({ ...base, durationDays: 90, penaltyAmount: 1000 }).success,
    ).toBe(true);
  });

  it("rejects duration outside 1~90", () => {
    expect(
      challengeInputSchema.safeParse({ ...base, durationDays: 0, penaltyAmount: 1000 }).success,
    ).toBe(false);
    expect(
      challengeInputSchema.safeParse({ ...base, durationDays: 91, penaltyAmount: 1000 }).success,
    ).toBe(false);
  });

  it("accepts 1,000~10,000 penalty (D-007)", () => {
    expect(
      challengeInputSchema.safeParse({ ...base, durationDays: 7, penaltyAmount: 1000 }).success,
    ).toBe(true);
    expect(
      challengeInputSchema.safeParse({ ...base, durationDays: 7, penaltyAmount: 10000 }).success,
    ).toBe(true);
  });

  it("rejects penalty over 10,000 or under 1,000", () => {
    expect(
      challengeInputSchema.safeParse({ ...base, durationDays: 7, penaltyAmount: 500 }).success,
    ).toBe(false);
    expect(
      challengeInputSchema.safeParse({ ...base, durationDays: 7, penaltyAmount: 20000 }).success,
    ).toBe(false);
  });

  it("rejects penalty not multiple of 1,000", () => {
    expect(
      challengeInputSchema.safeParse({ ...base, durationDays: 7, penaltyAmount: 1500 }).success,
    ).toBe(false);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm vitest run src/lib/validators/challenge.spec.ts`
Expected: FAIL — `durationDays: 1` 은 `literal(7)` 스키마에서 거부되고 `penaltyAmount: 20000` 은 여전히 통과(구버전 max).

- [ ] **Step 3: challenge.ts 업데이트**

```ts
// src/lib/validators/challenge.ts
import { z } from "zod";

// BE_SCHEMA §5.5 · D-006(1~90일) · D-007(1,000~10,000 / 1,000원 단위)
export const challengeInputSchema = z.object({
  title: z.string().min(1).max(30),
  type: z.literal("fitness"),
  goalCount: z.number().int().min(1).max(7),
  durationDays: z.number().int().min(1).max(90),
  penaltyAmount: z
    .number()
    .int()
    .min(1000)
    .max(10000)
    .refine((v) => v % 1000 === 0, "1000원 단위"),
});

export const challengeStatusSchema = z.enum(["pending", "accepted", "active", "closed"]);

export const challengeSchema = challengeInputSchema.extend({
  id: z.string().uuid(),
  groupId: z.string().uuid(),
  status: challengeStatusSchema,
  startAt: z.string().datetime().nullable(),
  endAt: z.string().datetime().nullable(),
});

export type ChallengeInput = z.infer<typeof challengeInputSchema>;
export type Challenge = z.infer<typeof challengeSchema>;
export type ChallengeStatus = z.infer<typeof challengeStatusSchema>;
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm vitest run src/lib/validators/challenge.spec.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/validators/challenge.ts src/lib/validators/challenge.spec.ts
git commit -m "fix(validators): align challenge constraints with D-006/007"
```

---

### Task 2: kudos validator `feedItemId` → `actionLogId`

**Files:**

- Modify: `src/lib/validators/kudos.ts:7-11`
- Create: `src/lib/validators/kudos.spec.ts`

- [ ] **Step 1: 테스트 먼저 작성**

```ts
// src/lib/validators/kudos.spec.ts
import { describe, it, expect } from "vitest";
import { kudosInputSchema } from "./kudos";

describe("kudosInputSchema", () => {
  const uuid = "00000000-0000-4000-8000-000000000000";

  it("accepts actionLogId + emoji from 3 pool", () => {
    expect(kudosInputSchema.safeParse({ actionLogId: uuid, emoji: "🔥" }).success).toBe(true);
    expect(kudosInputSchema.safeParse({ actionLogId: uuid, emoji: "💪" }).success).toBe(true);
    expect(kudosInputSchema.safeParse({ actionLogId: uuid, emoji: "👏" }).success).toBe(true);
  });

  it("rejects emoji outside pool", () => {
    expect(kudosInputSchema.safeParse({ actionLogId: uuid, emoji: "❤️" }).success).toBe(false);
  });

  it("rejects invalid uuid", () => {
    expect(kudosInputSchema.safeParse({ actionLogId: "not-a-uuid", emoji: "🔥" }).success).toBe(
      false,
    );
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm vitest run src/lib/validators/kudos.spec.ts`
Expected: FAIL — 현재 스키마는 `feedItemId` 키를 요구하므로 `actionLogId` 대상 케이스 전부 실패.

- [ ] **Step 3: 스키마 수정**

```ts
// src/lib/validators/kudos.ts
import { z } from "zod";

// PRD §7.3 AC-1 · BE_SCHEMA §5.8 (feed_items 폐지로 action_log_id로 FK 이전)
export const KUDOS_EMOJIS = ["🔥", "💪", "👏"] as const;
export const kudosEmojiSchema = z.enum(KUDOS_EMOJIS);

export const kudosInputSchema = z.object({
  actionLogId: z.string().uuid(),
  emoji: kudosEmojiSchema,
});

export type KudosEmoji = z.infer<typeof kudosEmojiSchema>;
export type KudosInput = z.infer<typeof kudosInputSchema>;
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm vitest run src/lib/validators/kudos.spec.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/validators/kudos.ts src/lib/validators/kudos.spec.ts
git commit -m "fix(validators): rename kudos fk to actionLogId per BE_SCHEMA v0.3"
```

---

### Task 3: group · invite validator 신설

**Files:**

- Create: `src/lib/validators/group.ts`
- Create: `src/lib/validators/invite.ts`
- Create: `src/lib/validators/group.spec.ts`

- [ ] **Step 1: 테스트 먼저 작성**

```ts
// src/lib/validators/group.spec.ts
import { describe, it, expect } from "vitest";
import { groupInputSchema } from "./group";
import { inviteTokenSchema } from "./invite";

describe("groupInputSchema", () => {
  it("allows optional name up to 30 chars", () => {
    expect(groupInputSchema.safeParse({}).success).toBe(true);
    expect(groupInputSchema.safeParse({ name: "민지네 🏋️" }).success).toBe(true);
    expect(groupInputSchema.safeParse({ name: "x".repeat(31) }).success).toBe(false);
  });
});

describe("inviteTokenSchema", () => {
  it("requires non-empty string", () => {
    expect(inviteTokenSchema.safeParse("abc").success).toBe(true);
    expect(inviteTokenSchema.safeParse("").success).toBe(false);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm vitest run src/lib/validators/group.spec.ts`
Expected: FAIL — 모듈 미존재.

- [ ] **Step 3: 구현**

```ts
// src/lib/validators/group.ts
import { z } from "zod";

// BE_SCHEMA §5.2: name optional · char_length <= 30
export const groupInputSchema = z.object({
  name: z.string().min(1).max(30).optional(),
});

export type GroupInput = z.infer<typeof groupInputSchema>;
```

```ts
// src/lib/validators/invite.ts
import { z } from "zod";

// BE_SCHEMA §5.4: token은 랜덤 32바이트 base64 — 서버가 생성. 클라이언트는 non-empty만 검증.
export const inviteTokenSchema = z.string().min(1);

export type InviteToken = z.infer<typeof inviteTokenSchema>;
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm vitest run src/lib/validators/group.spec.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/validators/group.ts src/lib/validators/invite.ts src/lib/validators/group.spec.ts
git commit -m "feat(validators): add group and invite schemas"
```

---

### Task 4: duration/penalty 도메인 유틸

**Files:**

- Create: `src/lib/challenge/duration.ts`
- Create: `src/lib/challenge/duration.spec.ts`
- Create: `src/lib/challenge/penalty.ts`
- Create: `src/lib/challenge/penalty.spec.ts`

- [ ] **Step 1: duration 테스트**

```ts
// src/lib/challenge/duration.spec.ts
import { describe, it, expect } from "vitest";
import { DURATION_PRESETS, computeEndAt, MAX_DURATION_DAYS } from "./duration";

describe("DURATION_PRESETS", () => {
  it("exposes 1/2/4 week presets", () => {
    expect(DURATION_PRESETS).toEqual([
      { label: "1주", days: 7 },
      { label: "2주", days: 14 },
      { label: "4주", days: 28 },
    ]);
  });

  it("caps at 90 days (D-006)", () => {
    expect(MAX_DURATION_DAYS).toBe(90);
  });
});

describe("computeEndAt", () => {
  it("adds duration_days to start (UTC-safe)", () => {
    const start = new Date("2026-04-28T00:00:00Z");
    expect(computeEndAt(start, 7).toISOString()).toBe("2026-05-05T00:00:00.000Z");
  });
});
```

- [ ] **Step 2: 실패 확인 → duration.ts 구현**

```ts
// src/lib/challenge/duration.ts
// BE_SCHEMA §5.5 · Design Brief 화면 2 (1주/2주/4주 + 직접선택)
export const MAX_DURATION_DAYS = 90;

export const DURATION_PRESETS = [
  { label: "1주", days: 7 },
  { label: "2주", days: 14 },
  { label: "4주", days: 28 },
] as const;

export function computeEndAt(start: Date, days: number): Date {
  return new Date(start.getTime() + days * 24 * 60 * 60 * 1000);
}
```

Run: `pnpm vitest run src/lib/challenge/duration.spec.ts`
Expected: PASS

- [ ] **Step 3: penalty 테스트**

```ts
// src/lib/challenge/penalty.spec.ts
import { describe, it, expect } from "vitest";
import { PENALTY_PRESETS, formatKRW } from "./penalty";

describe("PENALTY_PRESETS", () => {
  it("exposes 1천·3천·5천·1만 (D-007 범위)", () => {
    expect(PENALTY_PRESETS).toEqual([1000, 3000, 5000, 10000]);
  });
});

describe("formatKRW", () => {
  it("formats with ko-KR locale and 원 suffix", () => {
    expect(formatKRW(1000)).toBe("1,000원");
    expect(formatKRW(10000)).toBe("10,000원");
  });
});
```

- [ ] **Step 4: penalty.ts 구현**

```ts
// src/lib/challenge/penalty.ts
// BE_SCHEMA §5.5 · D-007: 1,000~10,000 / 1,000원 단위
export const PENALTY_PRESETS = [1000, 3000, 5000, 10000] as const;

export function formatKRW(amount: number): string {
  return `${amount.toLocaleString("ko-KR")}원`;
}
```

Run: `pnpm vitest run src/lib/challenge/penalty.spec.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/challenge/duration.ts src/lib/challenge/duration.spec.ts src/lib/challenge/penalty.ts src/lib/challenge/penalty.spec.ts
git commit -m "feat(challenge): add duration/penalty presets with BE_SCHEMA-aligned bounds"
```

---

### Task 5: 카카오페이 송금 링크 빌더

**Files:**

- Create: `src/lib/kakaopay/link.ts`
- Create: `src/lib/kakaopay/link.spec.ts`

> Task 15(SettlementSheet)에서 QR 이미지 src · 링크 복사 · "카카오페이로 송금하기" 버튼이 모두 동일 URL을 재사용하도록 **빌더 한 곳에 통일**. 카카오페이 공식 송금 딥링크 포맷은 `https://qr.kakaopay.com/<code>` 형태이므로 본 유틸은 **유저가 입력한 send URL + amount/memo query** 를 주입하는 얇은 래퍼로 둔다(실제 딥링크 스펙은 v1 결제 연동 시 확정, DECISIONS 백로그).
>
> 본 POC에서는 `NEXT_PUBLIC_KAKAOPAY_SEND_URL` env 가 설정되어 있으면 그 URL을 base로 사용하고, 없으면 안내 URL(`https://pay.kakao.com/`)로 폴백한다.

- [ ] **Step 1: 테스트 작성**

```ts
// src/lib/kakaopay/link.spec.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { buildKakaoPayLink } from "./link";

const ORIGINAL = process.env.NEXT_PUBLIC_KAKAOPAY_SEND_URL;

describe("buildKakaoPayLink", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_KAKAOPAY_SEND_URL = "https://qr.kakaopay.com/abc123";
  });
  afterEach(() => {
    process.env.NEXT_PUBLIC_KAKAOPAY_SEND_URL = ORIGINAL;
  });

  it("appends amount + memo as query params", () => {
    const url = buildKakaoPayLink({ amount: 3000, memo: "주 3회 헬스장 벌금" });
    expect(url).toContain("https://qr.kakaopay.com/abc123");
    expect(url).toContain("amount=3000");
    expect(url).toContain(encodeURIComponent("주 3회 헬스장 벌금"));
  });

  it("omits memo when blank", () => {
    const url = buildKakaoPayLink({ amount: 3000 });
    expect(url).toContain("amount=3000");
    expect(url).not.toContain("memo=");
  });

  it("falls back to pay.kakao.com when env missing", () => {
    delete process.env.NEXT_PUBLIC_KAKAOPAY_SEND_URL;
    const url = buildKakaoPayLink({ amount: 1000 });
    expect(url.startsWith("https://pay.kakao.com/")).toBe(true);
  });

  it("rejects non-positive amount", () => {
    expect(() => buildKakaoPayLink({ amount: 0 })).toThrow();
    expect(() => buildKakaoPayLink({ amount: -100 })).toThrow();
  });

  it("rejects disallowed host (open-redirect defense)", () => {
    process.env.NEXT_PUBLIC_KAKAOPAY_SEND_URL = "https://evil.example.com/path";
    expect(() => buildKakaoPayLink({ amount: 1000 })).toThrow(/disallowed kakaopay host/);
  });

  it("accepts whitelisted hosts", () => {
    for (const host of ["qr.kakaopay.com", "pay.kakao.com", "link.kakao.com"]) {
      process.env.NEXT_PUBLIC_KAKAOPAY_SEND_URL = `https://${host}/xyz`;
      expect(() => buildKakaoPayLink({ amount: 1000 })).not.toThrow();
    }
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm vitest run src/lib/kakaopay/link.spec.ts`
Expected: FAIL — 모듈 미존재.

- [ ] **Step 3: 구현**

```ts
// src/lib/kakaopay/link.ts
// BE_SCHEMA §13.2 결제 백로그. POC는 env 기반 정적 송금 URL + amount/memo query 주입.
const FALLBACK = "https://pay.kakao.com/";

// env 가 임의 도메인으로 오염되면 Task 15 의 <a href target=_blank> 가 open-redirect/피싱 통로가 된다.
// 카카오페이 공식 도메인만 통과시키는 allowlist 로 고정.
const ALLOWED_HOSTS = new Set<string>([
  "qr.kakaopay.com",
  "pay.kakao.com",
  "link.kakao.com",
]);

export type KakaoPayLinkInput = {
  amount: number;
  memo?: string;
};

export function buildKakaoPayLink({ amount, memo }: KakaoPayLinkInput): string {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("amount must be positive");
  }
  const base = process.env.NEXT_PUBLIC_KAKAOPAY_SEND_URL ?? FALLBACK;
  const url = new URL(base);
  if (!ALLOWED_HOSTS.has(url.host)) {
    throw new Error(`disallowed kakaopay host: ${url.host}`);
  }
  url.searchParams.set("amount", String(Math.round(amount)));
  if (memo && memo.trim().length > 0) {
    url.searchParams.set("memo", memo.trim());
  }
  return url.toString();
}
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm vitest run src/lib/kakaopay/link.spec.ts`
Expected: PASS (6 tests — 원래 4개 + allowlist 2개)

- [ ] **Step 5: .env.example 에 새 키 추가**

`.env.example` 끝에 다음 줄 append(실제 값은 각자 로컬에서 설정):

```
# 카카오페이 송금 QR 주소 (개인 송금 링크, 없으면 pay.kakao.com으로 폴백)
NEXT_PUBLIC_KAKAOPAY_SEND_URL=
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/kakaopay/link.ts src/lib/kakaopay/link.spec.ts .env.example
git commit -m "feat(kakaopay): add send link builder with amount/memo query"
```

---

### Task 6: BottomNav 컴포넌트 + (app) 레이아웃

> Design Brief §3.3은 "POC 탭바 없음"이라고 적혀있지만, 프로토타입은 3탭을 쓰고 PRD §10의 9화면 이동량을 고려하면 탭바가 합리적. 이 계획에서는 **"홈·인증·내 서약서"** 3탭으로 채택하고, Design Brief §3.3 주석을 DECISIONS에 남길 것을 Follow-up.

**Files:**

- Create: `src/components/app-shell/bottom-nav.tsx`
- Create: `src/app/(app)/layout.tsx`

- [ ] **Step 1: BottomNav 구현 (픽셀 고정 없이 반응형)**

```tsx
// src/components/app-shell/bottom-nav.tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Camera, Users } from "lucide-react";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/home", label: "홈", icon: Home },
  { href: "/action", label: "인증", icon: Camera },
  { href: "/pledge", label: "서약서", icon: Users },
] as const;

export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="주요 메뉴" className="bg-background sticky bottom-0 border-t">
      <ul className="mx-auto flex max-w-screen-sm items-stretch justify-around pb-[env(safe-area-inset-bottom)]">
        {TABS.map(({ href, label, icon: Icon }) => {
          const active = pathname.startsWith(href);
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex flex-col items-center gap-1 px-2 py-3 text-xs font-medium transition-colors",
                  active ? "text-primary" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="size-6" aria-hidden />
                <span>{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
```

- [ ] **Step 2: (app) 레이아웃 작성**

```tsx
// src/app/(app)/layout.tsx
import { BottomNav } from "@/components/app-shell/bottom-nav";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  return (
    <div className="mx-auto flex min-h-svh w-full max-w-screen-sm flex-col">
      <div className="flex-1">{children}</div>
      <BottomNav />
    </div>
  );
}
```

- [ ] **Step 3: 타입체크**

Run: `pnpm typecheck`
Expected: PASS (no errors)

- [ ] **Step 4: 수동 확인**

Run: `pnpm dev`
Expected: `http://localhost:3000/home` 에서 하단에 3개 탭 노출, 각 탭 클릭 시 active 강조 변화.

- [ ] **Step 5: Commit**

```bash
git add src/components/app-shell/bottom-nav.tsx src/app/(app)/layout.tsx
git commit -m "feat(app-shell): add responsive bottom nav for 3-tab layout"
```

---

### Task 7: 로그인 화면 이식 (프로토타입 renderLogin)

**Files:**

- Modify: `src/app/(auth)/login/page.tsx`

> 픽셀 고정(`w-72 h-72`, `top-[-10%]`) · `scale-90` · 장식 blur 제거. Design Brief §2 톤(따뜻한 크림 배경) + "카카오/이메일" 2버튼만.

- [ ] **Step 1: 페이지 재작성**

```tsx
// src/app/(auth)/login/page.tsx
import { MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

// PRD §3.3 AC-3 · Design Brief 화면 1
export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-svh w-full max-w-screen-sm flex-col justify-between px-6 py-10">
      <section className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
        <h1 className="text-4xl font-black tracking-tight">윗키</h1>
        <p className="text-muted-foreground break-keep">친구와 함께하는 운동 서약서</p>
      </section>

      <section className="flex flex-col gap-3">
        <Button size="lg" className="h-12 w-full bg-[#FEE500] text-[#191919] hover:bg-[#FEE500]/90">
          <MessageCircle aria-hidden />
          카카오로 시작하기
        </Button>
        <Button size="lg" variant="outline" className="h-12 w-full">
          이메일로 계속하기
        </Button>
        <p className="text-muted-foreground text-center text-xs">
          계속하면 개인정보 처리방침에 동의한 것으로 간주돼요.
        </p>
      </section>
    </main>
  );
}
```

- [ ] **Step 2: 수동 확인**

Run: `pnpm dev`
Expected: `http://localhost:3000/login` 에서 로고/카피/2개 버튼. 폭을 360~430px로 변경해도 레이아웃 유지.

- [ ] **Step 3: Commit**

```bash
git add src/app/(auth)/login/page.tsx
git commit -m "feat(login): port login screen with responsive shell"
```

---

### Task 8: 홈 화면 + ProgressCard

**Files:**

- Create: `src/app/(app)/home/_components/progress-card.tsx`
- Modify: `src/app/(app)/home/page.tsx`

- [ ] **Step 1: ProgressCard 구현**

```tsx
// src/app/(app)/home/_components/progress-card.tsx
import { formatKRW } from "@/lib/challenge/penalty";

type Props = {
  title: string;
  goalCount: number;
  doneCount: number;
  potTotal: number;
  daysLeft: number;
};

// PRD §4 · Design Brief 화면 4
export function ProgressCard({ title, goalCount, doneCount, potTotal, daysLeft }: Props) {
  const progress = Math.min(100, Math.round((doneCount / goalCount) * 100));
  return (
    <article className="bg-card rounded-2xl border p-5 shadow-sm">
      <header className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-semibold">{title}</h2>
        <span className="text-muted-foreground text-xs font-medium">D-{daysLeft}</span>
      </header>
      <p className="text-3xl font-black tabular-nums">
        {doneCount}
        <span className="text-muted-foreground text-lg">/{goalCount}회</span>
      </p>
      <div
        role="progressbar"
        aria-valuenow={progress}
        aria-valuemin={0}
        aria-valuemax={100}
        className="bg-muted mt-3 h-2 w-full overflow-hidden rounded-full"
      >
        <div className="bg-primary h-full transition-[width]" style={{ width: `${progress}%` }} />
      </div>
      <p className="text-muted-foreground mt-3 text-sm">
        모인 예정 벌금{" "}
        <span className="text-foreground font-semibold tabular-nums">{formatKRW(potTotal)}</span>
      </p>
    </article>
  );
}
```

- [ ] **Step 2: home/page.tsx 재작성**

```tsx
// src/app/(app)/home/page.tsx
import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProgressCard } from "./_components/progress-card";

// PRD §4 · Design Brief 화면 4
export default function HomePage() {
  // TODO(Day 2): Server 컴포넌트에서 activeChallenge + progress fetch.
  const mock = { title: "주 3회 헬스장", goalCount: 3, doneCount: 2, potTotal: 10000, daysLeft: 4 };
  return (
    <main className="flex flex-col gap-6 p-4">
      <header className="flex items-baseline justify-between">
        <h1 className="text-xl font-semibold">오늘도 수고하셨어요</h1>
        <Link
          href="/settings"
          className="text-muted-foreground text-sm underline-offset-4 hover:underline"
        >
          설정
        </Link>
      </header>

      <ProgressCard {...mock} />

      <Button asChild size="lg" className="h-12">
        <Link href="/challenge/new">
          <Plus aria-hidden /> 새로운 서약서 만들기
        </Link>
      </Button>
    </main>
  );
}
```

- [ ] **Step 3: 수동 확인**

Run: `pnpm dev`
Expected: `http://localhost:3000/home` 에서 진행률 카드 + CTA 버튼 + BottomNav. 폭 변경 시 카드가 화면 폭에 맞춰 자연 조정.

- [ ] **Step 4: Commit**

```bash
git add src/app/(app)/home/page.tsx src/app/(app)/home/_components/progress-card.tsx
git commit -m "feat(home): port home dashboard with progress card"
```

---

### Task 9: 챌린지 생성 — DurationPicker

**Files:**

- Create: `src/app/(app)/challenge/new/_components/duration-picker.tsx`
- Create: `src/app/(app)/challenge/new/_components/duration-picker.spec.tsx`

- [ ] **Step 1: 테스트 작성**

```tsx
// src/app/(app)/challenge/new/_components/duration-picker.spec.tsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DurationPicker } from "./duration-picker";

describe("DurationPicker", () => {
  it("renders 1주/2주/4주 preset + 직접 선택", () => {
    render(<DurationPicker value={7} onChange={() => {}} />);
    expect(screen.getByRole("button", { name: "1주" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "2주" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "4주" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /직접/ })).toBeTruthy();
  });

  it("calls onChange when a preset is picked", () => {
    const onChange = vi.fn();
    render(<DurationPicker value={7} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "2주" }));
    expect(onChange).toHaveBeenCalledWith(14);
  });
});
```

- [ ] **Step 2: 의존성 확인**

Run: `grep '"@testing-library/react"' package.json`
Expected: 이미 설치됨. 없으면 `pnpm add -D @testing-library/react @testing-library/jest-dom jsdom` 후 `vitest.config.ts`에 `environmentMatchGlobs` 또는 spec 파일 상단 `@vitest-environment jsdom` 주석을 유지.

만약 설치가 필요했다면 확인:

Run: `pnpm vitest run src/app/(app)/challenge/new/_components/duration-picker.spec.tsx`
Expected: FAIL (모듈 미존재).

- [ ] **Step 3: 구현**

```tsx
// src/app/(app)/challenge/new/_components/duration-picker.tsx
"use client";

import { useState } from "react";
import { DURATION_PRESETS, MAX_DURATION_DAYS } from "@/lib/challenge/duration";
import { cn } from "@/lib/utils";

type Props = { value: number; onChange: (days: number) => void };

export function DurationPicker({ value, onChange }: Props) {
  const isPreset = DURATION_PRESETS.some((p) => p.days === value);
  const [custom, setCustom] = useState(!isPreset);

  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="text-sm font-semibold">얼마 동안 진행할까요?</legend>
      <div className="flex flex-wrap gap-2">
        {DURATION_PRESETS.map((p) => (
          <button
            key={p.days}
            type="button"
            onClick={() => {
              setCustom(false);
              onChange(p.days);
            }}
            aria-pressed={!custom && value === p.days}
            className={cn(
              "flex-1 rounded-xl border px-4 py-3 text-sm font-semibold transition-colors",
              !custom && value === p.days
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-muted text-muted-foreground hover:bg-muted/80",
            )}
          >
            {p.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setCustom(true)}
          aria-pressed={custom}
          className={cn(
            "flex-1 rounded-xl border px-4 py-3 text-sm font-semibold transition-colors",
            custom
              ? "bg-primary text-primary-foreground border-primary"
              : "bg-muted text-muted-foreground",
          )}
        >
          직접 선택
        </button>
      </div>
      {custom && (
        <label className="flex items-center gap-3 text-sm">
          <span className="text-muted-foreground">일수</span>
          <input
            type="number"
            min={1}
            max={MAX_DURATION_DAYS}
            value={value}
            onChange={(e) => {
              const n = Number(e.target.value);
              if (Number.isFinite(n)) onChange(Math.max(1, Math.min(MAX_DURATION_DAYS, n)));
            }}
            className="w-24 rounded-lg border px-3 py-2 text-right tabular-nums"
          />
          <span className="text-muted-foreground text-xs">최대 90일</span>
        </label>
      )}
    </fieldset>
  );
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm vitest run src/app/(app)/challenge/new/_components/duration-picker.spec.tsx`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/app/(app)/challenge/new/_components/duration-picker.tsx src/app/(app)/challenge/new/_components/duration-picker.spec.tsx
git commit -m "feat(challenge/new): add duration picker with presets + custom days"
```

---

### Task 10: PenaltyPicker

**Files:**

- Create: `src/app/(app)/challenge/new/_components/penalty-picker.tsx`

- [ ] **Step 1: 구현 (간단 UI라 테스트는 pickers 공용 테스트로 Task 10에서 함께)**

```tsx
// src/app/(app)/challenge/new/_components/penalty-picker.tsx
"use client";

import { PENALTY_PRESETS, formatKRW } from "@/lib/challenge/penalty";
import { cn } from "@/lib/utils";

type Props = { value: number; onChange: (amount: number) => void };

export function PenaltyPicker({ value, onChange }: Props) {
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="text-sm font-semibold">1회 실패 시 예정 벌금</legend>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {PENALTY_PRESETS.map((amount) => (
          <button
            key={amount}
            type="button"
            onClick={() => onChange(amount)}
            aria-pressed={value === amount}
            className={cn(
              "rounded-xl border px-3 py-3 text-sm font-semibold tabular-nums transition-colors",
              value === amount
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-muted text-muted-foreground hover:bg-muted/80",
            )}
          >
            {formatKRW(amount)}
          </button>
        ))}
      </div>
      <p className="text-muted-foreground text-xs">
        달성 못 하면 친구들에게 {formatKRW(value)} 예정이에요 😅
      </p>
    </fieldset>
  );
}
```

- [ ] **Step 2: 타입체크**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/app/(app)/challenge/new/_components/penalty-picker.tsx
git commit -m "feat(challenge/new): add penalty picker with 4 presets"
```

---

### Task 11: 챌린지 생성 폼 페이지 + Server Action 스텁

**Files:**

- Create: `src/app/(app)/challenge/new/page.tsx`
- Create: `src/app/(app)/challenge/new/_actions.ts`

- [ ] **Step 1: Server Action 스텁**

```ts
// src/app/(app)/challenge/new/_actions.ts
"use server";

import { challengeInputSchema, type ChallengeInput } from "@/lib/validators/challenge";
import { track } from "@/lib/analytics/track";
import { withUser } from "@/lib/auth/with-user";
import { success, validationFailure, type ActionResult } from "@/lib/actions/response";

// BE_SCHEMA §8.1 · DB 연결은 0001_init.sql 확정 후.
// withUser 가 세션 가드. layout guard 와 별개로 Action endpoint 자체에서 재확인(open-endpoint 방어).
export const createChallenge = withUser<ChallengeInput, { id: string }>(
  async (user, input): Promise<ActionResult<{ id: string }>> => {
    const parsed = challengeInputSchema.safeParse(input);
    if (!parsed.success) return validationFailure(parsed.error);

    const mockId = crypto.randomUUID();
    await track({
      name: "challenge_created",
      props: {
        challengeId: mockId,
        userId: user.id,
        penaltyAmount: parsed.data.penaltyAmount,
        goalCount: parsed.data.goalCount,
      },
    });
    return success({ id: mockId });
  },
);
```

- [ ] **Step 2: 생성 폼 페이지**

```tsx
// src/app/(app)/challenge/new/page.tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DurationPicker } from "./_components/duration-picker";
import { PenaltyPicker } from "./_components/penalty-picker";
import { createChallenge } from "./_actions";

// PRD §3.3 AC-1 · Design Brief 화면 2
export default function NewChallengePage() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [title, setTitle] = useState("이번 주 운동 서약서");
  const [goalCount, setGoalCount] = useState(3);
  const [durationDays, setDurationDays] = useState(7);
  const [penaltyAmount, setPenaltyAmount] = useState(3000);

  function submit() {
    startTransition(async () => {
      const res = await createChallenge({
        title,
        type: "fitness",
        goalCount,
        durationDays,
        penaltyAmount,
      });
      if (!res.ok) {
        // error 는 기계 코드("unauthorized" | "invalid_input" | ...), issues 는 필드별 메시지.
        const firstField = res.issues ? Object.values(res.issues).flat().filter(Boolean)[0] : undefined;
        toast.error(firstField ?? res.error);
        if (res.error === "unauthorized") router.push("/login");
        return;
      }
      router.push(`/challenge/${res.data.id}`);
    });
  }

  return (
    <main className="flex flex-col gap-6 p-4">
      <h1 className="text-xl font-semibold">새로운 서약서 만들기</h1>

      <label className="flex flex-col gap-2">
        <span className="text-sm font-semibold">서약서 제목</span>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={30} />
      </label>

      <label className="flex flex-col gap-2">
        <span className="text-sm font-semibold">주 목표 횟수</span>
        <div className="flex gap-2">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setGoalCount(n)}
              aria-pressed={goalCount === n}
              className={
                goalCount === n
                  ? "bg-primary text-primary-foreground flex-1 rounded-xl py-3 text-sm font-semibold"
                  : "bg-muted text-muted-foreground flex-1 rounded-xl py-3 text-sm font-semibold"
              }
            >
              {n}회
            </button>
          ))}
        </div>
      </label>

      <DurationPicker value={durationDays} onChange={setDurationDays} />
      <PenaltyPicker value={penaltyAmount} onChange={setPenaltyAmount} />

      <Button size="lg" className="h-12" onClick={submit} disabled={pending}>
        {pending ? "생성 중..." : "다음: 서약서 쓰기"}
      </Button>
    </main>
  );
}
```

- [ ] **Step 3: 수동 확인**

Run: `pnpm dev`
Expected: `http://localhost:3000/challenge/new` 진입 후 폼 입력 → 버튼 클릭 → 콘솔에 `[track] challenge_created` 로그 + `/challenge/<uuid>`로 라우팅(해당 페이지는 Task 14에서 구현되므로 404면 OK, URL 변경만 확인).

- [ ] **Step 4: Commit**

```bash
git add src/app/(app)/challenge/new/page.tsx src/app/(app)/challenge/new/_actions.ts
git commit -m "feat(challenge/new): form page with zod-gated server action"
```

---

### Task 12: 서약서 서명 화면 + signPledge Action

**Files:**

- Create: `src/app/(app)/pledge/_components/pledge-card.tsx`
- Create: `src/app/(app)/pledge/_actions.ts`
- Modify: `src/app/(app)/pledge/page.tsx`

> 프로토타입의 "서명 터치 → 흘림체 이미지"는 애니메이션 과다 영역. Design Brief §9 "애니메이션 과다 금지"에 따라 **체크박스 + CTA** 로 단순화(Design Brief 화면 3 원문과 일치).

- [ ] **Step 1: PledgeCard 구현**

```tsx
// src/app/(app)/pledge/_components/pledge-card.tsx
import { formatKRW } from "@/lib/challenge/penalty";

type Props = {
  title: string;
  goalCount: number;
  durationDays: number;
  penaltyAmount: number;
  members: Array<{ id: string; displayName: string; signed: boolean }>;
};

// PRD §3.3 AC-3 · Design Brief 화면 3
export function PledgeCard({ title, goalCount, durationDays, penaltyAmount, members }: Props) {
  return (
    <article className="bg-card rounded-2xl border p-5 shadow-sm">
      <h2 className="text-base font-bold tracking-tight">우리의 서약서</h2>
      <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
        <dt className="text-muted-foreground">목표</dt>
        <dd className="font-medium">{title}</dd>
        <dt className="text-muted-foreground">기간</dt>
        <dd className="font-medium">{durationDays}일</dd>
        <dt className="text-muted-foreground">주 목표</dt>
        <dd className="font-medium">{goalCount}회</dd>
        <dt className="text-muted-foreground">예정 벌금</dt>
        <dd className="font-medium tabular-nums">{formatKRW(penaltyAmount)}</dd>
      </dl>
      <section className="mt-4">
        <h3 className="text-muted-foreground text-xs font-semibold uppercase tracking-wide">
          멤버
        </h3>
        <ul className="mt-2 flex flex-col gap-1 text-sm">
          {members.map((m) => (
            <li key={m.id} className="flex items-center justify-between">
              <span>{m.displayName}</span>
              <span className={m.signed ? "text-primary" : "text-muted-foreground"}>
                {m.signed ? "서명 완료" : "대기 중"}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </article>
  );
}
```

- [ ] **Step 2: signPledge Action 스텁**

```ts
// src/app/(app)/pledge/_actions.ts
"use server";

import { z } from "zod";
import { track } from "@/lib/analytics/track";
import { withUser } from "@/lib/auth/with-user";
import { success, validationFailure, type ActionResult } from "@/lib/actions/response";

// BE_SCHEMA §8.4
const signInputSchema = z.object({ challengeId: z.string().uuid() });
type SignInput = z.infer<typeof signInputSchema>;

// NOTE: 소유 챌린지(내가 참가자인지) 검증은 DB 결합 PR(Day 2) 에서 추가.
export const signPledge = withUser<SignInput, { challengeId: string }>(
  async (user, input): Promise<ActionResult<{ challengeId: string }>> => {
    const parsed = signInputSchema.safeParse(input);
    if (!parsed.success) return validationFailure(parsed.error);
    // TODO: DB 반영 (challenge_participants.signed_at = now()) + 전원 서명 시 activate
    await track({
      name: "challenge_signed",
      props: { challengeId: parsed.data.challengeId, userId: user.id },
    });
    return success({ challengeId: parsed.data.challengeId });
  },
);
```

- [ ] **Step 3: pledge/page.tsx 재작성**

```tsx
// src/app/(app)/pledge/page.tsx
"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PledgeCard } from "./_components/pledge-card";
import { signPledge } from "./_actions";

// PRD §3.3 · Design Brief 화면 3
export default function PledgePage() {
  const [agreed, setAgreed] = useState(false);
  const [pending, startTransition] = useTransition();

  // TODO(Day 2): Server 컴포넌트 변경 + activeChallenge + participants fetch.
  const mock = {
    id: "00000000-0000-4000-8000-000000000000",
    title: "주 3회 헬스장",
    goalCount: 3,
    durationDays: 7,
    penaltyAmount: 3000,
    members: [
      { id: "u1", displayName: "나", signed: false },
      { id: "u2", displayName: "민지", signed: true },
      { id: "u3", displayName: "JJ", signed: false },
    ],
  };

  function submit() {
    startTransition(async () => {
      const res = await signPledge({ challengeId: mock.id });
      if (!res.ok) {
        const firstField = res.issues ? Object.values(res.issues).flat().filter(Boolean)[0] : undefined;
        toast.error(firstField ?? res.error);
        return;
      }
      toast.success("서명했어요!");
    });
  }

  return (
    <main className="flex flex-col gap-6 p-4">
      <h1 className="text-xl font-semibold">서약서</h1>
      <PledgeCard {...mock} />

      <label className="flex items-start gap-3 text-sm">
        <input
          type="checkbox"
          checked={agreed}
          onChange={(e) => setAgreed(e.target.checked)}
          className="mt-1 size-5"
        />
        <span className="break-keep">
          나 {mock.members[0].displayName}은(는) 위 조건에 동의합니다. 어긴 경우 공동 통장에
          입금할게요.
        </span>
      </label>

      <Button size="lg" className="h-12" onClick={submit} disabled={!agreed || pending}>
        {pending ? "서명 중..." : "서명하고 참여"}
      </Button>
    </main>
  );
}
```

- [ ] **Step 4: 수동 확인**

Run: `pnpm dev`
Expected: `/pledge` 에서 카드+체크박스+버튼. 체크 전엔 버튼 비활성.

- [ ] **Step 5: Commit**

```bash
git add src/app/(app)/pledge/page.tsx src/app/(app)/pledge/_actions.ts src/app/(app)/pledge/_components/pledge-card.tsx
git commit -m "feat(pledge): port pledge card + sign action stub"
```

---

### Task 13: 인증 화면 — KeywordChipGroup + RerollButton + 폼

**Files:**

- Create: `src/app/(app)/action/_components/keyword-chip-group.tsx`
- Create: `src/app/(app)/action/_components/keyword-chip-group.spec.tsx`
- Create: `src/app/(app)/action/_components/reroll-button.tsx`
- Create: `src/app/(app)/action/_actions.ts`
- Modify: `src/app/(app)/action/page.tsx`

> Design Brief §1.3 "원탭, 타이핑 최소". 프로토타입 `renderCamera`의 "AI 트레이너 판독 중" 같은 PRD에 없는 연출 제거.

- [ ] **Step 1: KeywordChipGroup 테스트**

```tsx
// src/app/(app)/action/_components/keyword-chip-group.spec.tsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { KeywordChipGroup } from "./keyword-chip-group";

const shown = ["펌핑", "PR도전", "하체데이", "스쿼트"];

describe("KeywordChipGroup", () => {
  it("toggles keyword up to 3", () => {
    const onChange = vi.fn();
    render(<KeywordChipGroup shown={shown} selected={[]} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "펌핑" }));
    expect(onChange).toHaveBeenCalledWith(["펌핑"]);
  });

  it("oldest selection auto-drops when selecting a 4th", () => {
    const onChange = vi.fn();
    render(
      <KeywordChipGroup
        shown={shown}
        selected={["펌핑", "PR도전", "하체데이"]}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "스쿼트" }));
    expect(onChange).toHaveBeenCalledWith(["PR도전", "하체데이", "스쿼트"]);
  });

  it("deselects when clicking selected chip", () => {
    const onChange = vi.fn();
    render(<KeywordChipGroup shown={shown} selected={["펌핑"]} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "펌핑" }));
    expect(onChange).toHaveBeenCalledWith([]);
  });
});
```

- [ ] **Step 2: 실패 확인 → 구현**

```tsx
// src/app/(app)/action/_components/keyword-chip-group.tsx
"use client";

import { cn } from "@/lib/utils";

type Props = {
  shown: string[];
  selected: string[];
  onChange: (next: string[]) => void;
};

// Design Brief §5 Keyword Chip Group · 1~3개 · 4개째 선택 시 가장 오래된 항목 자동 해제
export function KeywordChipGroup({ shown, selected, onChange }: Props) {
  function toggle(kw: string) {
    if (selected.includes(kw)) {
      onChange(selected.filter((k) => k !== kw));
      return;
    }
    if (selected.length >= 3) {
      onChange([...selected.slice(1), kw]);
      return;
    }
    onChange([...selected, kw]);
  }
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="키워드 선택">
      {shown.map((kw) => {
        const on = selected.includes(kw);
        return (
          <button
            key={kw}
            type="button"
            onClick={() => toggle(kw)}
            aria-pressed={on}
            className={cn(
              "rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
              on
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-muted text-muted-foreground hover:bg-muted/80",
            )}
          >
            {kw}
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 3: 테스트 통과 확인**

Run: `pnpm vitest run src/app/(app)/action/_components/keyword-chip-group.spec.tsx`
Expected: PASS (3 tests)

- [ ] **Step 4: RerollButton 구현**

```tsx
// src/app/(app)/action/_components/reroll-button.tsx
"use client";

import { Dices } from "lucide-react";
import { REROLL_LIMIT } from "@/lib/keywords/shuffle";
import { cn } from "@/lib/utils";

type Props = { rerollCount: number; onClick: () => void };

export function RerollButton({ rerollCount, onClick }: Props) {
  const remaining = REROLL_LIMIT - rerollCount;
  const disabled = remaining <= 0;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
        disabled ? "text-muted-foreground" : "bg-muted hover:bg-muted/80",
      )}
    >
      <Dices className="size-4" aria-hidden />
      다시 뽑기{" "}
      <span className="tabular-nums">
        {remaining}/{REROLL_LIMIT}
      </span>
    </button>
  );
}
```

- [ ] **Step 5: Server Action 스텁**

```ts
// src/app/(app)/action/_actions.ts
"use server";

import { actionLogInputSchema, type ActionLogInput } from "@/lib/validators/action-log";
import { generateDiary } from "@/lib/ai/diary";
import { track } from "@/lib/analytics/track";
import { withUser } from "@/lib/auth/with-user";
import { success, validationFailure, type ActionResult } from "@/lib/actions/response";

// BE_SCHEMA §8.5 · action_logs 에 AI 결과 흡수
// NOTE: photoUrl 은 Day 2 PR 에서 Supabase Storage signed URL 로 교체.
type SubmitResult = { id: string; summary: string };

export const submitActionLog = withUser<ActionLogInput, SubmitResult>(
  async (user, input): Promise<ActionResult<SubmitResult>> => {
    const parsed = actionLogInputSchema.safeParse(input);
    if (!parsed.success) return validationFailure(parsed.error);

    const diary = await generateDiary({
      activityType: parsed.data.activityType,
      keywords: parsed.data.selectedKeywords,
      memo: parsed.data.memo,
    });

    const mockId = crypto.randomUUID();
    await track({
      name: "action_logged",
      props: {
        challengeId: parsed.data.challengeId,
        userId: user.id,
        activityType: parsed.data.activityType,
        selectedKeywords: parsed.data.selectedKeywords,
        keywordCount: parsed.data.selectedKeywords.length,
        hasMemo: Boolean(parsed.data.memo),
        rerollCount: parsed.data.rerollCount,
        photoSize: 0,
      },
    });
    await track({
      name: "ai_generated",
      props: {
        actionLogId: mockId,
        latencyMs: diary.latencyMs,
        fallback: diary.fallback,
        keywordCoverage: diary.keywordCoverage,
        promptVersion: diary.promptVersion,
      },
    });

    return success({ id: mockId, summary: diary.summary });
  },
);
```

- [ ] **Step 6: action/page.tsx 재작성**

```tsx
// src/app/(app)/action/page.tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ACTIVITY_TYPES, type ActivityType } from "@/lib/keywords/pool";
import { initialShuffle, reroll, type ShuffleState } from "@/lib/keywords/shuffle";
import { KeywordChipGroup } from "./_components/keyword-chip-group";
import { RerollButton } from "./_components/reroll-button";
import { submitActionLog } from "./_actions";

const ACTIVITY_LABELS: Record<ActivityType, string> = {
  running: "🏃 러닝",
  gym: "🏋️ 헬스",
  yoga: "🧘 요가",
  other: "✨ 기타",
};

// PRD §4.3 + §5 · Design Brief 화면 5
export default function ActionPage() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [activityType, setActivityType] = useState<ActivityType>("gym");
  const [shuffle, setShuffle] = useState<ShuffleState>(() => initialShuffle("gym"));
  const [selected, setSelected] = useState<string[]>([]);
  const [memoOpen, setMemoOpen] = useState(false);
  const [memo, setMemo] = useState("");

  function switchActivity(next: ActivityType) {
    setActivityType(next);
    const fresh = initialShuffle(next);
    setShuffle(fresh);
    setSelected([]);
  }

  function submit() {
    startTransition(async () => {
      const res = await submitActionLog({
        challengeId: "00000000-0000-4000-8000-000000000000",
        activityType,
        photoUrl: "https://example.com/photo.jpg",
        selectedKeywords: selected,
        shownKeywords: shuffle.shown,
        rerollCount: shuffle.rerollCount,
        memo: memoOpen && memo ? memo : undefined,
      });
      if (!res.ok) {
        const firstField = res.issues ? Object.values(res.issues).flat().filter(Boolean)[0] : undefined;
        toast.error(firstField ?? res.error);
        if (res.error === "unauthorized") router.push("/login");
        return;
      }
      toast.success("인증 완료!");
      router.push("/home");
    });
  }

  return (
    <main className="flex flex-col gap-6 p-4">
      <h1 className="text-xl font-semibold">인증</h1>

      <fieldset className="flex flex-col gap-3">
        <legend className="text-sm font-semibold">운동 종류</legend>
        <div className="flex flex-wrap gap-2">
          {ACTIVITY_TYPES.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => switchActivity(t)}
              aria-pressed={activityType === t}
              className={
                activityType === t
                  ? "bg-primary text-primary-foreground flex-1 rounded-xl py-2.5 text-sm font-semibold"
                  : "bg-muted text-muted-foreground flex-1 rounded-xl py-2.5 text-sm font-semibold"
              }
            >
              {ACTIVITY_LABELS[t]}
            </button>
          ))}
        </div>
      </fieldset>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">
            키워드 <span className="text-muted-foreground tabular-nums">({selected.length}/3)</span>
          </h2>
          <RerollButton
            rerollCount={shuffle.rerollCount}
            onClick={() => setShuffle(reroll(shuffle))}
          />
        </div>
        <KeywordChipGroup shown={shuffle.shown} selected={selected} onChange={setSelected} />
      </section>

      <section className="flex flex-col gap-2">
        <button
          type="button"
          onClick={() => setMemoOpen((v) => !v)}
          className="text-muted-foreground text-left text-sm underline-offset-4 hover:underline"
          aria-expanded={memoOpen}
        >
          {memoOpen ? "✏️ 메모 접기" : "✏️ 직접 쓰고 싶어요"}
        </button>
        {memoOpen && (
          <textarea
            value={memo}
            onChange={(e) => setMemo(e.target.value.slice(0, 100))}
            placeholder="자유롭게 남겨도 돼요 (0~100자)"
            className="min-h-24 rounded-xl border p-3 text-sm"
          />
        )}
      </section>

      <Button
        size="lg"
        className="h-12"
        disabled={selected.length === 0 || pending}
        onClick={submit}
      >
        {pending ? "일기 쓰는 중..." : "인증하기"}
      </Button>
    </main>
  );
}
```

- [ ] **Step 7: 수동 확인**

Run: `pnpm dev`
Expected: `/action` 에서 운동 종류 전환 시 키워드 칩 바뀜. 4번째 칩 선택 시 첫 번째 해제. "다시 뽑기" 5회 소진 후 비활성. 메모 토글 동작. 제출 시 콘솔에 `[track] action_logged` + `[track] ai_generated` 로그.

- [ ] **Step 8: Commit**

```bash
git add src/app/(app)/action/page.tsx src/app/(app)/action/_components src/app/(app)/action/_actions.ts
git commit -m "feat(action): keyword chip auth flow with reroll + memo escape hatch"
```

---

### Task 14: 챌린지 현황판 — MemberStrip + FeedCard

**Files:**

- Create: `src/app/(app)/challenge/[id]/page.tsx`
- Create: `src/app/(app)/challenge/[id]/_components/member-strip.tsx`
- Create: `src/app/(app)/challenge/[id]/_components/feed-card.tsx`

> 프로토타입 renderStatus의 "카카오페이 송금 모달", "인정/반려 투표"는 PRD/BE_SCHEMA 미존재. **Kudos 3이모지 + 멤버 진행률** 중심으로 단순화.

- [ ] **Step 1: MemberStrip 구현**

```tsx
// src/app/(app)/challenge/[id]/_components/member-strip.tsx
type Member = { id: string; displayName: string; doneCount: number };
type Props = { goalCount: number; members: Member[] };

// Design Brief 화면 4: 그룹 진행률 스트립
export function MemberStrip({ goalCount, members }: Props) {
  return (
    <ul className="flex flex-wrap gap-3">
      {members.map((m) => {
        const progress = Math.min(100, Math.round((m.doneCount / goalCount) * 100));
        return (
          <li key={m.id} className="bg-card flex-1 rounded-xl border p-3">
            <p className="text-sm font-semibold">{m.displayName}</p>
            <p className="text-muted-foreground mt-1 text-xs tabular-nums">
              {m.doneCount}/{goalCount}회
            </p>
            <div className="bg-muted mt-2 h-1.5 overflow-hidden rounded-full">
              <div className="bg-primary h-full" style={{ width: `${progress}%` }} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
```

- [ ] **Step 2: FeedCard 구현**

```tsx
// src/app/(app)/challenge/[id]/_components/feed-card.tsx
import Image from "next/image";
import { KUDOS_EMOJIS, type KudosEmoji } from "@/lib/validators/kudos";

type Props = {
  authorName: string;
  photoUrl: string;
  summary: string;
  keywords: string[];
  kudosByEmoji: Record<KudosEmoji, number>;
  onKudos: (emoji: KudosEmoji) => void;
};

// PRD §7 · Design Brief 화면 6
export function FeedCard({
  authorName,
  photoUrl,
  summary,
  keywords,
  kudosByEmoji,
  onKudos,
}: Props) {
  return (
    <article className="bg-card flex flex-col gap-3 rounded-2xl border p-4 shadow-sm">
      <header className="flex items-center gap-2">
        <span className="font-semibold">{authorName}</span>
      </header>
      <div className="relative aspect-square w-full overflow-hidden rounded-xl">
        <Image
          src={photoUrl}
          alt=""
          fill
          sizes="(max-width: 640px) 100vw, 640px"
          className="object-cover"
        />
      </div>
      <p className="text-sm leading-relaxed break-keep">{summary}</p>
      <ul className="text-muted-foreground flex flex-wrap gap-1.5 text-xs">
        {keywords.map((k) => (
          <li key={k} className="bg-muted rounded-full px-2 py-0.5">
            #{k}
          </li>
        ))}
      </ul>
      <footer className="flex gap-2">
        {KUDOS_EMOJIS.map((e) => (
          <button
            key={e}
            type="button"
            onClick={() => onKudos(e)}
            className="bg-muted hover:bg-muted/80 flex items-center gap-1 rounded-full px-3 py-1.5 text-sm"
          >
            <span aria-hidden>{e}</span>
            <span className="tabular-nums">{kudosByEmoji[e] ?? 0}</span>
          </button>
        ))}
      </footer>
    </article>
  );
}
```

- [ ] **Step 3: 페이지**

```tsx
// src/app/(app)/challenge/[id]/page.tsx
import { MemberStrip } from "./_components/member-strip";

type Params = Promise<{ id: string }>;

// PRD §4 · BE_SCHEMA §4 상태머신
export default async function ChallengeDetailPage({ params }: { params: Params }) {
  const { id } = await params;
  // TODO(Day 2): Server에서 challenge + participants + action_logs 조회.
  const mock = {
    title: "주 3회 헬스장",
    goalCount: 3,
    members: [
      { id: "u1", displayName: "나", doneCount: 2 },
      { id: "u2", displayName: "민지", doneCount: 3 },
      { id: "u3", displayName: "JJ", doneCount: 1 },
    ],
  };
  return (
    <main className="flex flex-col gap-6 p-4">
      <header>
        <p className="text-muted-foreground text-xs font-mono">{id.slice(0, 8)}</p>
        <h1 className="text-xl font-semibold">{mock.title}</h1>
      </header>
      <section>
        <h2 className="mb-3 text-sm font-semibold">멤버 진행률</h2>
        <MemberStrip goalCount={mock.goalCount} members={mock.members} />
      </section>
      {/* TODO: 오늘의 피드 (FeedCard 리스트) — 실제 데이터 결합 PR에서 */}
    </main>
  );
}
```

- [ ] **Step 4: next.config 이미지 도메인 주의**

Note: `next/image` 외부 도메인 사용 시 `next.config.ts`의 `images.remotePatterns` 설정이 필요. 본 계획에서는 아직 외부 이미지를 직접 fetch하지 않으므로(Mock 단계) 이번 커밋에선 추가 설정 불요. 실 데이터 연결 PR에서 Supabase Storage 도메인을 등록.

Run: `pnpm dev`
Expected: `/challenge/new` 생성 완료 후 `/challenge/<uuid>` 로 이동 → 제목 + 멤버 진행률 표시.

- [ ] **Step 5: Commit**

```bash
git add src/app/(app)/challenge/[id]
git commit -m "feat(challenge/[id]): port status board with member strip"
```

---

### Task 15: SettlementSheet — QR · 링크 복사 · 카카오페이 송금

**Files:**

- Create: `src/app/(app)/challenge/[id]/_components/settlement-sheet.tsx`
- Create: `src/app/(app)/challenge/[id]/_components/settlement-sheet.spec.tsx`
- Modify: `src/app/(app)/challenge/[id]/page.tsx`
- Modify: `package.json` (qrcode 의존성 추가)

> 프로토타입 renderStatus의 "벌금 정산 요청 모달" 이식. 차이점:
>
> - **AI 트레이너 판독 · 상호 인정/반려 투표 제거** (PRD 미존재)
> - **카카오페이 송금은 유지하되 경량화**: QR 이미지(서버 생성 불필요, 클라이언트 라이브러리로) + 링크 + "링크 복사" + "카카오페이로 송금하기" 버튼
> - Task 5의 `buildKakaoPayLink`로 URL 통일 (QR/복사/버튼 모두 동일 URL)
> - Design Brief §1.4 "실패에도 따뜻하게" — 버튼 문구는 "카카오페이로 보내기", 경고성 강조 금지

- [ ] **Step 1: qrcode 의존성 추가**

Run: `pnpm add qrcode && pnpm add -D @types/qrcode`
Expected: `package.json` 에 `qrcode`, `@types/qrcode` 추가. lock 갱신.

> 대안으로 `next/image`에 카카오페이 QR PNG URL을 직접 넣는 방법도 있으나, 링크가 dynamic(amount 포함)이므로 클라 사이드 생성이 더 단순.

- [ ] **Step 2: 컴포넌트 테스트 작성**

```tsx
// src/app/(app)/challenge/[id]/_components/settlement-sheet.spec.tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { SettlementSheet } from "./settlement-sheet";

const ORIGINAL = process.env.NEXT_PUBLIC_KAKAOPAY_SEND_URL;

describe("SettlementSheet", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_KAKAOPAY_SEND_URL = "https://qr.kakaopay.com/abc";
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
  });
  afterEach(() => {
    process.env.NEXT_PUBLIC_KAKAOPAY_SEND_URL = ORIGINAL;
    vi.restoreAllMocks();
  });

  it("shows amount + link when open", async () => {
    render(
      <SettlementSheet open onOpenChange={() => {}} amount={3000} memo="주 3회 헬스장 벌금" />,
    );
    expect(screen.getByText(/3,000원/)).toBeTruthy();
    await waitFor(() => {
      expect(screen.getByRole("link", { name: /카카오페이로 보내기/ })).toBeTruthy();
    });
  });

  it("copies link to clipboard when copy clicked", async () => {
    render(<SettlementSheet open onOpenChange={() => {}} amount={3000} />);
    fireEvent.click(screen.getByRole("button", { name: /링크 복사/ }));
    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        expect.stringContaining("amount=3000"),
      );
    });
  });

  it("renders the send link as an anchor (opens externally)", async () => {
    render(<SettlementSheet open onOpenChange={() => {}} amount={3000} />);
    const link = await screen.findByRole("link", { name: /카카오페이로 보내기/ });
    expect(link.getAttribute("href")).toContain("amount=3000");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toContain("noopener");
  });
});
```

- [ ] **Step 3: 실패 확인**

Run: `pnpm vitest run src/app/(app)/challenge/[id]/_components/settlement-sheet.spec.tsx`
Expected: FAIL — 모듈 미존재.

- [ ] **Step 4: 컴포넌트 구현**

```tsx
// src/app/(app)/challenge/[id]/_components/settlement-sheet.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import { toast } from "sonner";
import { Copy, Send } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { buildKakaoPayLink } from "@/lib/kakaopay/link";
import { formatKRW } from "@/lib/challenge/penalty";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  amount: number;
  memo?: string;
};

// PRD §11 주간 정산 · Design Brief §1.4 — 완곡 톤 유지.
// Kakaopay 실결제 연동은 v1 (BE_SCHEMA §13.2).
export function SettlementSheet({ open, onOpenChange, amount, memo }: Props) {
  const link = useMemo(() => buildKakaoPayLink({ amount, memo }), [amount, memo]);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(link, { margin: 1, width: 256 }).then((url) => {
      if (!cancelled) setQrDataUrl(url);
    });
    return () => {
      cancelled = true;
    };
  }, [link]);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(link);
      toast.success("링크를 복사했어요");
    } catch {
      toast.error("복사에 실패했어요. 링크를 길게 눌러 직접 복사해주세요.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>벌금 보내기</DialogTitle>
          <DialogDescription>
            친구에게 카카오페이로{" "}
            <span className="font-semibold tabular-nums">{formatKRW(amount)}</span> 을 보낼 수
            있어요.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center gap-3">
          {qrDataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- data: URL은 remotePatterns 불필요
            <img
              src={qrDataUrl}
              alt="카카오페이 송금 QR 코드"
              className="bg-background h-48 w-48 rounded-xl border p-2"
            />
          ) : (
            <div className="bg-muted h-48 w-48 animate-pulse rounded-xl" aria-hidden />
          )}
          <p
            className="text-muted-foreground w-full truncate rounded-lg border bg-transparent px-3 py-2 text-center text-xs"
            title={link}
          >
            {link}
          </p>
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <Button asChild size="lg" className="h-12 w-full">
            <a href={link} target="_blank" rel="noopener noreferrer">
              <Send aria-hidden /> 카카오페이로 보내기
            </a>
          </Button>
          <Button variant="outline" size="lg" className="h-12 w-full" onClick={copyLink}>
            <Copy aria-hidden /> 링크 복사
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `pnpm vitest run src/app/(app)/challenge/[id]/_components/settlement-sheet.spec.tsx`
Expected: PASS (3 tests)

> 참고: `qrcode.toDataURL` 은 jsdom 환경에서도 동작함(순수 JS 구현). 만약 canvas 의존성으로 실패하면 spec 상단에 `vi.mock("qrcode", () => ({ default: { toDataURL: vi.fn().mockResolvedValue("data:image/png;base64,stub") } }))` 추가.

- [ ] **Step 6: 현황판 페이지에 시트 연결**

`src/app/(app)/challenge/[id]/page.tsx` 를 client 컴포넌트로 전환하고 "정산 보내기" 버튼 + 시트 마운트:

```tsx
// src/app/(app)/challenge/[id]/page.tsx
"use client";

import { use, useState } from "react";
import { Button } from "@/components/ui/button";
import { formatKRW } from "@/lib/challenge/penalty";
import { MemberStrip } from "./_components/member-strip";
import { SettlementSheet } from "./_components/settlement-sheet";

type Params = Promise<{ id: string }>;

// PRD §4 · §11 · BE_SCHEMA §4 상태머신
export default function ChallengeDetailPage({ params }: { params: Params }) {
  const { id } = use(params);
  const [settlementOpen, setSettlementOpen] = useState(false);

  // TODO(Day 2): Server Component로 분리해 challenge + participants + action_logs 조회 후 props로 전달.
  const mock = {
    title: "주 3회 헬스장",
    goalCount: 3,
    potTotal: 6000,
    members: [
      { id: "u1", displayName: "나", doneCount: 2 },
      { id: "u2", displayName: "민지", doneCount: 3 },
      { id: "u3", displayName: "JJ", doneCount: 1 },
    ],
  };

  return (
    <main className="flex flex-col gap-6 p-4">
      <header>
        <p className="text-muted-foreground text-xs font-mono">{id.slice(0, 8)}</p>
        <h1 className="text-xl font-semibold">{mock.title}</h1>
      </header>
      <section>
        <h2 className="mb-3 text-sm font-semibold">멤버 진행률</h2>
        <MemberStrip goalCount={mock.goalCount} members={mock.members} />
      </section>
      <section className="bg-card flex items-center justify-between rounded-2xl border p-4">
        <div>
          <p className="text-muted-foreground text-xs">모인 예정 벌금</p>
          <p className="text-xl font-bold tabular-nums">{formatKRW(mock.potTotal)}</p>
        </div>
        <Button onClick={() => setSettlementOpen(true)}>벌금 보내기</Button>
      </section>

      <SettlementSheet
        open={settlementOpen}
        onOpenChange={setSettlementOpen}
        amount={mock.potTotal}
        memo={`${mock.title} 벌금`}
      />
      {/* TODO: 오늘의 피드 (FeedCard 리스트) — 실제 데이터 결합 PR에서 */}
    </main>
  );
}
```

- [ ] **Step 7: 수동 확인**

Run: `pnpm dev`
Expected: `/challenge/<uuid>` 에서:

1. "벌금 보내기" 버튼 클릭 → 시트 열림
2. QR 이미지 + 링크 + 2개 버튼 노출
3. "링크 복사" → 토스트 "링크를 복사했어요"
4. "카카오페이로 보내기" → 새 탭에서 외부 URL 열림(`NEXT_PUBLIC_KAKAOPAY_SEND_URL` 미설정 시 `https://pay.kakao.com/` 로 폴백)

- [ ] **Step 8: Commit**

```bash
git add src/app/(app)/challenge/[id]/page.tsx src/app/(app)/challenge/[id]/_components/settlement-sheet.tsx src/app/(app)/challenge/[id]/_components/settlement-sheet.spec.tsx package.json pnpm-lock.yaml
git commit -m "feat(challenge/[id]): settlement sheet with QR, copy, and kakaopay link"
```

---

### Task 16: settings (마이페이지 + 알림) 통합

**Files:**

- Modify: `src/app/(app)/settings/page.tsx`

> 프로토타입 renderMyPage + renderNotification을 한 페이지로 합침. Design Brief §1.5에 따라 **시작/마감 2개 토글만** 노출.

- [ ] **Step 1: 페이지 재작성**

```tsx
// src/app/(app)/settings/page.tsx
"use client";

import { useState } from "react";

// PRD §6.3 AC-6 · Design Brief §1.5 · 화면 9
export default function SettingsPage() {
  const [startNoti, setStartNoti] = useState(true);
  const [deadlineNoti, setDeadlineNoti] = useState(true);

  return (
    <main className="flex flex-col gap-6 p-4">
      <h1 className="text-xl font-semibold">설정</h1>

      <section className="bg-card flex flex-col gap-3 rounded-2xl border p-4">
        <h2 className="text-sm font-semibold">푸시 알림</h2>
        <Toggle
          label="시작 알림"
          description="그룹원이 운동을 시작하면 알려드려요"
          checked={startNoti}
          onChange={setStartNoti}
        />
        <Toggle
          label="마감 임박 알림"
          description="이번 주 마감 24시간 전"
          checked={deadlineNoti}
          onChange={setDeadlineNoti}
        />
        <p className="text-muted-foreground text-xs">새벽 2~7시(KST)는 자동 차단돼요.</p>
      </section>
    </main>
  );
}

function Toggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-4">
      <span className="flex-1">
        <span className="block text-sm font-semibold">{label}</span>
        <span className="text-muted-foreground block text-xs">{description}</span>
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        role="switch"
        aria-checked={checked}
        className="size-6 accent-current"
      />
    </label>
  );
}
```

- [ ] **Step 2: 수동 확인**

Run: `pnpm dev`
Expected: `/settings` 에서 토글 2개 + Quiet Hours 캡션.

- [ ] **Step 3: Commit**

```bash
git add src/app/(app)/settings/page.tsx
git commit -m "feat(settings): merge my page + notification into 2-toggle settings"
```

---

### Task 17: 전체 검증 — 타입체크 · 린트 · 테스트

**Files:**

- 없음(체크만)

- [ ] **Step 1: Typecheck**

Run: `pnpm typecheck`
Expected: 0 errors.

- [ ] **Step 2: Lint**

Run: `pnpm lint`
Expected: 0 errors. 경고가 있으면 수정 후 재실행.

- [ ] **Step 3: Unit tests**

Run: `pnpm test`
Expected: 모든 스펙 PASS (challenge·kudos·group·duration·penalty·kakaopay/link·duration-picker·keyword-chip-group·settlement-sheet + 기존 shuffle.spec).

- [ ] **Step 4: 수동 E2E (dev 서버)**

Run: `pnpm dev`
Expected 시나리오:

1. `/login` → 로고 + 카카오/이메일 버튼
2. `/home` → 진행률 카드 + "새로운 서약서 만들기" CTA + BottomNav
3. `/challenge/new` → 제목/횟수/기간/벌금 입력 → 제출 → `/challenge/<uuid>` 로 이동
4. `/challenge/<uuid>` → "벌금 보내기" → 시트 오픈 → QR + 링크 + 2버튼 → 링크 복사 토스트 → 송금 버튼 클릭 시 새 탭 오픈
5. `/pledge` → 동의 체크 → 서명 버튼 → 토스트
6. `/action` → 운동 종류 전환 → 키워드 4개 선택 시 가장 오래된 것 해제 → 다시 뽑기 5회 소진 → 메모 열기 → 제출 → 홈 이동
7. `/settings` → 2개 토글
8. 360 ~ 430 px 에서 모든 화면 레이아웃 깨지지 않음

- [ ] **Step 5: 최종 Commit 없음 (검증만)**

---

### Task 18: 문서 업데이트 — DECISIONS 로그 추가 (D-008/009/010)

**Files:**

- Modify: `docs/DECISIONS.md` (append-only)

> Plan 본문 §0-7, §0-8 에 이미 근거가 정리된 결정 3건을 DECISIONS 로 옮겨 6개월 뒤 회고 가치 확보.

- [ ] **Step 1: DECISIONS.md 상단 확인**

Run: `head -30 docs/DECISIONS.md`

- [ ] **Step 2: 새 ADR 엔트리 3건 append**

```markdown
## D-008 — BottomNav 3탭 도입 (2026-04-28)

**결정**: `(app)` 레이아웃에 하단 고정 탭바(`홈 · 인증 · 서약서`) 도입.

**배경**: Design Brief §3.3은 "POC 탭바 없음"으로 기재했으나, PRD §10 9화면 중 5개가 탭 진입 후보이고 프로토타입(`TEAM_SHARE_UI_PROTO_TYPE.tsx`)도 3탭 전제. 단일 화면 스와이프 대안 대비 학습비용이 낮음.

**대안**: 스와이프/탭 토글 단일 화면 → 거부. 화면 독립 라우팅 이점 상실.

**되돌리기 비용**: 낮음. `src/app/(app)/layout.tsx` + `src/components/app-shell/bottom-nav.tsx` 2개 파일 제거면 원복.

---

## D-009 — 카카오페이 결제 연동 대신 송금 링크 + QR (2026-04-28)

**결정**: v1 카카오페이 결제 API 연동을 BE_SCHEMA §13.2 백로그로 이연하고, POC 는 외부 송금 링크(`NEXT_PUBLIC_KAKAOPAY_SEND_URL`) + 클라이언트 QR + 링크 복사로 대체.

**배경**: Design Brief §1.4 "실패에도 따뜻하게" 톤 유지 + 실결제 연동 비용(심사/PG 계약/키 관리) 대비 POC 학습 가치 낮음.

**대안**:
- 실결제 연동 → 거부. POC 단계 심사/키 관리 비용 과도.
- 링크만, QR 없음 → 거부. 모바일 웹→앱 전환 비대칭 (QR 이 더 자연스럽다).

**되돌리기 비용**: 중간. `src/lib/kakaopay/link.ts` 와 `SettlementSheet` 두 모듈만 교체.

**보안 가드**: `buildKakaoPayLink` 에 `ALLOWED_HOSTS` allowlist 고정 — env 오염 시 open-redirect 로 전환되는 것을 차단.

---

## D-010 — AI 트레이너 판독 / 상호 인정·반려 UI 제거 (2026-04-28)

**결정**: 프로토타입(`TEAM_SHARE_UI_PROTO_TYPE.tsx`)의 "AI 트레이너 판독 중", "인정/반려 투표" UI 를 POC 에서 제거. Kudos 3 이모지(🔥/💪/👏) + 키워드 칩 인증 + AI 일기로 대체.

**배경**:
- PRD / BE_SCHEMA 에 판독·투표 스키마 미존재.
- Design Brief §1.4 "실패에도 따뜻하게" 와 "반려" 투표 UX 충돌.
- 상호 반려는 친구 단톡방 규범에서 관리하는 것이 자연스러움.

**대안**: 프로토타입 그대로 이식 → 거부. 스키마·스토리지·권한 정책 모두 추가 필요.

**되돌리기 비용**: 높음. 되돌리려면 UI + `action_logs` 스키마 확장 + 투표 테이블 + 알림 이벤트 정의 모두 필요.
```

> 실제 작성 시 DECISIONS.md 기존 포맷을 그대로 따를 것(파일 앞부분의 스타일 확인).

- [ ] **Step 3: Commit**

```bash
git add docs/DECISIONS.md
git commit -m "docs(decisions): log D-008/009/010 — bottom nav, kakaopay link, remove AI/voting UI"
```

---

## 3. Out of Scope (이 계획에서 하지 않는 것)

- `supabase/migrations/0001_init.sql` · `0002_rls.sql` 작성 — BE 담당(쟁뜌) 영역. 본 계획의 Server Action은 **zod 검증 + track + mock return** 까지만.
- 실제 사진 업로드(Storage pre-signed URL) — Day 2+ PR.
- 카카오 OAuth / 이메일 매직링크 실제 연결 — Day 2+ PR.
- Web Push 구독 UI — `src/lib/push/*` 기존 모듈 활용은 별도 PR.
- 주간 정산(`recap`) · 초대 토큰 수락 화면 상세 — 현재 stub 유지. 이 계획은 프로토타입 8화면(로그인·홈·마이페이지·알림·생성·서약·카메라·현황) 이식에 한정.
- 다크모드 · 축하 애니메이션(이모지 컨페티) · 사진 콜라주 — Design Brief §9 "POC 제외".

## 4. Follow-up (다음 PR 후보)

- [ ] `challengeInputSchema`의 `durationDays` FE 가드(7고정) 재도입 여부 — PRD §3.3 AC-1 갱신(주N회 × 3개월 의미) 이후 결정. BE_SCHEMA §1 플래그 참조.
- [ ] `src/app/(app)/recap/page.tsx` 구현 — 주간 정산(Design Brief 화면 8).
- [ ] `src/app/(auth)/invite/[token]/page.tsx` 실제 토큰 검증 + group_members upsert.
- [ ] FeedCard를 `/challenge/[id]` 에 실제 데이터로 연결.
- [ ] `next.config.ts` `images.remotePatterns`에 Supabase Storage 도메인 추가.

---

## 5. 자체 검토 (Self-Review)

- **스펙 커버리지**:
  - BE_SCHEMA §1 D-006/007 → Task 1 ✅
  - BE_SCHEMA §5.8 `action_log_id` → Task 2 ✅
  - BE_SCHEMA §11 Follow-up 중 "group.ts · invite.ts 추가" → Task 3 ✅
  - BE_SCHEMA §8 Server Action 계약 (§8.1/§8.4/§8.5) → Task 11/12/13 (스텁) ✅
  - 프로토타입 8화면 이식 → Task 7/8/11/12/13/14/15/16 ✅ (프로토타입 renderStatus의 "벌금 정산 요청 모달"은 Task 15 SettlementSheet로 경량화하여 이식, AI 트레이너 판독/상호 인정 반려는 범위 제외)
  - Design Brief 화면 3(서약) · 4(홈) · 5(인증) · 6(피드) → Task 12/8/13/14 ✅
  - 카카오페이 송금(QR + 링크 복사 + 외부 이동) → Task 5(유틸) + Task 15(UI) ✅
  - 안티패턴 제거(픽셀 고정, 복잡 애니메이션, 과분리) → 모든 UI Task에서 반응형 + 단일 파일 유지 ✅
- **Placeholder scan**: 모든 Step은 실제 코드/명령 포함. TODO 주석은 의도된 범위 경계(Day 2+ PR)만 표기.
- **Type consistency**: `ChallengeInput`·`ActionLogInput`·`KudosInput`·`ShuffleState` 시그니처가 모든 태스크에서 동일하게 참조됨. `KUDOS_EMOJIS` 튜플은 Task 2에서 정의된 동일 값을 Task 14 FeedCard가 재사용. `buildKakaoPayLink`는 Task 5에서 정의되고 Task 15 SettlementSheet가 QR/복사/송금 버튼 3곳 모두에서 동일 URL로 재사용.

---

## 6. 실행 핸드오프

**Plan complete and saved to `docs/superpowers/plans/2026-04-28-ui-proto-alignment.md`. Two execution options:**

**1. Inline Execution + 3 Batch (권장)** — 타입/유틸 상수(`KUDOS_EMOJIS`, `buildKakaoPayLink`, `ChallengeInput` 등)가 Task 간에 재참조되므로 컨텍스트 연속이 검증 품질에 직결.

- **Batch A**: Task 0~5 (공용 헬퍼 + validators + 도메인 유틸)
  - 모두 logic/zod 중심, UI 없음. 한 세션에서 약 6 Task × 5 step.
  - 끝나면 `/code-review` → `/compact`.
- **Batch B**: Task 6~12 (라우트 + 기본 UI 이식 + 서버 액션 2종)
  - BottomNav, Login, Home, DurationPicker, PenaltyPicker, CreateChallenge, Pledge.
  - 끝나면 `/verify` + `/compact`.
- **Batch C**: Task 13~18 (복잡 UI + 정산 + 검증 + 문서)
  - Action keyword chip, Challenge detail, SettlementSheet, Settings, 전체 검증, DECISIONS.
  - 끝나면 `/code-review` 로 전체 diff 리뷰.

**2. Subagent-Driven** — 태스크당 새 subagent 디스패치 + 2단계 리뷰. 단, fresh subagent 마다 컨텍스트가 재시작되어 `KUDOS_EMOJIS`(Task 2 ↔ Task 14), `buildKakaoPayLink`(Task 5 ↔ Task 15) 같은 **cross-task type/const consistency** 검증이 약해진다. 권장하지 않음.

**어느 방식으로 진행할까요?**
