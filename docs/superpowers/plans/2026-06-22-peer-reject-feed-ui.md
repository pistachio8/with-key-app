# peer 반려 피드 UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 그룹 과반이 반려해 무효 처리된(`peer_rejected`) 인증을 챌린지 피드에서 빨강 "반려" 우표 + 내용 톤다운 + 응원 차단으로 표시하고, 반려 버튼을 라벨형으로 개선한다.

**Architecture:** `action_logs.auto_verify_status`를 hydrate read에서 select 해 `FeedItemView.isPeerRejected: boolean`(enum 아님)으로 view-model까지 흘린다. 토글 시 `actionlog-${id}` 캐시 태그를 무효화해 과반 전이를 피드에 반영한다. UI 는 기존 `Stamp`(danger tone) + `animate-stamp-in` 을 재사용한다. DB·migration 변경은 없다(0048/ADR-0038 결과를 노출만).

**Tech Stack:** Next.js 16 App Router · React 19 · TypeScript · zod(@withkey/domain) · Vitest(web unit, jsdom) · Jest(mobile) · Tailwind v4 토큰.

**Spec:** [`docs/superpowers/specs/2026-06-22-peer-reject-feed-ui-design.md`](../specs/2026-06-22-peer-reject-feed-ui-design.md)

**Branch:** `feat/feed-peer-reject-stamp` (base `develop`) — 이미 생성됨.

> **리뷰 반영(2026-06-22, frontend·backend reviewer):** ① `FeedItemView` required 필드 추가는 producer(`challenge-feed.ts satisfies`)를 같은 시점에 깨므로 **타입+fixture+hydrate+challenge-feed 를 Task 1 한 원자 단위**로 묶었다(중간 typecheck 깨짐 방지). ② 반려 버튼 active `text-white`(대비 2.33:1, WCAG AA 미달)를 `text-foreground`(어두운 본문색)로 교체했다.

---

## File Structure

| 파일                                                                            | 역할                                           | 변경                                           |
| ------------------------------------------------------------------------------- | ---------------------------------------------- | ---------------------------------------------- |
| `packages/domain/src/read-contracts/feed.ts`                                    | `FeedItemView` 타입 + `feedItemViewSchema` SoT | `isPeerRejected: boolean` 추가                 |
| `evals/fixtures/read-contracts/feed.ts`                                         | BFF `/api/feed` 응답 fixture (web·RN 공유)     | 두 항목에 `isPeerRejected: false`              |
| `apps/web/src/lib/db/reads/action-log-hydrate.ts`                               | Layer 2 hydrate (admin + cache)                | `auto_verify_status` select → `isPeerRejected` |
| `apps/web/src/lib/db/reads/challenge-feed.ts`                                   | Layer 2/3 합성                                 | 매핑에 `isPeerRejected`                        |
| `apps/web/src/lib/db/reads/read-contract-parity.spec.ts`                        | fixture↔schema parity 테스트                   | feed assert 추가                               |
| `apps/web/src/app/(app)/challenge/[id]/_actions.ts`                             | `togglePeerRejection` Server Action            | `actionlog-${id}` 태그 무효화                  |
| `apps/web/src/app/(app)/challenge/[id]/_components/feed-card.tsx`               | 피드 카드                                      | 우표·톤다운·응원 차단                          |
| `apps/web/src/app/(app)/challenge/[id]/_components/feed-card.spec.tsx`          | 카드 단위 테스트                               | 무효 케이스 테스트                             |
| `apps/web/src/app/(app)/challenge/[id]/_components/peer-reject-button.tsx`      | 반려 버튼                                      | 라벨형                                         |
| `apps/web/src/app/(app)/challenge/[id]/_components/peer-reject-button.spec.tsx` | 반려 버튼 테스트                               | **신규**                                       |
| `apps/web/src/app/(app)/challenge/[id]/_components/challenge-feed.tsx`          | 피드 리스트(client)                            | `isPeerRejected` prop 전달                     |

