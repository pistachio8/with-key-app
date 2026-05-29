# 인증하기 폼 — 라우트 이탈 시 state 초기화 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 인증하기(`/challenge/[id]/action`) 폼이 다른 챌린지로 전환되거나 재진입할 때 이전 작성 내용(사진·키워드·메모)이 남지 않고 초기화되도록 한다.

**Architecture:** Phase 1(최소 픽) — 기존 mount-once draft hydration effect(`action-form.tsx:140-150`)를 **reset-then-apply** 로 바꾼다. `challengeId` 가 바뀌면(=재진입/교차 챌린지) 입력 state 를 초기값으로 리셋한 뒤, 해당 챌린지의 §4.4 실패-draft 가 있으면 그 위에 복원한다. 최초 mount 거동은 `isReentry` ref 가드로 기존과 동일하게 보존한다. 이 변경은 **교차 챌린지 누수(C6)를 확실히 고치고**, 동일-챌린지 재진입(`/action`→`/home`→`/action`)이 고쳐지는지는 Next.js segment cache 가 effect 를 재실행하는지에 달려 있어 **Vercel Preview 실기 검증으로 확인**한다. 안 고쳐지면 Phase 2(approach B: layout `visitKey` + `ActionForm` 단독 `key` remount)로 에스컬레이트한다.

**Tech Stack:** Next.js 16 App Router · React 19 · TypeScript · Vitest + @testing-library/react (jsdom) · spec [`docs/superpowers/specs/2026-05-29-action-form-reset-on-leave.md`](../specs/2026-05-29-action-form-reset-on-leave.md)

---

## File Structure

| 파일                                                                   | 책임                                                                            | 변경                                |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ----------------------------------- |
| `src/app/(app)/challenge/[id]/action/_components/action-form.tsx`      | 인증 폼 client 컴포넌트. hydration effect 를 reset-then-apply 로 교정(Phase 1). | 수정 (effect 1개, line 138-150)     |
| `src/app/(app)/challenge/[id]/action/_components/action-form.spec.tsx` | 폼 단위/컴포넌트 테스트. C6·H3 reset 테스트 추가.                               | 수정 (테스트 3개 추가 + import 1줄) |

Phase 2(조건부)는 별도 파일을 신설할 수 있으나, **Phase 1 의 Preview 검증 결과 동일-챌린지 재진입이 여전히 깨질 때만** 착수한다(마지막 섹션 참조).

---

## Phase 1 — 최소 픽 (reset-then-apply)

### Task 1: C6 교차 챌린지 초기화 — 실패 테스트 추가

**Files:**

- Test: `src/app/(app)/challenge/[id]/action/_components/action-form.spec.tsx`

- [ ] **Step 1: import 추가** — 파일 상단 `import { ActionForm } from "./action-form";`(line 31) **바로 아래**에 추가:

```tsx
import { initialShuffle } from "@/lib/keywords/shuffle";
```

- [ ] **Step 2: 실패 테스트 작성** — `describe("ActionForm", ...)` 블록 맨 끝(마지막 `it(...)` 다음, 닫는 `});` 직전)에 추가:

```tsx
it("clears in-progress photo/keywords when challengeId changes (C6 cross-challenge isolation)", async () => {
  const { rerender } = render(<ActionForm challengeId="c-A" />);
  selectPhoto(new File([new Uint8Array(10)], "p.jpg", { type: "image/jpeg" }));
  await screen.findByAltText("사진 미리보기");
  selectFirstKeyword();

  // 다른 챌린지(해당 챌린지 draft 없음)로 전환 — A 의 사진/키워드가 남으면 안 된다.
  rerender(<ActionForm challengeId="c-B" />);

  expect(screen.queryByAltText("사진 미리보기")).toBeNull();
  expect(screen.getByRole("button", { name: /사진 찍기/ })).toBeTruthy();
});
```

- [ ] **Step 3: 테스트 실패 확인**

