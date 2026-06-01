# 새 서약서 생성 → 기존 멤버 서명 유도 푸시 + 초대 full 벽 개선 Implementation Plan

> **For agentic workers:** 이 plan은 grill-me 인터뷰(2026-06-01)로 합의된 설계를 구현한다. base 는 `origin/develop`(PR #155 머지 후), 브랜치 `feat/new-challenge-sign-push`.

**Goal:** 이미 소속된 그룹에서 오너가 새 챌린지(서약서)를 만들면, 기존 그룹 멤버(오너 제외)에게 "새 서약서가 도착했어요" 푸시를 보내 서명 화면으로 1탭 유도한다. 더불어, 정원 찬 그룹의 초대 링크가 기존 멤버에게 띄우던 "그룹이 가득 찼어요" 막다른 화면을 앱 동선 안내로 개선한다.

**문제 배경 (코드 확인 사실):**

- `create_challenge`(0022) RPC 는 새 챌린지 생성 시 **그룹 멤버 전원을 `challenge_participants` 로 시드**(미서명)한다. 즉 기존 멤버는 이미 참가자이고 **서명만 안 한 상태**다.
- 홈 `InvitedChallengeBanner` 는 "참여자인데 미서명 pending 챌린지 1+"일 때 `/challenge/[id]/pledge` 로 보내는 인앱 surface 가 이미 있다.
- 그러나 `createChallenge` 액션(`src/app/(flow)/challenge/new/_actions.ts`)은 **어떤 push 도 호출하지 않는다** — 새 서약서 생성 시 앱 밖 멤버를 다시 부를 채널이 없다. (`dispatchStartNotification` 은 오너가 *활성화*할 때 가는 "오늘부터 시작"이라 서명 유도와 다르다.)
- 오너는 멤버를 부르려 초대 링크를 공유하지만, 초대 링크는 *신규 모집용*이라 정원 찬(4명) 그룹에선 `invite/[token]/page.tsx` 의 `preview.full` 분기가 **"그룹이 가득 찼어요"** 막다른 화면을 띄운다. `fetchInvitePreview` 는 `full = group_members ≥ 4` 를 클릭자가 이미 멤버인지와 무관하게 계산한다.

**설계 결정 (grill-me 합의):**

1. **푸시 트리거** — `createChallenge` 성공 직후 `after()` 로 자동 발사. (활성화 시 `dispatchStartNotification` 자동 발사와 동일 패턴.)
2. **수신 대상** — 새 챌린지의 `challenge_participants` 중 오너 제외(생성 직후라 사실상 미서명 전원). 기존 `dispatch(challengeId, "start", payload, { excludeUserId })` 참가자 fan-out 헬퍼를 재사용한다.
3. **옵트인·분석** — 기존 `start` prefs 키 + `notification_sent.type="start"` 재사용. **prefs·PRD §9.1·zod union 변경 없음**(PO 승인 불필요). nudge(ADR-0028)와 동일 정책.
4. **dedup** — 생성은 1회성 이벤트라 dedup 컬럼/마이그레이션 불필요. `after()` fire-and-forget + `catch(console.error)`. 실패·미옵트인 시 인앱 `InvitedChallengeBanner` 가 fallback.
5. **딥링크** — `/challenge/[id]/pledge`(서명 화면 직행, 홈 배너와 동일 타겟).
6. **full 벽 개선** — `invite/[token]/page.tsx` 의 `preview.full` 화면을 카피 + 홈 동선으로 교체. **auth/멤버십 감지에 의존하지 않는다** — 카톡 인앱뷰는 세션 쿠키 부재로 익명(ADR-0008)이라 viewer 판정이 불가능하기 때문. `fetchInvitePreview` 변경 없음.

**받아들인 한계:** 알림 prefs 기본 OFF(ADR-0013)라 생성 푸시 실제 도달은 옵트인한 멤버만 — **주 채널은 인앱 `InvitedChallengeBanner`, 푸시는 보조**. (nudge 와 동일 트레이드오프. AcceptForm 의 수락 시 "알림 켜두면 좋아요" 토스트가 옵트인 유도 경로로 이미 존재.)

**Tech Stack:** Next.js 16 (App Router · RSC · `after()`) · TypeScript · Vitest · Web Push(VAPID). **마이그레이션·스키마·analytics union 변경 없음.**

---

## File Structure

| 파일                                                           | 책임                                                                                               | 작업          |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ------------- |
| `src/lib/push/dispatch.ts`                                     | `dispatchNewChallengeCreatedNotification` 참가자 fan-out wrapper(기존 private `dispatch()` 재사용) | Modify        |
| `src/lib/push/dispatch.new-challenge.spec.ts`                  | wrapper 단위 테스트(옵트인·quiet·오너 제외·payload)                                                | Create        |
| `src/app/(flow)/challenge/new/_actions.ts`                     | `createChallenge` 가 생성 성공 시 `after()` 로 push dispatch                                       | Modify        |
| `src/app/(flow)/challenge/new/_actions.spec.ts`                | dispatch 호출 분기 테스트(존재 시 추가, 없으면 생성)                                               | Modify/Create |
| `src/app/(auth)/invite/[token]/page.tsx`                       | `preview.full` 화면 카피 + "홈으로 가기" CTA                                                       | Modify        |
| `docs/superpowers/specs/2026-06-01-new-challenge-sign-push.md` | 알림 정책 결정 기록(spec)                                                                          | Create        |

> ADR 가 아닌 spec 으로 둔다 — 마이그레이션/스키마 변경이 없고(되돌리기 비용 작음), `src/lib/push/**` 는 spec-required 경로가 아니다. ADR 번호 0029 는 이미 사용 중.

---

## Task 1: `dispatchNewChallengeCreatedNotification` — 참가자 fan-out wrapper

**Files:**

- Modify: `src/lib/push/dispatch.ts`
- Create: `src/lib/push/dispatch.new-challenge.spec.ts`

새 push 는 "참가자 전원 − 오너" 팬아웃이므로 `dispatchStartNotification` 과 동일하게 private `dispatch()` 를 재사용한다(단일 유저인 nudge 와 달리 자체 body 불필요).

- [ ] **Step 1: 실패하는 테스트 작성** — `dispatch.new-challenge.spec.ts`. 기존 `dispatch.spec.ts` 의 mock 셋업(adminClient·send·track)을 미러링한다.
  - 케이스: ① 옵트인 멤버(오너 제외) 1명에게 push 1건, `type="start"`, url `/challenge/<id>/pledge` ② 오너는 `excludeUserId` 로 수신 제외 ③ quiet hours 면 미발송 + `suppressed` 트래킹.
- [ ] **Step 2: 테스트 실패 확인** — `pnpm test src/lib/push/dispatch.new-challenge.spec.ts` → `dispatchNewChallengeCreatedNotification is not a function`.
- [ ] **Step 3: 구현** — `dispatch.ts` 에 추가:

```typescript
// 새 서약서(pending 챌린지) 생성 시 기존 그룹 멤버(오너 제외)에게 서명 유도 push.
// 생성은 1회성이라 dedup 불필요 — createChallenge 성공 후 after() 로 1회 발사한다.
// 옵트인은 기존 "start" 키, 분석 type 도 "start"(notification_sent union 불변).
// 미옵트인/실패 시 인앱 InvitedChallengeBanner 가 fallback.
export async function dispatchNewChallengeCreatedNotification(
  challengeId: string,
  ownerUserId: string,
  challengeTitle: string,
): Promise<DispatchSummary> {
  const targetUrl = `/challenge/${challengeId}/pledge`;
  return dispatch(
    challengeId,
    "start",
    {
      title: "새 서약서가 도착했어요",
      body: `${challengeTitle} · 탭해서 서명하기`,
      url: targetUrl,
      type: "start",
      category: "reminder",
      targetUrl,
      challengeId,
    },
    { excludeUserId: ownerUserId },
  );
}
```

- [ ] **Step 4: 테스트 통과 확인** — `pnpm test src/lib/push/dispatch.new-challenge.spec.ts`.
- [ ] **Step 5: Commit** — `feat(push): dispatchNewChallengeCreatedNotification 새 서약서 서명 유도 push 추가`

---

## Task 2: `createChallenge` 에 push dispatch 연결

**Files:**

- Modify: `src/app/(flow)/challenge/new/_actions.ts`
- Modify/Create: `src/app/(flow)/challenge/new/_actions.spec.ts`

생성 성공(챌린지 생성 + 멤버 시드 + 오너 자가서명) 직후, `redirect()` 직전에 `after()` 로 push 를 fire 한다.

- [ ] **Step 1: 실패하는 테스트** — 기존 spec 유무 확인 후, `next/server` `after`(즉시 실행) + `@/lib/push/dispatch` 를 mock 하고 "생성 성공 시 `dispatchNewChallengeCreatedNotification(challengeId, ownerId, title)` 가 호출된다"를 검증. (createChallenge 는 `redirect()` 가 throw 하므로 `NEXT_REDIRECT` 를 catch 해 assert.)
- [ ] **Step 2: 테스트 실패 확인.**
- [ ] **Step 3: 구현** — import 추가 `import { after } from "next/server";` · `import { dispatchNewChallengeCreatedNotification } from "@/lib/push/dispatch";`. `redirect(...)` 직전에:

```typescript
after(() =>
  dispatchNewChallengeCreatedNotification(challengeId, user.id, challengeFields.title).catch((e) =>
    console.error("[createChallenge] new challenge sign push failed", e),
  ),
);
```

> `after()` 콜백은 응답(redirect 포함) 송출 후 실행되므로 `redirect()` 직전 등록이 안전하다. 솔로 새 그룹이면 참가자=오너뿐이라 `excludeUserId` 로 대상 0 → 발송 없음.

- [ ] **Step 4: 테스트 통과 확인.**
- [ ] **Step 5: Commit** — `feat(challenge): 새 챌린지 생성 시 기존 멤버에게 서명 유도 push (after())`

---

## Task 3: 초대 full 벽 → 앱 동선 안내

**Files:**

- Modify: `src/app/(auth)/invite/[token]/page.tsx`

`preview.full` 분기를 막다른 화면에서 안내 + 홈 CTA 로 교체. auth 감지 없음.

- [ ] **Step 1: `preview.full` 블록 교체** — 카피 "그룹이 가득 찼어요 (최대 4명). 이미 이 그룹 멤버라면 from.with 홈에서 새 서약서를 확인하세요." + `/home` 으로 가는 버튼(`Link` + `buttonVariants` 패턴, repo 컨벤션). 비멤버는 "정원 찼음" 안내로, 멤버는 홈 동선으로.
- [ ] **Step 2: typecheck + lint** — `pnpm typecheck` · `pnpm lint`.
- [ ] **Step 3: Commit** — `feat(invite): 정원 찬 그룹 초대 full 화면에 앱 동선 안내 추가`

---

## Task 4: spec 작성

**Files:**

- Create: `docs/superpowers/specs/2026-06-01-new-challenge-sign-push.md`

알림 정책 결정(생성 시 기존 멤버 push, start 키 재사용, 인앱 banner 주 채널) + full 벽 개선 근거를 기록.

- [ ] **Step 1: spec 작성** — Context / Decision / Trade-offs(default OFF 도달률, type="start" 분리 측정 불가) / 대안 기각(신규 prefs 키·신규 analytics type·auth 기반 full 벽 수정).
- [ ] **Step 2: `pnpm validate:docs`.**
- [ ] **Step 3: Commit** — `docs(spec): 새 서약서 생성 서명 유도 push + 초대 full 벽 개선`

---

## Task 5: 통합 검증

- [ ] `pnpm typecheck` · `pnpm lint` · `pnpm test` · `pnpm validate:docs` 전부 PASS.
- [ ] 모바일 viewport 수동(후속): 기존 멤버 2명 그룹에서 오너가 새 챌린지 생성 → (옵트인·구독 시) 멤버 push 1건 도착 · 클릭 시 `/challenge/<id>/pledge` · 정원 찬 그룹 초대 링크에서 full 화면이 안내+홈 버튼으로 보이는지.

---

## Self-Review

- **Spec coverage:** grill-me 8개 결정 모두 매핑 — 트리거(T2)·수신대상(T1·T2)·옵트인/분석 start 재사용(T1)·dedup 없음(T1·T2)·딥링크 pledge(T1)·full 벽 카피(T3)·문서 spec(T4)·도달 한계 기록(T4).
- **No-migration 확인:** 새 컬럼/RPC/스키마 없음. analytics union·prefs zod 불변. spec-required CI 경고 비대상.
- **충돌:** PR #155(nudge) 머지된 develop 기준. dispatch.ts 는 additive(새 export 1개)라 충돌 없음.