**색 토큰 결정:** amber 토큰을 신규 추가하지 않는다. 기존 `--brand-secondary-soft`(#FFF5DA 크림, `bg-brand-secondary-soft`) + `--brand-warn`(#FF8A4E 주황, `bg-brand-warn`) 을 재사용한다. **텍스트는 평소·active 모두 `text-foreground`(어두운 본문색 #22262E)** 로 둔다 — 밝은 주황/크림 배경 위 흰 텍스트는 대비 AA 미달이므로 어두운 텍스트로 대비를 확보한다. 색 구분 신호는 배경색(크림→주황) + 🟨 이모지 + `font-bold`(active)가 준다. **왜**: 디자인 토큰 SoT 유지 + 접근성(WCAG SC 1.4.3). 주황(진행 중 경고)→빨강(`destructive` 우표, 확정 무효) 색 흐름도 자연스럽다.

> **기존 버그 메모(이번 PR 범위 밖):** `feed-card.tsx:77` 이 `bg-brand-secondary`(suffix 없음, globals.css 미정의)를 쓴다. plan 의 렌더 교체에서 이 줄을 그대로 보존하므로 신규 문제는 아니다. 별도 후속으로 분리.

---

## Task 1: 데이터 계약 + producer 배선 (원자 단위)

`FeedItemView` 에 required 필드를 추가하면 그 값을 만드는 모든 producer(hydrate · challenge-feed 매핑)가 같은 시점에 정합해야 typecheck 가 green 이다. 그래서 domain 타입 · fixture · hydrate · challenge-feed 매핑을 **한 Task·한 커밋**으로 처리한다.

**Files:**

- Modify: `packages/domain/src/read-contracts/feed.ts`
- Modify: `evals/fixtures/read-contracts/feed.ts`
- Modify: `apps/web/src/lib/db/reads/action-log-hydrate.ts`
- Modify: `apps/web/src/lib/db/reads/challenge-feed.ts:91-103`
- Test: `apps/web/src/lib/db/reads/read-contract-parity.spec.ts:134-138`

- [ ] **Step 1: parity 테스트에 isPeerRejected assert 추가 (실패 유도)**

`read-contract-parity.spec.ts` 의 feed 테스트(134-138행)를 아래로 교체:

```ts
it("feed: BFF 응답 fixture 가 feedResponseSchema 계약을 통과한다", () => {
  const parsed = feedResponseSchema.parse(FEED_RESPONSE);
  expect(parsed).toHaveLength(2);
  expect(parsed[0].kudosByEmoji["🔥"]).toBe(2);
  expect(parsed[0].isPeerRejected).toBe(false);
});
```

- [ ] **Step 2: 테스트 실행 — 실패 확인**

Run: `pnpm --filter @withkey/web test read-contract-parity`
Expected: FAIL — fixture 에 `isPeerRejected` 가 없어 `parsed[0].isPeerRejected` 가 `undefined`, `toBe(false)` 단언 실패.

- [ ] **Step 3: domain feed.ts 타입 + 스키마에 필드 추가**

`packages/domain/src/read-contracts/feed.ts` — `FeedItemView` 타입에서 기존 `viewerRejected: boolean;` 다음 줄에 **`isPeerRejected: boolean;` 한 줄만** 추가(다른 필드는 이미 존재):

```ts
peerRejectCount: number;
viewerRejected: boolean;
// 🟨 과반 반려로 무효 처리됨(action_logs.auto_verify_status='peer_rejected').
// UI 무효 표시 전용 — status enum 전체가 아니라 boolean 만 노출(외과적, ADR-0038).
isPeerRejected: boolean;
createdAt: string;
```

같은 파일 `feedItemViewSchema` 에서 기존 `viewerRejected: z.boolean(),` 다음 줄에 **`isPeerRejected: z.boolean(),` 한 줄만** 추가:

```ts
  peerRejectCount: z.number(),
  viewerRejected: z.boolean(),
  isPeerRejected: z.boolean(),
  createdAt: z.string(),
```

(`feedItemViewSchema: z.ZodType<FeedItemView>` 이므로 타입↔스키마 한쪽만 추가하면 컴파일 에러로 잡힌다 — 두 곳 모두 추가.)

- [ ] **Step 4: fixture 두 항목에 필드 추가**

`evals/fixtures/read-contracts/feed.ts` — 각 객체에서 기존 `viewerRejected: false,` 다음 줄에 **`isPeerRejected: false,`** 추가(log-1·log-2 둘 다). 예(log-1):

```ts
    peerRejectCount: 0,
    viewerRejected: false,
    isPeerRejected: false,
    createdAt: "2026-05-02T03:00:00Z",
```

- [ ] **Step 5: hydrate read 에 auto_verify_status select → isPeerRejected**

`apps/web/src/lib/db/reads/action-log-hydrate.ts` — `ActionLogHydrate` 타입에서 기존 `keywords: ReadonlyArray<string>;` 다음 줄에 추가:

```ts
keywords: ReadonlyArray<string>;
// auto_verify_status==='peer_rejected' 여부. 피드 무효 표시용(ADR-0038).
isPeerRejected: boolean;
createdAt: string;
```

같은 파일 `.select([...])` 배열에서 기존 `"created_at",` 다음 줄에 `"auto_verify_status",` 추가:

```ts
        "created_at",
        "auto_verify_status",
        // ADR-0017 의 fk 모호함 회피.
        "users!action_logs_user_id_fkey!inner(display_name)",
```

같은 파일 `const row = data as unknown as { ... }` 캐스팅에서 기존 `created_at: string;` 다음 줄에 추가:

```ts
    created_at: string;
    auto_verify_status: string | null;
    users: { display_name: string | null } | Array<{ display_name: string | null }> | null;
```

같은 파일 `return { ... }` 에서 기존 `keywords: row.selected_keywords ?? [],` 다음 줄에 추가:

```ts
    keywords: row.selected_keywords ?? [],
    isPeerRejected: row.auto_verify_status === "peer_rejected",
    createdAt: row.created_at,
```

- [ ] **Step 6: challenge-feed 매핑에 isPeerRejected 추가**

`apps/web/src/lib/db/reads/challenge-feed.ts` 의 `return { ... } satisfies FeedItemView;` 블록에서 기존 `viewerRejected,` 다음 줄에 추가:

```ts
        peerRejectCount,
        viewerRejected,
        isPeerRejected: hydrate.isPeerRejected,
        createdAt: hydrate.createdAt,
```

- [ ] **Step 7: parity·typecheck·mobile 통과 확인**

Run: `pnpm --filter @withkey/web test read-contract-parity`
Expected: PASS.

Run: `pnpm typecheck`
Expected: PASS (domain·web·mobile 모두 — producer 가 모두 정합).

Run: `pnpm --filter @withkey/mobile test feed`
Expected: PASS (같은 fixture 공유, 필드 추가는 비파괴).

- [ ] **Step 8: Commit**

```bash
git add packages/domain/src/read-contracts/feed.ts evals/fixtures/read-contracts/feed.ts apps/web/src/lib/db/reads/action-log-hydrate.ts apps/web/src/lib/db/reads/challenge-feed.ts apps/web/src/lib/db/reads/read-contract-parity.spec.ts
git commit -m "feat(reads): FeedItemView.isPeerRejected 배선 (hydrate auto_verify_status → view-model)"
```

---

## Task 2: togglePeerRejection — actionlog 캐시 무효화

**Files:**

- Modify: `apps/web/src/app/(app)/challenge/[id]/_actions.ts:149-152`

> **테스트 메모:** `_actions.ts` 에 RPC mock 단위 테스트 인프라가 없다. `pnpm typecheck` + Task 6 수동(dogfood 1건)으로 검증한다. 캐시 무효화는 런타임 부수효과라 신규 mock 인프라(과한 비용) 대신 §Verification 수동 시나리오로 커버 — YAGNI.

- [ ] **Step 1: actionlog 태그 무효화 추가**

`togglePeerRejection` 내부, 기존 태그 무효화(149-152행) 바로 다음에 추가:

```ts
// read-your-writes: 본인 viewer state + 카운트 즉시 invalidate, 타인 다음 fetch SWR fresh.
updateTag(`user-${user.id}-peer-reject-${actionLogId}`);
updateTag(`peer-reject-count-${actionLogId}`);
revalidateTag(`peer-reject-count-${actionLogId}`, "max");

// 과반 전이(passed↔peer_rejected)는 hydrate(actionlog-${id} 태그) 캐시의 isPeerRejected 에 반영돼야 한다.
// peer-reject 는 드문 액션이고 hydrate 는 hours TTL 이라, 전이 없는 토글도 매번 무효화하는 비용은 POC 에서 수용한다.
updateTag(`actionlog-${actionLogId}`);
revalidateTag(`actionlog-${actionLogId}`, "max");
```

- [ ] **Step 2: 타입 확인**

Run: `pnpm --filter @withkey/web typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/(app)/challenge/[id]/_actions.ts
git commit -m "feat(feed): 반려 토글 시 actionlog 캐시 무효화 (과반 전이 반영)"
```

---

## Task 3: FeedCard — 우표 · 톤다운 · 응원 차단

**Files:**

- Modify: `apps/web/src/app/(app)/challenge/[id]/_components/feed-card.tsx`
- Test: `apps/web/src/app/(app)/challenge/[id]/_components/feed-card.spec.tsx`

- [ ] **Step 1: feed-card.spec.tsx 에 무효 케이스 테스트 추가 (실패 유도)**

`feed-card.spec.tsx` 의 마지막 `it(...)` 다음, `describe` 닫는 `});` 전에 추가:

```tsx
it("isPeerRejected: 빨강 '반려' 우표를 렌더한다", () => {
  render(<FeedCard {...baseProps} isPeerRejected onKudos={() => {}} />);
  expect(screen.getByRole("img", { name: "반려" })).toBeTruthy();
});

it("isPeerRejected: 응원(Kudos) 버튼을 렌더하지 않는다", () => {
  render(<FeedCard {...baseProps} isPeerRejected onKudos={() => {}} />);
  expect(screen.queryByRole("button", { name: /응원/ })).toBeNull();
});

it("isPeerRejected: 본문 영역에 톤다운(opacity-55) 을 적용한다", () => {
  const { container } = render(<FeedCard {...baseProps} isPeerRejected onKudos={() => {}} />);
  expect(container.querySelector(".opacity-55")).toBeTruthy();
});

it("정상 카드(isPeerRejected 미지정)는 반려 우표가 없다", () => {
  render(<FeedCard {...baseProps} onKudos={() => {}} />);
  expect(screen.queryByRole("img", { name: "반려" })).toBeNull();
});
```

(`baseProps.photoSignedUrl` 이 있어 사진 `img`(alt "민지의 인증 사진")가 존재하지만, `{ name: "반려" }` 필터가 우표 `div[role=img][aria-label=반려]` 만 정확히 매칭한다.)

- [ ] **Step 2: 테스트 실행 — 실패 확인**

Run: `pnpm --filter @withkey/web test feed-card`
Expected: FAIL — `isPeerRejected` prop 미존재(타입) 및 우표 미렌더.

- [ ] **Step 3: feed-card.tsx 에 Stamp import 와 prop 추가**

상단 import 에 추가(`PeerRejectButton` import 다음 줄):

```tsx
import { PeerRejectButton } from "./peer-reject-button";
import { Stamp } from "@/components/ui/stamp";
```

`FeedCardProps` 인터페이스의 `isEnded?: boolean;` 다음 줄에 추가:

```tsx
  isEnded?: boolean;
  // 🟨 과반 반려로 무효 처리됨(ADR-0038). 우표 + 내용 톤다운 + 응원 차단.
  isPeerRejected?: boolean;
```

구조분해 매개변수(`isEnded = false,` 다음)에 추가:

```tsx
  isEnded = false,
  isPeerRejected = false,
}: FeedCardProps) {
```

- [ ] **Step 4: showKudos 를 무효 시 차단하도록 수정**

`const showKudos = participantCount >= 2;` 를 아래로 교체:

```tsx
// 무효(peer_rejected) 인증엔 응원 미렌더 — "거부된 인증에 응원" 모순 제거.
const showKudos = participantCount >= 2 && !isPeerRejected;
```

- [ ] **Step 5: 렌더 구조 변경 — Card relative + Stamp + inner 톤다운 wrapper**

현재 `return ( <article> <Card ...> ... </Card> </article> );` 전체를 아래로 교체. (핵심: Card 에 `relative`, 우표는 톤다운 wrapper 의 **형제**로 z-10, 본문은 inner div 로 감싸 opacity, 사진은 grayscale, 반려 버튼은 톤다운 밖에 또렷이 유지.)

```tsx
return (
  <article>
    <Card
      tone={isSelfAuthor ? "muted" : "default"}
      padding="sm"
      className={cn("relative flex flex-col gap-2", isSelfAuthor && "border-transparent")}
    >
      {isPeerRejected && (
        <>
          <span className="sr-only">그룹 반려로 무효 처리된 인증입니다</span>
          <Stamp label="반려" tone="danger" className="absolute right-2 top-2 z-10 size-14" />
        </>
      )}
      <div className={cn("flex flex-col gap-2", isPeerRejected && "opacity-55")}>
        <header className="text-muted-foreground flex items-center gap-2 text-[11px]">
          <span
            aria-hidden="true"
            className={cn(
              "bg-brand-secondary-soft flex size-[18px] items-center justify-center rounded-full text-[11px]",
              isSelfAuthor && "bg-brand-secondary",
            )}
          >
            {authorName.slice(0, 1)}
          </span>
          <span className="text-foreground font-semibold">
            {authorName}
            {isSelfAuthor && " (나)"}
          </span>
          {createdAtLabel && <span className="ml-auto whitespace-nowrap">{createdAtLabel}</span>}
          {isSelfAuthor && !isEnded ? (
            <button
              type="button"
              onClick={handleEditClick}
              className={cn(
                "focus-visible:ring-ring rounded text-[10px] underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1",
                !createdAtLabel && "ml-auto",
              )}
            >
              편집
            </button>
          ) : dayNumber != null ? (
            <Chip tone="primary" className={cn("text-[10px]", !createdAtLabel && "ml-auto")}>
              DAY {dayNumber}
            </Chip>
          ) : null}
        </header>
        {hasImage && photoSignedUrl ? (
          <div
            className={cn(
              "relative aspect-[16/9] w-full overflow-hidden rounded-[10px]",
              isPeerRejected && "grayscale",
            )}
          >
            <Image
              src={photoSignedUrl}
              alt={`${authorName}의 인증 사진`}
              fill
              sizes="(max-width: 640px) 100vw, 640px"
              className="object-cover"
              onError={() => setImageFailed(true)}
              unoptimized
            />
          </div>
        ) : photoSignedUrl ? (
          <div
            aria-label={`${authorName}의 인증 사진 없음`}
            role="img"
            className="from-muted to-muted/60 aspect-[16/9] w-full rounded-[10px] bg-gradient-to-br"
          />
        ) : null}
        {keywords.length > 0 && (
          <ul className="flex flex-wrap gap-1.5">
            {keywords.map((k) => (
              <li key={k}>
                <Chip tone="neutral" className="text-[10px]">
                  #{k}
                </Chip>
              </li>
            ))}
          </ul>
        )}
        <p className="t-body break-keep">{summary}</p>
        {showKudos ? (
          <KudosBar
            counts={kudosByEmoji}
            viewerKudos={viewerKudos}
            onToggle={onKudos}
            disabled={disabled}
          />
        ) : null}
      </div>
      {showPeerReject && onPeerReject ? (
        // 🟨 익명 반려는 종료 후에도 48h 내 가능 → isEnded 로 disable 하지 않는다(RPC 가 시간창 강제).
        // 무효(peer_rejected) 후에도 토글(복원) 가능해야 하므로 톤다운 wrapper 밖에 또렷이 유지.
        <div className="mt-1 flex justify-end">
          <PeerRejectButton
            count={peerRejectCount}
            active={viewerRejected}
            onToggle={onPeerReject}
          />
        </div>
      ) : null}
    </Card>
  </article>
);
```

- [ ] **Step 6: 테스트 실행 — 통과 확인**

Run: `pnpm --filter @withkey/web test feed-card`
Expected: PASS (기존 + 신규 4개 모두).

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/app/(app)/challenge/[id]/_components/feed-card.tsx apps/web/src/app/(app)/challenge/[id]/_components/feed-card.spec.tsx
git commit -m "feat(feed): 무효 인증 카드에 반려 우표·톤다운·응원 차단"
```

---

## Task 4: PeerRejectButton — 라벨형

**Files:**

- Modify: `apps/web/src/app/(app)/challenge/[id]/_components/peer-reject-button.tsx`
- Test: `apps/web/src/app/(app)/challenge/[id]/_components/peer-reject-button.spec.tsx` (신규)

- [ ] **Step 1: peer-reject-button.spec.tsx 작성 (실패 유도)**

Create `apps/web/src/app/(app)/challenge/[id]/_components/peer-reject-button.spec.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PeerRejectButton } from "./peer-reject-button";