Run: `pnpm test -- action-form --run -t "cross-challenge isolation"`
Expected: FAIL — 현재 hydration effect 는 `if (!draft) return`(line 142) 로 조기 반환해 c-A 의 사진을 비우지 않으므로 `사진 미리보기` 가 여전히 보임.

### Task 2: reset-then-apply 구현 (GREEN)

**Files:**

- Modify: `src/app/(app)/challenge/[id]/action/_components/action-form.tsx:138-150`

- [ ] **Step 1: hydration effect 교체** — 아래 블록(line 138-150)을:

```tsx
// F10 — 마운트 시 1회 draft 복원. localStorage 는 SSR 에서 접근 불가하므로
// initial state 가 아닌 mount 후 hydration 단계에서 적용. 외부 영속 store 동기화 케이스.
useEffect(() => {
  const draft = loadDraft(challengeId);
  if (!draft) return;
  // eslint-disable-next-line react-hooks/set-state-in-effect -- mount-once localStorage hydration
  setActivityType(draft.activityType);
  setShuffleByActivity(draft.shuffleByActivity);
  setSelected(draft.selected);
  setMemo(draft.memo);
  setMemoOpen(draft.memoOpen);
  toast("이전 작성을 불러왔어요");
}, [challengeId]);
```

다음으로 교체:

```tsx
// F10 + reset-on-reentry (spec 2026-05-29-action-form-reset-on-leave):
// 최초 mount 는 기존과 동일(draft 있으면 복원). challengeId 가 바뀌면(재진입/교차
// 챌린지) 입력 state 를 최초 상태로 리셋한 뒤 대상 챌린지 draft 가 있으면 그 위에
// 복원한다(reset-then-apply). 사진은 직렬화 불가라 draft 에 없으므로 항상 비워진다.
// setPreview(null) 은 아래 [preview] cleanup 을 태워 이전 blob 을 revoke 한다.
const hydratedForRef = useRef<string | null>(null);
useEffect(() => {
  const isReentry = hydratedForRef.current !== null && hydratedForRef.current !== challengeId;
  hydratedForRef.current = challengeId;
  const draft = loadDraft(challengeId);
  /* eslint-disable react-hooks/set-state-in-effect -- mount/re-entry localStorage hydration (reset-then-apply) */
  if (isReentry) {
    setFile(null);
    setPreview(null);
    setResult({ open: false, variant: "completed" });
    if (!draft) {
      setActivityType("gym");
      setShuffleByActivity({ gym: initialShuffle("gym") });
      setSelected([]);
      setMemo("");
      setMemoOpen(false);
    }
  }
  if (draft) {
    setActivityType(draft.activityType);
    setShuffleByActivity(draft.shuffleByActivity);
    setSelected(draft.selected);
    setMemo(draft.memo);
    setMemoOpen(draft.memoOpen);
    toast("이전 작성을 불러왔어요");
  }
  /* eslint-enable react-hooks/set-state-in-effect */
}, [challengeId]);
```

(주의: `useRef` 는 이미 import 됨 — `action-form.tsx:4`. `initialShuffle` 도 이미 import 됨 — line 13.)

- [ ] **Step 2: C6 테스트 통과 확인**

Run: `pnpm test -- action-form --run -t "cross-challenge isolation"`
Expected: PASS — challengeId 변경 시 `isReentry` 경로가 사진/키워드를 비워 empty-state 로 돌아감.

### Task 3: reset-then-apply 순서 + 최초 mount 복원 보존 테스트 (H3/C4)

**Files:**

- Test: `src/app/(app)/challenge/[id]/action/_components/action-form.spec.tsx`

- [ ] **Step 1: 두 테스트 추가** — Task 1 에서 추가한 테스트 **바로 다음**에:

```tsx
it("on challengeId change, resets then applies the target challenge's draft (H3 order)", async () => {
  // c-B 에 §4.4 draft 시드 (loadDraft 는 savedAt TTL + shuffleByActivity[activityType] 검증).
  window.localStorage.setItem(
    "withkey:action-draft:c-B",
    JSON.stringify({
      activityType: "gym",
      selected: [],
      shuffleByActivity: { gym: initialShuffle("gym") },
      memo: "B 챌린지 임시 메모",
      memoOpen: true,
      savedAt: Date.now(),
    }),
  );

  const { rerender } = render(<ActionForm challengeId="c-A" />);
  selectPhoto(new File([new Uint8Array(10)], "a.jpg", { type: "image/jpeg" }));
  await screen.findByAltText("사진 미리보기");

  rerender(<ActionForm challengeId="c-B" />);

  // A 의 사진은 사라진다(reset).
  expect(screen.queryByAltText("사진 미리보기")).toBeNull();

  // B 의 draft 는 살아있다(apply). 사진을 새로 넣어 키워드/메모 UI 를 드러낸 뒤 확인.
  selectPhoto(new File([new Uint8Array(10)], "b.jpg", { type: "image/jpeg" }));
  await screen.findByAltText("사진 미리보기");
  expect((screen.getByPlaceholderText(/직접 쓴 일기/) as HTMLTextAreaElement).value).toBe(
    "B 챌린지 임시 메모",
  );
});

it("restores a draft on first mount unchanged (H3 regression guard)", async () => {
  window.localStorage.setItem(
    `withkey:action-draft:${challengeId}`,
    JSON.stringify({
      activityType: "gym",
      selected: [],
      shuffleByActivity: { gym: initialShuffle("gym") },
      memo: "최초 mount 복원 메모",
      memoOpen: true,
      savedAt: Date.now(),
    }),
  );

  render(<ActionForm challengeId={challengeId} />);
  // 최초 mount 복원: 토스트 발화 + 사진 추가 시 메모 노출.
  await waitFor(() => expect(toastInfo).toHaveBeenCalledWith("이전 작성을 불러왔어요"));
  selectPhoto(new File([new Uint8Array(10)], "p.jpg", { type: "image/jpeg" }));
  await screen.findByAltText("사진 미리보기");
  expect((screen.getByPlaceholderText(/직접 쓴 일기/) as HTMLTextAreaElement).value).toBe(
    "최초 mount 복원 메모",
  );
});
```

- [ ] **Step 2: 전체 폼 테스트 통과 확인**

Run: `pnpm test -- action-form --run`
Expected: PASS — 신규 3개 + 기존 9개 모두 통과(특히 "saves draft on failure", "preserves the shuffled keyword set" 회귀 없음).

### Task 4: 전체 검증 + 커밋

**Files:** (없음 — 검증만)

- [ ] **Step 1: 타입·린트·테스트**

Run:

```bash
pnpm typecheck
pnpm lint
pnpm test -- action-form --run
```

Expected: 모두 PASS. lint 에서 `react-hooks/set-state-in-effect` 경고 없음(block disable 적용됨).

- [ ] **Step 2: 커밋** (사용자 확인 후)

```bash
git add "src/app/(app)/challenge/[id]/action/_components/action-form.tsx" "src/app/(app)/challenge/[id]/action/_components/action-form.spec.tsx" docs/superpowers/specs/2026-05-29-action-form-reset-on-leave.md docs/superpowers/plans/2026-05-29-action-form-reset-on-leave.md
git commit -m "feat(action): 인증 폼 재진입/교차 챌린지 시 작성 state 초기화 (reset-then-apply)"
```

### Task 5: Preview 검증 (실기 PWA — 메커니즘 확정)

**Files:** (없음 — 수동 검증)

- [ ] **Step 1: push + PR (사용자 확인 후)**

```bash
git push -u origin feat/action-form-reset-on-leave
```

PR 베이스 `develop`. Vercel Preview URL 발급 대기.