describe("PeerRejectButton", () => {
  it("'반려' 라벨과 카운트를 렌더한다", () => {
    render(<PeerRejectButton count={3} active={false} onToggle={() => {}} />);
    expect(screen.getByText("반려")).toBeTruthy();
    expect(screen.getByText("3")).toBeTruthy();
  });

  it("active 면 aria-pressed=true 와 '내가 반려함' 안내를 노출한다", () => {
    render(<PeerRejectButton count={3} active onToggle={() => {}} />);
    const btn = screen.getByRole("button");
    expect(btn.getAttribute("aria-pressed")).toBe("true");
    expect(btn.getAttribute("aria-label")).toContain("내가 반려함");
  });

  it("클릭 시 onToggle 을 호출한다", () => {
    const onToggle = vi.fn();
    render(<PeerRejectButton count={0} active={false} onToggle={onToggle} />);
    fireEvent.click(screen.getByRole("button"));
    expect(onToggle).toHaveBeenCalledOnce();
  });

  it("disabled 면 클릭이 onToggle 을 호출하지 않는다", () => {
    const onToggle = vi.fn();
    render(<PeerRejectButton count={0} active={false} onToggle={onToggle} disabled />);
    fireEvent.click(screen.getByRole("button"));
    expect(onToggle).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: 테스트 실행 — 실패 확인**

Run: `pnpm --filter @withkey/web test peer-reject-button`
Expected: FAIL — "반려" 텍스트가 현재 버튼에 없음(이모지+숫자만).

- [ ] **Step 3: peer-reject-button.tsx 를 라벨형으로 교체**

`PeerRejectButton` 함수의 `return ( <button ...> ... </button> );` 를 아래로 교체:

```tsx
return (
  <button
    type="button"
    disabled={disabled}
    aria-pressed={active}
    aria-label={`이 인증 반려 (익명) ${count}명${active ? " · 내가 반려함" : ""}`}
    onClick={onToggle}
    className={cn(
      "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold transition-transform duration-[var(--motion-fast)]",
      "active:scale-90 disabled:pointer-events-none disabled:opacity-50",
      "focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1",
      // 진행 중 반려=주황(경고 누적). active(본인 반려)면 채움 + bold.
      // 텍스트는 항상 text-foreground(어두움) — 밝은 주황/크림 위 흰 텍스트는 대비 AA 미달이라 어두운 텍스트로 통일.
      active
        ? "bg-brand-warn text-foreground font-bold"
        : "bg-brand-secondary-soft text-foreground",
    )}
  >
    <span aria-hidden="true" className="text-[13px] leading-none">
      🟨
    </span>
    <span>반려</span>
    <span className="tabular-nums">{count}</span>
  </button>
);
```

- [ ] **Step 4: 테스트 실행 — 통과 확인**

Run: `pnpm --filter @withkey/web test peer-reject-button`
Expected: PASS (4개 모두).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/(app)/challenge/[id]/_components/peer-reject-button.tsx apps/web/src/app/(app)/challenge/[id]/_components/peer-reject-button.spec.tsx
git commit -m "feat(feed): 반려 버튼 라벨형(🟨 반려 N) + active 주황 채움"
```

---

## Task 5: ChallengeFeed — isPeerRejected 전달

**Files:**

- Modify: `apps/web/src/app/(app)/challenge/[id]/_components/challenge-feed.tsx:138-154`

> **테스트 메모:** `ChallengeFeed` 는 `useOptimistic` client 컴포넌트라 기존 단위 테스트가 없다. prop 전달은 `pnpm typecheck` 로 검증(FeedCard 의 `isPeerRejected` 타입 ↔ `FeedItemView.isPeerRejected` 정합). 무효 케이스 렌더는 Task 3 에서 직접 prop 으로 검증됨.

- [ ] **Step 1: FeedCard 에 isPeerRejected prop 전달**

`challenge-feed.tsx` 의 `<FeedCard ... />` props 에서 기존 `isEnded={isEnded}` 다음 줄에 추가:

```tsx
            createdAtLabel={item.createdAtLabel}
            isEnded={isEnded}
            isPeerRejected={item.isPeerRejected}
```

(주의: `isEnded={isEnded}` 가 이미 마지막 prop 으로 있다 — 그 다음 줄에 `isPeerRejected` 만 추가, 중복 금지.)

- [ ] **Step 2: 타입 확인**

Run: `pnpm --filter @withkey/web typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/(app)/challenge/[id]/_components/challenge-feed.tsx
git commit -m "feat(feed): ChallengeFeed 가 FeedCard 로 isPeerRejected 전달"
```

---

## Task 6: 전체 검증

- [ ] **Step 1: 전체 게이트**

Run: `pnpm typecheck`
Expected: PASS.

Run: `pnpm lint`
Expected: PASS.

Run: `pnpm test`
Expected: PASS (web vitest + domain + mobile jest 포함).

- [ ] **Step 2: 수동 — 모바일 viewport 동작 확인 (UI 변경이라 필수)**

`pnpm dev` 후 모바일 에뮬레이션(또는 실기)에서 과반 반려된 인증이 있는 챌린지 피드(`/challenge/[id]`)를 연다. 확인 항목:

- 무효 카드 우측 상단에 빨강 "반려" 우표가 mount 시 scale-in(`animate-stamp-in`)으로 찍힌다.
- 카드 본문(헤더·사진·요약)은 흐려지고 사진은 grayscale 인데, 우표는 흐림 위에 또렷하다(z-10, opacity wrapper 밖 형제).
- 무효 카드엔 응원(🔥💪👏) 버튼이 없다.
- 반려 버튼은 `🟨 반려 N`, 내가 누른 카드는 주황 채움 + bold + `aria-pressed=true`. 반려 버튼은 무효 후에도 또렷(48h 토글 가능).
- **반려 버튼 텍스트 대비**: light·dark 양쪽에서 `text-foreground`(어두움)가 주황 배경 위 충분히 읽히는지 확인. dark mode 에서 brand-warn 위 foreground 가 밝아져 대비가 떨어지면, active 텍스트를 테마 무관 고정 어두운 값으로 조정.
- `prefers-reduced-motion` 에서 우표가 즉시 최종 상태(애니메이션 없이)로 보인다.

- [ ] **Step 3: PR 생성 (사용자 확인 후)**

base `develop`, head `feat/feed-peer-reject-stamp`. PR 본문은 한국어, spec 링크 포함. **푸시·PR 생성은 사용자 확인 후에만.**

---

## Self-Review (작성자 점검 완료)

- **Spec 커버리지:** C1(status→view-model)=Task 1 / cache 정합=Task 2 / C2(우표·톤다운·응원 차단)=Task 3 / C3(반려 버튼 라벨형)=Task 4 / prop 전달=Task 5 / RN fixture 동기화=Task 1 Step 4·7 / 검증=Task 6. 누락 없음.
- **Placeholder:** 모든 step 에 실제 코드·명령·기대 출력 포함.
- **타입 일관성:** `isPeerRejected: boolean` 이 domain·hydrate·challenge-feed·FeedCard prop·ChallengeFeed 전달에서 동일 이름·타입으로 연결. **Task 1 을 원자 단위로 묶어** required 필드 추가 시 producer 미정합으로 중간 typecheck 가 깨지는 문제(backend reviewer)를 제거.
- **접근성:** 반려 버튼 텍스트를 `text-foreground` 로 통일해 WCAG AA 대비 확보(frontend reviewer 의 `text-white` 2.33:1 지적 반영). dark mode 대비는 Task 6 수동 확인으로 가드.
- **색 토큰:** 기존 `brand-warn`/`brand-secondary-soft` 재사용(토큰 추가 없음) — 가드레일(토큰 SoT) 부합.