- [ ] **Step 2: 실기 PWA 시나리오 검증** — Preview 를 모바일에 설치(또는 모바일 Safari)하여:
  1. **동일-챌린지 재진입(주 증상)**: `/action` 에 사진+메모 입력 → 이탈 → FAB 홈 → FAB 인증 → `/action`. 기대: 폼이 깨끗. **여기서 사진이 여전히 남으면 → Phase 2 착수.**
  2. **교차 챌린지(C6)**: 챌린지 2개 이상 활성 시 A 입력 → FAB picker 로 B 진입. 기대: A 사진 안 보임.
  3. **§4.4 보존**: 제출 실패 유도 → 이탈 → 재진입. 기대: 키워드/메모 복구(사진 제외).
  4. **멀티태스킹 비초기화(C1)**: 입력 중 다른 앱 갔다 복귀. 기대: 내용 유지.
  5. **429 비회귀(H1)**: 재진입 반복 시 GoTrue 429 / 알림 중복 없음.

- [ ] **Step 3: 결과 기록** — 시나리오 1 통과 여부를 PR 코멘트/세션에 기록. 통과면 완료, 실패면 Phase 2.

---

## Phase 2 — 조건부 에스컬레이션 (approach B)

> **착수 조건:** Phase 1 Task 5 의 시나리오 1(동일-챌린지 재진입)이 Preview 에서 **여전히 stale 내용**을 보일 때만. 이는 segment cache 가 `ActionForm` 을 보존하면서 effect 를 재실행하지 않음을 의미한다.

**개요:** `ActionForm` 을 **단독** `key` 로 remount 해 재진입마다 fresh mount 시킨다. `key` 는 `/action` 진입을 감지하는 **layout-level client 컴포넌트**(항상 mount 되어 `usePathname` 갱신을 받음)가 부여하는 "visit nonce" 다. 형제인 `MarkActionStartedOnMount` 는 keying 대상이 아니므로 remount 되지 않아 `markActionStarted` 재발화가 없다(H1).

**예상 파일:**

- 신규: `src/components/app-shell/action-visit-key.tsx` — `usePathname` 으로 `/challenge/[id]/action` 진입을 edge-triggered 감지, React Context 로 `visitKey`(진입 시 증가) 제공.
- 수정: `(app)` 레이아웃 — `<ActionVisitKeyProvider>` 로 감쌈.
- 수정: `action/page.tsx` — `<ActionForm>` 를 client 경계로 감싸 `key={visitKey}` 부여(또는 ActionForm 이 context 를 읽어 `key` 효과를 내는 내부 reset).

**제약 재확인:** H1(MarkActionStartedOnMount 비-remount) · C5(blob revoke 는 기존 unmount cleanup 이 처리) · C7(in-flight 서버 작업 비취소) 유지. 구체 구현은 Phase 1 Preview 결과로 effect 거동을 확인한 뒤 별도 plan 갱신으로 확정한다(현재는 placeholder 가 아닌 "조건부 미착수").

---

## Self-Review

- **Spec 커버리지**: C1(멀티태스킹 비초기화)·C3(silent) 는 Phase 1 이 트리거를 effect/remount 로 한정해 자동 충족(브라우저 이벤트 미사용). C2/C4/C6/H3 = Task 2-3. C5 = setPreview(null)→cleanup revoke(기존 테스트 "removes the preview and revokes the blob URL" 가 메커니즘 보증). C7(in-flight) = 코드상 server action 미취소(reset 은 화면 state 만) — Phase 1 이 이를 깨지 않음. H1/H2 = effect-only 변경이라 remount·분석 재발화 없음. 동일-챌린지 재진입 = Task 5 Preview 검증 → Phase 2.
- **Placeholder 스캔**: Phase 1 의 모든 step 은 실제 코드/명령 포함. Phase 2 는 "조건부 미착수" 로 명시(현 시점 코드 미정은 placeholder 가 아니라 의도된 게이트).
- **타입/식별자 일관성**: `loadDraft`·`initialShuffle`·`setFile`/`setPreview`/`setResult`/`setActivityType`/`setShuffleByActivity`/`setSelected`/`setMemo`/`setMemoOpen` 모두 `action-form.tsx` 의 기존 심볼과 일치. draft 시드 shape 는 `DraftState`(line 46-52) + `savedAt` 와 일치, `shuffleByActivity[activityType]` 존재 검증(loadDraft line 65) 충족.
