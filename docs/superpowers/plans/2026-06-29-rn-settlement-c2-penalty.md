# RN 벌칙 redemption(더블 벌금) 화면 (C2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** RN `apps/mobile`에 벌칙 창2(만회 찬스) 화면을 web과 동일한 UX로 추가한다 — 증명 영상 제출 · 동료 판정 토글 · 미제출/반려 시 다음 정산 2배 이월 안내, 그리고 home "만회 찬스 대기" 진입.

**Architecture:** penalty 상태 read는 web이 **admin hydrate**(익명 reject count·signed URL)라 RN이 직접 못 쓴다 → web read를 **주입 client 변형**(`fetchPenaltyStatusForViewerClient`)으로 쪼개고 신규 **BFF `GET /api/penalty-status`**(Bearer)로 공급한다(feed 선례). 증명 제출(영상)은 신규 **BFF `POST /api/penalty-proof`**(Bearer multipart)가 web `_actions.ts`에서 추출한 **공유 코어**(`submitPenaltyProofCore`)를 호출한다(action-log 선례). 동료 판정 토글은 파일이 없으므로 RN이 **`supabase.rpc("toggle_penalty_proof_rejection")` 직접** 호출(SECURITY DEFINER RPC가 시간창·익명성·과반을 강제). home "만회 찬스 대기"는 admin hydrate가 아닌 **순수 RLS read**라 RN이 supabase 직접 호출한다. 공유 타입은 `@withkey/domain` read-contract/write-contract로 승격해 web↔RN drift를 by construction으로 막는다.

**Tech Stack:** Expo React Native(`@withkey/mobile`) · TypeScript · StyleSheet · `expo-image-picker`(영상 촬영) · `expo-linking`(영상 외부 재생) · `@withkey/domain` · jest-expo + @testing-library/react-native / web: Next.js 16 Route Handler · Vitest · Supabase

**Spec:** [`docs/superpowers/specs/2026-06-29-rn-settlement-points-redemption-design.md`](../specs/2026-06-29-rn-settlement-points-redemption-design.md) §C2

**선행 의존:** SL0 계획(`2026-06-29-rn-settlement-sl0-design.md`)이 먼저 머지돼야 한다 — `Button`·`Card`·`Chip`·`EmptyState`·`ErrorState`·`colors`·`typography`를 소비한다.

**Branch:** `feat/rn-settlement-c2-penalty` (base: `develop`, SL0 머지 후). 푸시·PR은 사용자 확인 후.

**PR 경계 / 스택(권장):** 이 계획은 한 슬라이스(C2)지만 무겁다. 하네스 "작은 배치" 선호에 맞춰 **3개 스택 PR**로 나눠 머지하길 권한다 — ① Phase A–C(공유 계약 + web 주입 변형 + BFF read + RN read), ② Phase D–E(web 코어 + BFF write + RN mutation), ③ Phase F(RN 화면·home 진입). 각 스택은 독립적으로 typecheck·lint·test green이다. 한 PR로 묶어도 무방하다.

---

## 배경: 핵심 사실 (구현 전 필독)

코드를 쓰기 전에 아래를 사실로 받아들인다(탐색으로 확인됨). 추정 금지.

1. **penalty 상태 read는 web 전용 admin hydrate다.** `apps/web/src/lib/db/reads/penalty-status.ts`의 `fetchPenaltyStatus(challengeId, viewerId)`는 Layer 1(RLS: `challenges`·`challenge_participants`·`action_logs`·`penalty_proofs`·`users`)을 `createClient()`(cookies)로, Layer 2(익명 reject count·viewer rejection·video signed URL)를 `adminClient()` + `"use cache"`로 채운다. **주입 client 변형이 아직 없다** — C2가 feed의 `fetchChallengeFeedForViewerClient` 모델대로 추출한다.
2. **BFF 인증 골격은 feed/action-log route에 확립돼 있다.** `bearerTokenFrom(request)` → `createBearerClient(token)` → `supabase.auth.getUser(token)`. 헬퍼는 `apps/web/src/lib/supabase/bearer.ts`. read route는 `NextResponse.json(view)`, write route는 ActionResult 봉투 passthrough + `revalidateTag`(Route Handler는 `updateTag` 금지).
3. **`PenaltyStatusView`·`PenaltyProofView`·`PenaltyWindowPhase`는 web 전용**(`penalty-status.ts:31-65`)이라 RN이 공유하려면 read-contract로 승격해야 한다. read-contract는 **순수 타입 + transport 검증 zod**를 둘 다 둘 수 있다(`read-contracts/feed.ts`의 `feedItemViewSchema`·`feedResponseSchema` 선례).
4. **`windowPhase`는 BFF 응답에 포함**된다(`PenaltyStatusView.windowPhase`). RN 화면은 그 값을 그대로 게이트로 쓴다 — 재계산 불필요. 단 home "만회 찬스 대기"는 RLS-direct라 창2 게이트(종료+48h~+96h)를 RN이 메모리에서 계산한다(web `penalty-waiting.ts` 미러).
5. **penalty 제출 = 영상 업로드 동반 → BFF multipart.** 동료 판정 토글 = 파일 없음 → RN `supabase.rpc()` 직접. (spec §C0 mutation 분기.) RPC: `submit_penalty_proof(p_challenge_id, p_media_path)` → `(proof_id uuid, status text)`; `toggle_penalty_proof_rejection(p_proof_id)` → `(reject_count integer, viewer_rejected boolean, status text)`. **반환은 snake_case** — domain `penaltyProofRejectionToggleResultSchema`는 camelCase라 매핑 필수.
6. **영상 포맷 결정(이 계획에서 확정):** `action-videos` 버킷·`ALLOWED_VIDEO_MIME`은 **mp4/webm만** 허용하는데 RN `expo-image-picker` 카메라는 iOS에서 `.mov`(`video/quicktime`)를 만든다. **`video/quicktime`을 허용목록에 추가**한다 → migration 1개(버킷 `allowed_mime_types` + 영상 인증 RPC 정규식) + domain validators + storage helper + 테스트 갱신(Task 3). spec의 "migration 없음" 전제는 이 결정으로 갱신된다. **RPC 교차 영향**: `submit_penalty_proof`(0055)는 확장자를 검사하지 않으므로(길이+경로 prefix만) 무관하나, **같은 버킷을 쓰는 영상 인증 교체 RPC `update_action_log_video_path`(0054)는 파일명 정규식 `(mp4|webm)`로 확장자를 검사**한다 — 버킷이 mov를 열면 영상 인증(EVAL-0043) 경로가 `.mov`를 `22023`으로 거부해 불일치한다. 그래서 0059가 이 RPC 정규식도 `(mp4|webm|mov)`로 함께 갱신한다(사용자 결정 "mov 추가 — EVAL-0043 영향 포함"과 정합).
7. **RN에 인라인 video player가 없다.** `apps/mobile`에 `expo-video`/`expo-av` 의존이 없다. 증명 영상 재생은 `expo-linking`의 `Linking.openURL(signedUrl)`(시스템 플레이어)로 처리한다. 인라인 재생은 후속.
8. **공유 코어 분리가 안 돼 있다.** web `_actions.ts`의 `submitPenaltyProof`는 `createClient()`에 직접 의존한다 — `submitActionLogCore`처럼 client·user 주입형 `submitPenaltyProofCore`로 추출해야 web↔RN 패리티가 보장된다.
9. **RN BFF 클라이언트는 zod parse를 하지 않는다.** `apps/mobile/src/services/api/bff-client.ts`의 `bffGetJson`(!ok면 `BffRequestError` throw)·`bffPostFormData`(봉투를 값 반환, `Content-Type` 미설정)만 제공. 응답 zod parse는 feature service(`feed-reads`·`submit-action-log` 선례)가 한다.
10. **RN penalty 라우트는 없다.** `apps/mobile/src/app/(app)/challenge/[id]/`에 `penalty.tsx` 신설. mock supabase(`@/shared/testing/mock-supabase`)의 빌더 메서드(`select/is/in/eq/or/not/gt/order/limit`)는 **no-op(필터 안 함)** — fixture는 read의 in-memory 로직만 검증한다.

### C2에서 의도적으로 제외하는 것 (후속)

| 제외 항목                       | 이유                                                                                                |
| ------------------------------- | --------------------------------------------------------------------------------------------------- |
| **증명 영상 인라인 재생**       | `expo-video`/`expo-av` 미설치. `Linking.openURL`로 외부 재생. 인라인은 의존 추가 필요 → 후속.       |
| **RN analytics emit**           | `track()`은 server-side service_role. RN은 직접 못 부른다(spec Out of scope).                       |
| **영상 클라이언트 압축**        | 서버(`uploadVideo`)가 20MB·MIME 상한을 강제. 클라 압축은 후속(현재 사진만 `prepare-photo.ts` 존재). |
| **carry-over(−2X) 영수증 라인** | C1 후속(별도). C2는 penalty 화면만.                                                                 |

---

## File Structure

**신규 (domain — 공유 계약):**

- `packages/domain/src/read-contracts/penalty.ts` — `PenaltyStatusView`·`PenaltyProofView`·`PenaltyWindowPhase`·`PenaltyWaitingView` + transport zod
- `packages/domain/src/read-contracts/penalty.spec.ts` — schema parity 테스트
- `packages/domain/src/write-contracts/penalty.ts` — 증명 제출 응답 envelope schema

**신규 (web — BFF + 코어):**

- `apps/web/src/app/api/penalty-status/route.ts` — penalty 상태 BFF read(Bearer)
- `apps/web/src/app/api/penalty-status/route.spec.ts` — route 계약 테스트
- `apps/web/src/app/api/penalty-proof/route.ts` — 증명 제출 BFF(Bearer multipart)
- `apps/web/src/app/api/penalty-proof/route.spec.ts` — route 계약 테스트
- `apps/web/src/lib/penalty/submit-proof-core.ts` — 증명 제출 공유 코어(client·user 주입)

**신규 (migration):**

- `supabase/migrations/0059_action_videos_allow_mov.sql` — 버킷 `allowed_mime_types`에 `video/quicktime` 추가 + 영상 인증 RPC `update_action_log_video_path` 정규식 `(mp4|webm|mov)` 갱신

**신규 (fixture):**

- `evals/fixtures/read-contracts/penalty-status.ts`
- `evals/fixtures/read-contracts/penalty-waiting.ts`

**신규 (RN):**

- `apps/mobile/src/features/penalty/api/penalty-reads.ts` — `fetchPenaltyStatus`(BFF) · `fetchPenaltyWaiting`(RLS-direct)
- `apps/mobile/src/features/penalty/api/penalty-reads.spec.ts`
- `apps/mobile/src/features/penalty/api/submit-penalty-proof.ts` — BFF multipart mutation
- `apps/mobile/src/features/penalty/api/toggle-penalty-rejection.ts` — RPC 직접 mutation
- `apps/mobile/src/features/penalty/api/penalty-mutations.spec.ts`
- `apps/mobile/src/features/penalty/components/penalty-proof-form.tsx`
- `apps/mobile/src/features/penalty/components/penalty-proof-card.tsx`
- `apps/mobile/src/features/penalty/components/penalty-judge-buttons.tsx`
- `apps/mobile/src/features/penalty/components/penalty-waiting-section.tsx`
- `apps/mobile/src/features/penalty/components/penalty-components.spec.tsx`
- `apps/mobile/src/features/penalty/index.ts` — feature barrel
- `apps/mobile/src/app/(app)/challenge/[id]/penalty.tsx` — penalty 화면
- `apps/mobile/src/app/(app)/challenge/[id]/penalty.spec.tsx`

**수정:**

- `packages/domain/src/read-contracts/index.ts` · `packages/domain/src/write-contracts/index.ts` — barrel
- `packages/domain/src/validators/action-log.ts` + `.spec.ts` — `video/quicktime` 추가
- `apps/web/src/lib/storage/action-videos.ts` — mov 확장자/MIME/regex
- `apps/web/src/lib/db/reads/penalty-status.ts` — 타입 import 치환 + 주입 변형 추출
- `apps/web/src/app/(app)/challenge/[id]/penalty/_actions.ts` — `submitPenaltyProof` 코어 위임
- `apps/mobile/src/app/(app)/(tabs)/home.tsx` — "만회 찬스 대기" 섹션

---

# Phase A — 공유 계약 (domain + 영상 허용)

## Task 1: read-contract penalty.ts 승격

**Files:**

- Create: `packages/domain/src/read-contracts/penalty.ts`
- Create: `packages/domain/src/read-contracts/penalty.spec.ts`
- Modify: `packages/domain/src/read-contracts/index.ts`
- Modify: `apps/web/src/lib/db/reads/penalty-status.ts` (타입 import 치환)

- [ ] **Step 1: 실패 테스트 작성 (schema가 web view-model을 수용하는지)**

```typescript
// packages/domain/src/read-contracts/penalty.spec.ts
import { describe, it, expect } from "vitest";
import {
  penaltyStatusViewSchema,
  penaltyProofViewSchema,
  penaltyWindowPhaseSchema,
  type PenaltyStatusView,
} from "./penalty";

const PROOF = {
  proofId: "11111111-1111-1111-1111-111111111111",
  performerId: "u-jj",
  performerName: "JJ",
  status: "pending" as const,
  videoSignedUrl: "https://signed.example.com/v1",
  rejectCount: 1,
  viewerRejected: false,
  rejectedByPeers: false,
  isViewer: false,
};

const VIEW: PenaltyStatusView = {
  challengeId: "c1",
  title: "주 3회 헬스장",
  penaltyMission: "팔굽혀펴기 20개",
  penaltyAmount: 3000,
  windowPhase: "open",
  endAt: "2026-05-08T00:00:00Z",
  isParticipant: true,
  isSigned: true,
  viewerConfirmedPenalty: 3000,
  viewerProof: { ...PROOF, performerId: "u-minji", performerName: "민지", isViewer: true },
  proofs: [PROOF],
  signedParticipantCount: 3,
};

describe("penalty read-contract zod", () => {
  it("penaltyWindowPhaseSchema는 before/open/expired만 수용", () => {
    expect(penaltyWindowPhaseSchema.parse("open")).toBe("open");
    expect(penaltyWindowPhaseSchema.safeParse("running").success).toBe(false);
  });

  it("penaltyProofViewSchema가 proof view를 수용", () => {
    expect(penaltyProofViewSchema.parse(PROOF)).toEqual(PROOF);
  });

  it("penaltyStatusViewSchema가 status view를 round-trip", () => {
    expect(penaltyStatusViewSchema.parse(VIEW)).toEqual(VIEW);
  });

  it("status enum 밖이면 거부", () => {
    expect(penaltyProofViewSchema.safeParse({ ...PROOF, status: "settled" }).success).toBe(false);
  });

  it("익명성 by contract — voter_id 류 누출 필드는 schema가 strip (spec §Verification ②)", () => {
    // BFF 응답에 익명성 위반 필드가 실수로 실려도 read-contract 가 reject count 만 남기고 strip 한다.
    const leaked = { ...PROOF, voterId: "u-secret", rejecterIds: ["u-a", "u-b"] };
    const parsed = penaltyProofViewSchema.parse(leaked);
    expect("voterId" in parsed).toBe(false);
    expect("rejecterIds" in parsed).toBe(false);
  });
});
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `pnpm --filter @withkey/domain test -- penalty`
Expected: FAIL — `./penalty` 모듈 없음.

- [ ] **Step 3: read-contract penalty.ts 작성**

```typescript
// packages/domain/src/read-contracts/penalty.ts
// read-contracts/penalty — 벌칙(만회 찬스) 창2 화면 view-model 계약 (spec 2026-06-29 §C2 · ADR-0037).
// web fetchPenaltyStatus(admin hydrate)는 RN 에서 BFF `GET /api/penalty-status`(Bearer) 단일 endpoint
// 로만 노출된다 — admin hydrate read 는 mobile 직접 노출 금지. 본 zod 가 그 HTTP 응답 SoT(feed.ts 패턴).
// PenaltyWaitingView 는 순수 RLS read(home "만회 찬스 대기")라 BFF 가 아니라 RN 직접 read → 타입만(transport 불요).
// 추출 소스: apps/web/src/lib/db/reads/penalty-status.ts · penalty-waiting.ts. 여기 타입이 SoT 다.
import { z } from "zod";
import { penaltyProofStatusSchema, type PenaltyProofStatus } from "../validators/penalty";

// 창2 페이즈 — 종료+48h 전 'before' / [+48h,+96h] 'open' / +96h 후 'expired'.
export const penaltyWindowPhaseSchema = z.enum(["before", "open", "expired"]);
export type PenaltyWindowPhase = z.infer<typeof penaltyWindowPhaseSchema>;

export type PenaltyProofView = {
  proofId: string;
  performerId: string;
  performerName: string;
  status: PenaltyProofStatus;
  videoSignedUrl: string | null;
  rejectCount: number;
  viewerRejected: boolean;
  // 과반 반려 판정(표시용) — isPenaltyProofRejectedByPeers(rejectCount, signedParticipantCount).
  rejectedByPeers: boolean;
  isViewer: boolean;
};

export const penaltyProofViewSchema: z.ZodType<PenaltyProofView> = z.object({
  proofId: z.string(),
  performerId: z.string(),
  performerName: z.string(),
  status: penaltyProofStatusSchema,
  videoSignedUrl: z.string().nullable(),
  rejectCount: z.number().int().nonnegative(),
  viewerRejected: z.boolean(),
  rejectedByPeers: z.boolean(),
  isViewer: z.boolean(),
});

export type PenaltyStatusView = {
  challengeId: string;
  title: string;
  penaltyMission: string | null;
  penaltyAmount: number;
  // 창2 타임라인(화면 분기 게이트). end 는 closed_at ?? end_at.
  windowPhase: PenaltyWindowPhase;
  endAt: string | null;
  isParticipant: boolean;
  isSigned: boolean;
  // 확정 미달분 X>0(창1 닫힌 뒤 제출 자격). amount(원) — 0 이면 제출 대상 아님.
  viewerConfirmedPenalty: number;
  viewerProof: PenaltyProofView | null;
  proofs: PenaltyProofView[];
  // 서약 참가자 수(과반 분모).
  signedParticipantCount: number;
};

export const penaltyStatusViewSchema: z.ZodType<PenaltyStatusView> = z.object({
  challengeId: z.string(),
  title: z.string(),
  penaltyMission: z.string().nullable(),
  penaltyAmount: z.number(),
  windowPhase: penaltyWindowPhaseSchema,
  endAt: z.string().nullable(),
  isParticipant: z.boolean(),
  isSigned: z.boolean(),
  viewerConfirmedPenalty: z.number(),
  viewerProof: penaltyProofViewSchema.nullable(),
  proofs: z.array(penaltyProofViewSchema),
  signedParticipantCount: z.number().int().nonnegative(),
});

// home "만회 찬스 대기" — 순수 RLS read view-model (BFF 아님, RN 직접). transport zod 불요(타입만).
export type PenaltyWaitingView = {
  challengeId: string;
  title: string;
  groupName: string | null;
  penaltyAmount: number;
};
```

- [ ] **Step 4: barrel에 export 추가**

`packages/domain/src/read-contracts/index.ts`에 한 줄 추가(기존 `export * from "./feed";` 아래):

```typescript
export * from "./penalty";
```

- [ ] **Step 5: 테스트 실행 → 통과 확인**

Run: `pnpm --filter @withkey/domain test -- penalty`
Expected: PASS

- [ ] **Step 6: web penalty-status.ts의 지역 타입 → domain import 치환**

`apps/web/src/lib/db/reads/penalty-status.ts`의 **지역 타입 정의 블록**(현재 `// 창2 페이즈 — RPC 의 시간창 검증...` 주석부터 `PenaltyStatusView` 타입 끝까지)을 domain import + re-export로 교체한다. 아래 old 블록을 정확히 찾아 교체:

old (현재 파일의 `PenaltyWindowPhase`~`PenaltyStatusView` 지역 정의 — 주석 포함 전체):

```typescript
// 창2 페이즈 — RPC 의 시간창 검증(0055 §E·§F)을 read 측에서 미러해 page 가 미리 분기한다.
export type PenaltyWindowPhase = "before" | "open" | "expired";

export type PenaltyProofView = {
  proofId: string;
  performerId: string;
  performerName: string;
  status: PenaltyProofStatus;
  videoSignedUrl: string | null;
  rejectCount: number;
  viewerRejected: boolean;
  // 과반 반려 판정(표시용) — isPenaltyProofRejectedByPeers(rejectCount, signedParticipantCount).
  rejectedByPeers: boolean;
  isViewer: boolean;
};

export type PenaltyStatusView = {
  challengeId: string;
  title: string;
  penaltyMission: string | null;
  penaltyAmount: number;
  // 창2 타임라인 (page 분기 게이트). end 는 closed_at ?? end_at.
  windowPhase: PenaltyWindowPhase;
  endAt: string | null;
  // viewer 자격·상태.
  isParticipant: boolean;
  isSigned: boolean;
  // 확정 미달분 X>0 (창1 닫힌 뒤 제출 자격). amount(원) — 0 이면 제출 대상 아님.
  viewerConfirmedPenalty: number;
  viewerProof: PenaltyProofView | null;
  // 그룹 멤버 증명 목록(viewer 본인 포함). 판단 UI 는 본인 외 proof 에 토글을 건다.
  proofs: PenaltyProofView[];
  // 서약 참가자 수(과반 분모). isPenaltyProofRejectedByPeers 분모와 정합.
  signedParticipantCount: number;
};
```

new (domain SoT import + 기존 consumer 호환 위한 re-export):

```typescript
// view-model 타입은 @withkey/domain read-contract 가 SoT (web·RN·BFF 공유, spec §C2 승격).
// 기존 web consumer(penalty-proof-card.tsx 의 import path)를 깨지 않게 re-export 보존.
import type { PenaltyWindowPhase, PenaltyProofView, PenaltyStatusView } from "@withkey/domain";
export type { PenaltyWindowPhase, PenaltyProofView, PenaltyStatusView };
```

> `penalty-proof-card.tsx`는 `import type { PenaltyProofView } from "@/lib/db/reads/penalty-status"`를 쓰는데, 위 re-export가 그 경로를 보존하므로 **penalty-proof-card.tsx는 수정 불필요**. `PenaltyProofStatus`는 기존 `@withkey/domain` import 블록에 이미 있으므로 유지.

- [ ] **Step 7: web typecheck (비파괴 확인)**

Run: `pnpm --filter web exec tsc --noEmit`
Expected: PASS — penalty-status.ts·penalty-proof-card.tsx가 domain 타입을 본다.

- [ ] **Step 8: Commit**

```bash
git add packages/domain/src/read-contracts/penalty.ts packages/domain/src/read-contracts/penalty.spec.ts packages/domain/src/read-contracts/index.ts apps/web/src/lib/db/reads/penalty-status.ts
git commit -m "feat(domain): penalty read-contract 승격 (PenaltyStatusView/ProofView/WaitingView + transport zod)"
```

---

## Task 2: write-contract penalty.ts (증명 제출 응답 envelope)

**Files:**

- Create: `packages/domain/src/write-contracts/penalty.ts`
- Modify: `packages/domain/src/write-contracts/index.ts`

증명 제출 BFF 응답 봉투 — `submitActionLogResponseSchema`(`write-contracts/action-log.ts`) 패턴 미러. RN이 `.ok` 분기 + zod parse 하는 SoT.

- [ ] **Step 1: 실패 테스트 작성**

```typescript
// packages/domain/src/write-contracts/penalty.spec.ts
import { describe, it, expect } from "vitest";
import { penaltyProofSubmitResponseSchema } from "./penalty";

describe("penaltyProofSubmitResponseSchema", () => {
  it("성공 봉투를 parse", () => {
    const parsed = penaltyProofSubmitResponseSchema.parse({
      ok: true,
      data: { proofId: "11111111-1111-1111-1111-111111111111", status: "pending" },
    });
    expect(parsed.ok).toBe(true);
  });

  it("실패 봉투를 parse", () => {
    const parsed = penaltyProofSubmitResponseSchema.parse({ ok: false, error: "forbidden" });
    expect(parsed.ok).toBe(false);
  });

  it("data의 extra 키(mediaPath)는 strip", () => {
    const parsed = penaltyProofSubmitResponseSchema.parse({
      ok: true,
      data: { proofId: "x", status: "pending", mediaPath: "u/c/penalty-abc.mov" },
    });
    if (parsed.ok) expect("mediaPath" in parsed.data).toBe(false);
  });

  it("알 수 없는 error 코드는 throw", () => {
    expect(() => penaltyProofSubmitResponseSchema.parse({ ok: false, error: "teapot" })).toThrow();
  });
});
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `pnpm --filter @withkey/domain test -- write-contracts/penalty`
Expected: FAIL — 모듈 없음.

- [ ] **Step 3: write-contract penalty.ts 작성**

```typescript
// packages/domain/src/write-contracts/penalty.ts
// write-contracts/penalty — 벌칙 증명 제출 BFF 쓰기 계약 (spec 2026-06-29 §C2).
// web Server Action(submitPenaltyProof) · BFF route(POST /api/penalty-proof) · RN service 가
// 공유하는 응답 SoT. ActionResult 봉투 passthrough — action-log.ts 패턴 동일.
import { z } from "zod";
import { errorCodeSchema } from "./action-log";
import { penaltyProofStatusSchema } from "../validators/penalty";

// _actions.ts SubmitResult({ proofId, status }) 승격. mediaPath 는 서버 내부값이라 응답에서 strip.
export const penaltyProofSubmitResultSchema = z.object({
  proofId: z.string(),
  status: penaltyProofStatusSchema,
});
export type PenaltyProofSubmitResult = z.infer<typeof penaltyProofSubmitResultSchema>;

const issuesSchema = z.record(z.string(), z.array(z.string()).optional()).optional();

// ActionResult<PenaltyProofSubmitResult> 봉투 discriminated union.
export const penaltyProofSubmitResponseSchema = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), data: penaltyProofSubmitResultSchema }),
  z.object({ ok: z.literal(false), error: errorCodeSchema, issues: issuesSchema }),
]);
export type PenaltyProofSubmitResponse = z.infer<typeof penaltyProofSubmitResponseSchema>;
```

- [ ] **Step 4: barrel에 export 추가**

`packages/domain/src/write-contracts/index.ts`에 추가(기존 `export * from "./action-log";` 아래):

```typescript
export * from "./penalty";
```

- [ ] **Step 5: 테스트 실행 → 통과 확인**

Run: `pnpm --filter @withkey/domain test -- write-contracts/penalty`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/domain/src/write-contracts/penalty.ts packages/domain/src/write-contracts/penalty.spec.ts packages/domain/src/write-contracts/index.ts
git commit -m "feat(domain): penalty 증명 제출 응답 write-contract (envelope schema)"
```

---

## Task 3: 영상 허용목록에 mov(video/quicktime) 추가

**Files:**

- Create: `supabase/migrations/0059_action_videos_allow_mov.sql`
- Modify: `packages/domain/src/validators/action-log.ts`
- Modify: `packages/domain/src/validators/action-log.spec.ts`
- Modify: `apps/web/src/lib/storage/action-videos.ts`

iOS `expo-image-picker` 카메라 영상은 `.mov`(`video/quicktime`)다. **버킷·영상 인증 RPC(`update_action_log_video_path`)·도메인·storage 헬퍼 네 곳**을 함께 확장한다(배경 §6 RPC 교차 영향). **spec-required 경로 변경**(`packages/domain/src/validators/**` · `supabase/migrations/**`) — 변경 근거는 본 계획 §6과 spec §C2다.

> **ADR 권고:** migration(버킷 MIME = 보안 표면, 단방향 prod 적용)이라 가드레일상 ADR이 권장된다. 0054의 "mp4/webm만" 결정을 mov로 확장하는 트레이드오프를 한 줄 ADR-lite로 남기길 권한다(`pnpm new adr action-videos-allow-mov`). 본 계획+spec으로 갈음할 수도 있으나(soft warn), 리뷰어 다수가 ADR을 권했다.

- [ ] **Step 1: 실패 테스트로 갱신 (quicktime 수용으로 flip)**

`packages/domain/src/validators/action-log.spec.ts`의 quicktime 거부 테스트(현재 "rejects a non-allowlisted MIME (e.g. image or quicktime)")를 교체한다.

old:

```typescript
it("rejects a non-allowlisted MIME (e.g. image or quicktime)", () => {
  expect(actionVideoMetaSchema.safeParse({ ...base, mime: "video/quicktime" }).success).toBe(false);
  expect(actionVideoMetaSchema.safeParse({ ...base, mime: "image/jpeg" }).success).toBe(false);
});
```

new:

```typescript
it("accepts quicktime (iOS .mov, RN 카메라) and rejects non-video MIME", () => {
  // RN expo-image-picker 카메라는 iOS 에서 video/quicktime(.mov)을 생성한다 (0059).
  expect(actionVideoMetaSchema.safeParse({ ...base, mime: "video/quicktime" }).success).toBe(true);
  expect(actionVideoMetaSchema.safeParse({ ...base, mime: "image/jpeg" }).success).toBe(false);
});
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `pnpm --filter @withkey/domain test -- action-log`
Expected: FAIL — quicktime이 아직 거부됨(allowlist 미반영).

- [ ] **Step 3: domain validators에 quicktime 추가**

`packages/domain/src/validators/action-log.ts:10`의 `ALLOWED_VIDEO_MIME`을 교체.

old:

```typescript
export const ALLOWED_VIDEO_MIME = ["video/mp4", "video/webm"] as const;
```

new:

```typescript
// RN(apps/mobile) 카메라 호환: iOS=video/quicktime(.mov), Android=video/mp4 (0059 버킷 동기).
export const ALLOWED_VIDEO_MIME = ["video/mp4", "video/webm", "video/quicktime"] as const;
```

- [ ] **Step 4: storage 헬퍼에 mov 확장자/MIME/regex 추가**

`apps/web/src/lib/storage/action-videos.ts`에서 세 곳을 수정한다.

(a) `ALLOWED_EXT` (`:10`):

old:

```typescript
const ALLOWED_EXT = ["mp4", "webm"] as const;
```

new:

```typescript
const ALLOWED_EXT = ["mp4", "webm", "mov"] as const;
```

(b) `MIME_TO_EXT` (`:13-16`):

old:

```typescript
const MIME_TO_EXT: Record<AllowedVideoMime, AllowedExt> = {
  "video/mp4": "mp4",
  "video/webm": "webm",
};
```

new:

```typescript
const MIME_TO_EXT: Record<AllowedVideoMime, AllowedExt> = {
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
};
```

(c) `EXT_TO_MIME` (`:18-21`):

old:

```typescript
const EXT_TO_MIME: Record<AllowedExt, AllowedVideoMime> = {
  mp4: "video/mp4",
  webm: "video/webm",
};
```

new:

```typescript
const EXT_TO_MIME: Record<AllowedExt, AllowedVideoMime> = {
  mp4: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
};
```

(d) `VIDEO_PATH_RE` (`:24-25`):

old:

```typescript
const VIDEO_PATH_RE =
  /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+-[A-Za-z0-9._-]+\.(mp4|webm)$/i;
```

new:

```typescript
const VIDEO_PATH_RE =
  /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+-[A-Za-z0-9._-]+\.(mp4|webm|mov)$/i;
```

- [ ] **Step 5: migration 작성 (버킷 allowed_mime_types 확장)**

```sql
-- supabase/migrations/0059_action_videos_allow_mov.sql
-- action-videos 버킷 allowed_mime_types 에 video/quicktime(.mov) 추가 (RN iOS 카메라).
-- 왜: RN(apps/mobile) expo-image-picker 카메라 영상이 iOS 에서 .mov(quicktime)를 생성한다.
-- 0054 버킷은 mp4/webm 만 허용해 iOS 의 벌칙 증명·영상 인증 업로드가 storage 레벨에서 거부됐다.
-- spec 2026-06-29-rn-settlement-points-redemption-design §C2(영상 포맷 결정). 단방향(POC).
-- av_insert_self RLS 는 경로 prefix 만 검사하므로 RLS 변경 불요.
-- submit_penalty_proof RPC(0055)는 확장자를 검사하지 않으므로(길이+경로 segment) 변경 불요.
-- 단 같은 버킷의 영상 인증 교체 RPC update_action_log_video_path(0054)는 파일명 정규식으로
-- (mp4|webm)만 허용하므로, 버킷이 mov 를 열면 영상 인증 경로가 불일치한다 → 정규식도 (mp4|webm|mov)로 갱신.

-- A. 버킷 MIME 허용 확장 (전체 배열 재할당 — mp4/webm 반드시 포함).
update storage.buckets
  set allowed_mime_types = array['video/mp4', 'video/webm', 'video/quicktime']
  where id = 'action-videos';

-- B. 영상 인증 경로 교체 RPC — 0054 본문 보존 + 파일명 정규식만 (mp4|webm) → (mp4|webm|mov).
create or replace function public.update_action_log_video_path(
  p_log_id uuid,
  p_video_path text
)
returns void
language plpgsql security definer
set search_path = public as $$
declare
  v_owner uuid;
  v_challenge_id uuid;
  v_filename text;
begin
  select user_id, challenge_id
    into v_owner, v_challenge_id
    from public.action_logs
    where id = p_log_id;

  if v_owner is null then
    raise exception 'action_log not found' using errcode = 'P0002';
  end if;

  if v_owner <> auth.uid() then
    raise exception 'not owner' using errcode = '42501';
  end if;

  if p_video_path is not null then
    if char_length(p_video_path) not between 10 and 512 then
      raise exception 'invalid video_path length' using errcode = '22023';
    end if;

    if split_part(p_video_path, '/', 1) <> v_owner::text
       or split_part(p_video_path, '/', 2) <> v_challenge_id::text then
      raise exception 'video_path does not match action_log owner/challenge' using errcode = '42501';
    end if;

    v_filename := split_part(p_video_path, '/', 3);
    if v_filename !~ ('^' || p_log_id::text || '-[A-Za-z0-9._-]+\.(mp4|webm|mov)$') then
      raise exception 'invalid video_path filename' using errcode = '22023';
    end if;
  end if;

  update public.action_logs
    set video_path = p_video_path
    where id = p_log_id;
end;
$$;

revoke all on function public.update_action_log_video_path(uuid, text) from public, anon;
grant execute on function public.update_action_log_video_path(uuid, text) to authenticated, service_role;
```

- [ ] **Step 6: storage 헬퍼 mov 경로 단위 확인 추가**

`apps/web/src/lib/storage/action-videos.ts`의 기존 spec(있으면 `action-videos.spec.ts`, 없으면 신규)에 mov 비파괴 케이스를 추가한다 — `ALLOWED_EXT` 상수만 바꾸고 `buildVideoPath` 내부 `ALLOWED_EXT` 참조를 놓치는 회귀를 막는다.

```typescript
// action-videos.spec.ts 에 추가 (vitest)
import { describe, it, expect } from "vitest";
import { buildVideoPath, extFromVideoFile, looksLikeVideoPath } from "./action-videos";

describe("action-videos — mov(quicktime) 허용 (0059)", () => {
  it("extFromVideoFile: video/quicktime → mov", () => {
    expect(extFromVideoFile({ type: "video/quicktime", name: "x.mov" })).toBe("mov");
  });
  it("buildVideoPath: mov 확장자 throw 없음", () => {
    const path = buildVideoPath({
      userId: "u1",
      challengeId: "c1",
      actionLogId: "penalty",
      ext: "mov",
      nonce: "abc123",
    });
    expect(path).toBe("u1/c1/penalty-abc123.mov");
  });
  it("looksLikeVideoPath: .mov 경로 수용 (feed getVideoSignedUrls gate)", () => {
    expect(looksLikeVideoPath("u1/c1/penalty-abc.mov")).toBe(true);
  });
});
```

- [ ] **Step 7: 테스트 실행 → 통과 + 비파괴 확인**

Run: `pnpm --filter @withkey/domain test -- action-log`
Expected: PASS — quicktime 수용.

Run: `pnpm --filter web test -- action-videos`
Expected: PASS — mov 경로 3종 green.

Run: `pnpm --filter web exec tsc --noEmit`
Expected: PASS — `MIME_TO_EXT`/`EXT_TO_MIME` Record가 3키로 완전(타입 완전성).

> migration은 로컬에 적용 시점에 검증: `pnpm supabase db reset` 후 (a) `select allowed_mime_types from storage.buckets where id='action-videos';` → `{video/mp4,video/webm,video/quicktime}`, (b) `.mov` 파일명으로 `update_action_log_video_path` 호출이 `22023` 없이 통과하는지 역할별 실측. (CI/머지 전 수동 1회.)

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/0059_action_videos_allow_mov.sql packages/domain/src/validators/action-log.ts packages/domain/src/validators/action-log.spec.ts apps/web/src/lib/storage/action-videos.ts
git commit -m "feat(storage): action-videos 에 video/quicktime(.mov) 허용 — 버킷 + 영상 인증 RPC + validators (0059)"
```

---

# Phase B — web 주입 변형 + BFF read

## Task 4: fetchPenaltyStatusForViewerClient 주입 변형 추출

**Files:**

- Modify: `apps/web/src/lib/db/reads/penalty-status.ts`

`fetchPenaltyStatus(challengeId, viewerId)`(cookie client 의존)를 challenge-feed 모델대로 둘로 쪼갠다 — Layer 1을 주입 client로 실행하는 `fetchPenaltyStatusForViewerClient`를 추출하고, 기존 함수는 그것에 위임하는 cookie wrapper로 보존한다. **동작 비파괴**(wrapper가 cookie client를 주입). Layer 2 helper 3종(adminClient + `"use cache"`)은 변경 없이 공유.

- [ ] **Step 1: SupabaseClient 타입 import 추가**

`apps/web/src/lib/db/reads/penalty-status.ts` 상단 import에 추가(기존 `import { createClient } from "@/lib/supabase/server";` 아래):

```typescript
import type { SupabaseClient } from "@supabase/supabase-js";
```

- [ ] **Step 2: 함수 헤더를 wrapper + 주입 변형으로 교체**

`fetchPenaltyStatus`의 헤더(시그니처 + `const supabase = await createClient();`)를 교체한다.

old:

```typescript
export async function fetchPenaltyStatus(
  challengeId: string,
  viewerId: string,
): Promise<PenaltyStatusView | null> {
  const supabase = await createClient();
```

new:

```typescript
// cookie 세션 경로(web RSC) — Layer 1 을 cookie client 로 주입해 변형에 위임. 동작 무변경.
export async function fetchPenaltyStatus(
  challengeId: string,
  viewerId: string,
): Promise<PenaltyStatusView | null> {
  const supabase = await createClient();
  return fetchPenaltyStatusForViewerClient(supabase, challengeId, viewerId);
}

// Bearer(BFF /api/penalty-status) 경로 — RN 전용 (ADR-0036 §1·§2, feed fetchChallengeFeedForViewerClient 모델).
// Layer 1(challenges·participants·action_logs·penalty_proofs·users)을 호출자가 주입한 RLS user client 로
// 실행한다(admin 대체 금지). Layer 2(reject count·viewer rejection·signed URL)는 adminClient hydrate 그대로 공유.
export async function fetchPenaltyStatusForViewerClient(
  viewerClient: SupabaseClient,
  challengeId: string,
  viewerId: string,
): Promise<PenaltyStatusView | null> {
  const supabase = viewerClient;
```

> 나머지 본문(`const { data: c, error } = await supabase.from("challenges")...`부터 `return {...}`까지)은 그대로 둔다 — `supabase`가 이제 주입 client다. Layer 2 helper(`getPenaltyProofRejectCount` 등)는 내부에서 `adminClient()`를 쓰므로 변경 없음.

- [ ] **Step 3: typecheck + 기존 web 테스트 비파괴**

Run: `pnpm --filter web exec tsc --noEmit`
Expected: PASS

Run: `pnpm --filter web test -- penalty-status`
Expected: PASS (기존 테스트가 있으면 green; 없으면 typecheck로 갈음 — wrapper가 동작 보존).

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/lib/db/reads/penalty-status.ts
git commit -m "refactor(web/reads): fetchPenaltyStatusForViewerClient 주입 변형 추출 (BFF 경로용)"
```

---

## Task 5: BFF GET /api/penalty-status route

**Files:**

- Create: `apps/web/src/app/api/penalty-status/route.ts`
- Create: `apps/web/src/app/api/penalty-status/route.spec.ts`

feed BFF route 미러. Bearer 인증 → challengeId zod 검증 → 주입 변형 호출 → JSON. 벌칙 미션이 없거나 접근 불가(null)면 404(RN이 null로 해석).

- [ ] **Step 1: 실패 테스트 작성 (route 계약)**

```typescript
// apps/web/src/app/api/penalty-status/route.spec.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetUser = vi.fn();
const mockFetch = vi.fn();

vi.mock("@/lib/supabase/bearer", () => ({
  bearerTokenFrom: (req: Request) => {
    const h = req.headers.get("authorization");
    if (!h) return null;
    const [s, t] = h.split(" ");
    return s?.toLowerCase() === "bearer" && t ? t : null;
  },
  createBearerClient: () => ({ auth: { getUser: mockGetUser } }),
}));
vi.mock("@/lib/db/reads/penalty-status", () => ({
  fetchPenaltyStatusForViewerClient: (...a: unknown[]) => mockFetch(...a),
}));

// eslint-disable-next-line import/first
import { GET } from "./route";

const CID = "11111111-1111-1111-1111-111111111111";
function req(token: string | null, cid: string | null = CID): Request {
  const url = `https://x.test/api/penalty-status${cid ? `?challengeId=${cid}` : ""}`;
  return new Request(url, token ? { headers: { authorization: `Bearer ${token}` } } : {});
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetUser.mockResolvedValue({ data: { user: { id: "u-minji" } }, error: null });
});

describe("GET /api/penalty-status", () => {
  it("토큰 없으면 401", async () => {
    const res = await GET(req(null));
    expect(res.status).toBe(401);
  });

  it("challengeId가 uuid 아니면 400", async () => {
    const res = await GET(req("tok", "not-a-uuid"));
    expect(res.status).toBe(400);
  });

  it("view가 있으면 200 + JSON", async () => {
    mockFetch.mockResolvedValue({ challengeId: CID, penaltyMission: "팔굽혀펴기", proofs: [] });
    const res = await GET(req("tok"));
    expect(res.status).toBe(200);
    expect((await res.json()).challengeId).toBe(CID);
  });

  it("null(접근 불가)이면 404", async () => {
    mockFetch.mockResolvedValue(null);
    const res = await GET(req("tok"));
    expect(res.status).toBe(404);
  });

  it("벌칙 미션 없으면 404", async () => {
    mockFetch.mockResolvedValue({ challengeId: CID, penaltyMission: null, proofs: [] });
    const res = await GET(req("tok"));
    expect(res.status).toBe(404);
  });

  it("read throw → 500 (feed 선례: 봉투 계약 밖, RN은 BffRequestError로 처리)", async () => {
    mockFetch.mockRejectedValue(new Error("boom"));
    const res = await GET(req("tok"));
    expect(res.status).toBe(500);
  });
});
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `pnpm --filter web test -- penalty-status/route`
Expected: FAIL — `./route` 없음.

- [ ] **Step 3: route.ts 작성**

```typescript
// apps/web/src/app/api/penalty-status/route.ts
// RN BFF — 벌칙 창2 상태 단일 read endpoint (spec 2026-06-29 §C2 · ADR-0036 §1 · feed 선례).
// `GET /api/penalty-status?challengeId=` + `Authorization: Bearer <token>` → PenaltyStatusView (JSON).
// 가드레일: Route Handler 는 RN BFF(Bearer) 전용 — PWA(web)는 호출 금지(web 은 RSC + fetchPenaltyStatus).
// Layer 1 visibility 는 Bearer token RLS user client 로 실행(admin 대체 금지) — fetchPenaltyStatusForViewerClient.
import { NextResponse } from "next/server";
import { challengeSchema } from "@withkey/domain";
import { fetchPenaltyStatusForViewerClient } from "@/lib/db/reads/penalty-status";
import { bearerTokenFrom, createBearerClient } from "@/lib/supabase/bearer";

const challengeIdSchema = challengeSchema.shape.id;

export async function GET(request: Request) {
  const token = bearerTokenFrom(request);
  if (!token) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createBearerClient(token);
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token);
  if (error || !user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const parsed = challengeIdSchema.safeParse(new URL(request.url).searchParams.get("challengeId"));
  if (!parsed.success) {
    return NextResponse.json({ error: "challengeId must be a uuid" }, { status: 400 });
  }

  try {
    const view = await fetchPenaltyStatusForViewerClient(supabase, parsed.data, user.id);
    // null(접근 불가/미존재) 또는 벌칙 미션 없는 챌린지(redemption 비활성)는 404 — web page notFound() 정합.
    if (!view || !view.penaltyMission) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    return NextResponse.json(view);
  } catch (cause) {
    // 본문/토큰 미로그 — 식별자만.
    console.error("[api/penalty-status] failed", { challengeId: parsed.data, cause });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
```

- [ ] **Step 4: 테스트 실행 → 통과 확인**

Run: `pnpm --filter web test -- penalty-status/route`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/api/penalty-status/route.ts apps/web/src/app/api/penalty-status/route.spec.ts
git commit -m "feat(web/bff): GET /api/penalty-status (Bearer · penalty 창2 상태)"
```

---

# Phase C — 패리티 fixture + RN read

## Task 6: penalty fixtures + domain schema parity

**Files:**

- Create: `evals/fixtures/read-contracts/penalty-status.ts`
- Create: `evals/fixtures/read-contracts/penalty-waiting.ts`

penalty-status는 BFF 경로라 RN이 view를 조립하지 않는다 → fixture는 **transport snapshot**(domain schema parse + RN round-trip의 SoT). penalty-waiting은 RLS-direct라 RN이 조립한다 → recap 패턴(mock 테이블 → EXPECTED) fixture.

> **패리티 범위(정직하게):** penalty-status의 web 조립(`fetchPenaltyStatusForViewerClient`)은 Layer 2 helper가 `"use cache"` + `adminClient()`라 vitest 단위 스냅샷이 어렵다 → web 조립 정합은 Task 4의 동작 보존 리팩터 + integration으로 커버하고, fixture는 (a) domain schema가 view를 수용하는지 + (b) RN BFF round-trip을 강제한다. RN↔web 패리티의 본질은 **RN이 같은 web read를 BFF로 호출**한다는 by-construction이다.

- [ ] **Step 1: penalty-status fixture 작성 (transport snapshot)**

```typescript
// evals/fixtures/read-contracts/penalty-status.ts
// 보존 fixture — 벌칙 창2 상태(PenaltyStatusView) transport snapshot (spec 2026-06-29 §C2).
// penalty-status 는 BFF(admin hydrate) 경로라 RN 이 view 를 조립하지 않는다 → 이 EXPECTED 는
// domain penaltyStatusViewSchema 수용 + RN BFF round-trip(fetchPenaltyStatus mock) 의 공유 SoT.
// 시나리오: 7일·주3회 closed, 창2 open. viewer 민지(미달 3000·pending 제출), JJ(미달·pending 제출).
import type { PenaltyStatusView } from "@withkey/domain";

export const PENALTY_STATUS_VIEWER = "u-minji";
export const PENALTY_STATUS_CHALLENGE = "c1";

export const PENALTY_STATUS_EXPECTED: PenaltyStatusView = {
  challengeId: "c1",
  title: "주 3회 헬스장",
  penaltyMission: "팔굽혀펴기 20개",
  penaltyAmount: 3000,
  windowPhase: "open",
  endAt: "2026-05-08T00:00:00Z",
  isParticipant: true,
  isSigned: true,
  viewerConfirmedPenalty: 3000,
  viewerProof: {
    proofId: "p-minji",
    performerId: "u-minji",
    performerName: "민지",
    status: "pending",
    videoSignedUrl: "https://signed.example.com/p-minji",
    rejectCount: 0,
    viewerRejected: false,
    rejectedByPeers: false,
    isViewer: true,
  },
  proofs: [
    {
      proofId: "p-minji",
      performerId: "u-minji",
      performerName: "민지",
      status: "pending",
      videoSignedUrl: "https://signed.example.com/p-minji",
      rejectCount: 0,
      viewerRejected: false,
      rejectedByPeers: false,
      isViewer: true,
    },
    {
      proofId: "p-jj",
      performerId: "u-jj",
      performerName: "JJ",
      status: "pending",
      videoSignedUrl: "https://signed.example.com/p-jj",
      rejectCount: 1,
      viewerRejected: false,
      rejectedByPeers: false,
      isViewer: false,
    },
  ],
  signedParticipantCount: 3,
};
```

- [ ] **Step 2: penalty-waiting fixture 작성 (RLS-direct 조립 snapshot)**

> mock supabase 빌더는 **필터를 적용하지 않는다**(no-op). 따라서 모든 챌린지 row는 이미 `status=closed`·`penalty_mission` 충족 상태로 둔다(DB 필터 무력). 변별은 read의 **in-memory 창2 게이트 + viewer 서약 멤버십**이 한다. `challenge_participants`는 viewer(u-minji) row만 둔다(`.eq("user_id")`가 no-op이므로). NOW=2026-05-10T00:00:00Z 기준: cw1=종료+72h(창2 open·서약○), cw2=종료+12h(창 전), cw3=종료+120h(만료), cw4=종료+72h(창2 open·서약✗) → EXPECTED=[cw1].

```typescript
// evals/fixtures/read-contracts/penalty-waiting.ts
// 보존 fixture — home "만회 찬스 대기"(PenaltyWaitingView) RLS-direct 조립 snapshot (spec §C2).
// web penalty-waiting.ts(fetchPenaltyWaitingInner) 와 동일 의미 — RN fetchPenaltyWaiting 이 같은 EXPECTED.
// mock supabase 는 필터 no-op 이라 모든 challenge row 가 closed+penalty_mission. 변별은 read 의
// in-memory 창2 게이트([종료+48h,+96h]) + viewer 서약 멤버십. NOW 기준 cw1 만 통과.
export const PENALTY_WAITING_NOW = "2026-05-10T00:00:00.000Z";
export const PENALTY_WAITING_VIEWER = "u-minji";

export const PENALTY_WAITING_TABLES: Record<string, Array<Record<string, unknown>>> = {
  groups: [{ id: "g1", name: "운동 그룹", disbanded_at: null }],
  challenges: [
    // cw1 — 종료+72h(창2 open), viewer 서약 → 포함
    {
      id: "cw1",
      title: "주 3회 헬스장",
      group_id: "g1",
      penalty_amount: 3000,
      penalty_mission: "팔굽혀펴기 20개",
      status: "closed",
      end_at: "2026-05-07T00:00:00Z",
      closed_at: "2026-05-07T00:00:00Z",
    },
    // cw2 — 종료+12h(창2 전) → 제외(창)
    {
      id: "cw2",
      title: "아침 러닝",
      group_id: "g1",
      penalty_amount: 2000,
      penalty_mission: "스쿼트 30개",
      status: "closed",
      end_at: "2026-05-09T12:00:00Z",
      closed_at: "2026-05-09T12:00:00Z",
    },
    // cw3 — 종료+120h(창2 만료) → 제외(창)
    {
      id: "cw3",
      title: "주말 등산",
      group_id: "g1",
      penalty_amount: 5000,
      penalty_mission: "버피 15개",
      status: "closed",
      end_at: "2026-05-05T00:00:00Z",
      closed_at: "2026-05-05T00:00:00Z",
    },
    // cw4 — 종료+72h(창2 open) but viewer 미서약(참가 row 없음) → 제외(자격)
    {
      id: "cw4",
      title: "저녁 요가",
      group_id: "g1",
      penalty_amount: 1000,
      penalty_mission: "플랭크 1분",
      status: "closed",
      end_at: "2026-05-07T00:00:00Z",
      closed_at: "2026-05-07T00:00:00Z",
    },
  ],
  challenge_participants: [
    { challenge_id: "cw1", user_id: "u-minji", signed_at: "2026-05-01T00:00:00Z" },
    { challenge_id: "cw2", user_id: "u-minji", signed_at: "2026-05-01T00:00:00Z" },
    { challenge_id: "cw3", user_id: "u-minji", signed_at: "2026-05-01T00:00:00Z" },
  ],
};

// PenaltyWaitingView[] (@withkey/domain read-contracts).
export const PENALTY_WAITING_EXPECTED = [
  { challengeId: "cw1", title: "주 3회 헬스장", groupName: "운동 그룹", penaltyAmount: 3000 },
];
```

- [ ] **Step 3: domain schema가 status fixture를 수용하는지 테스트 추가**

`packages/domain/src/read-contracts/penalty.spec.ts`에 describe 추가:

```typescript
// penalty.spec.ts 에 추가
import { PENALTY_STATUS_EXPECTED } from "../../../../evals/fixtures/read-contracts/penalty-status";

describe("penalty-status fixture parity", () => {
  it("penaltyStatusViewSchema가 PENALTY_STATUS_EXPECTED를 round-trip", () => {
    expect(penaltyStatusViewSchema.parse(PENALTY_STATUS_EXPECTED)).toEqual(PENALTY_STATUS_EXPECTED);
  });
});
```

> 상대경로는 `packages/domain/src/read-contracts/` → repo root까지 4단계(`../../../../`)다. 어긋나면 vitest 모듈 해석 에러로 즉시 드러난다.

- [ ] **Step 4: 테스트 실행 → 통과 확인**

Run: `pnpm --filter @withkey/domain test -- penalty`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add evals/fixtures/read-contracts/penalty-status.ts evals/fixtures/read-contracts/penalty-waiting.ts packages/domain/src/read-contracts/penalty.spec.ts
git commit -m "test(domain): penalty-status/penalty-waiting 패리티 fixture + schema 수용 테스트"
```

---

## Task 7: RN penalty-reads (BFF status + RLS-direct waiting)

**Files:**

- Create: `apps/mobile/src/features/penalty/api/penalty-reads.ts`
- Create: `apps/mobile/src/features/penalty/api/penalty-reads.spec.ts`

`fetchPenaltyStatus(challengeId)` = BFF `GET /api/penalty-status` + zod parse(404→null). `fetchPenaltyWaiting(viewerId, {now?})` = web `penalty-waiting.ts` 미러(RLS-direct + in-memory 창2 게이트).

- [ ] **Step 1: 실패 테스트 작성**

```tsx
// apps/mobile/src/features/penalty/api/penalty-reads.spec.ts
const mockBffGetJson = jest.fn();
const mockGetSupabaseClient = jest.fn();

jest.mock("@/services/api/bff-client", () => {
  class BffRequestError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  }
  return { bffGetJson: (...a: unknown[]) => mockBffGetJson(...a), BffRequestError };
});
jest.mock("@/services/supabase/client", () => ({
  getSupabaseClient: () => mockGetSupabaseClient(),
}));

// eslint-disable-next-line import/first
import { BffRequestError } from "@/services/api/bff-client";
// eslint-disable-next-line import/first
import { makeMockSupabase, type MockTables } from "@/shared/testing/mock-supabase";
// eslint-disable-next-line import/first
import {
  PENALTY_STATUS_EXPECTED,
  PENALTY_STATUS_CHALLENGE,
} from "../../../../../../evals/fixtures/read-contracts/penalty-status";
// eslint-disable-next-line import/first
import {
  PENALTY_WAITING_NOW,
  PENALTY_WAITING_TABLES,
  PENALTY_WAITING_VIEWER,
  PENALTY_WAITING_EXPECTED,
} from "../../../../../../evals/fixtures/read-contracts/penalty-waiting";
// eslint-disable-next-line import/first
import { fetchPenaltyStatus, fetchPenaltyWaiting } from "./penalty-reads";

beforeEach(() => jest.clearAllMocks());

describe("fetchPenaltyStatus (BFF)", () => {
  it("BFF 응답을 zod parse 해 PenaltyStatusView 반환", async () => {
    mockBffGetJson.mockResolvedValue(PENALTY_STATUS_EXPECTED);
    const view = await fetchPenaltyStatus(PENALTY_STATUS_CHALLENGE);
    expect(view).toEqual(PENALTY_STATUS_EXPECTED);
    expect(mockBffGetJson).toHaveBeenCalledWith(
      `/api/penalty-status?challengeId=${PENALTY_STATUS_CHALLENGE}`,
    );
  });

  it("404(벌칙 미션 없음/접근 불가)는 null", async () => {
    mockBffGetJson.mockRejectedValue(new BffRequestError(404, "not found"));
    expect(await fetchPenaltyStatus("c-x")).toBeNull();
  });

  it("404 외 에러는 throw", async () => {
    mockBffGetJson.mockRejectedValue(new BffRequestError(500, "boom"));
    await expect(fetchPenaltyStatus("c-x")).rejects.toBeInstanceOf(BffRequestError);
  });
});

describe("fetchPenaltyWaiting (RLS-direct, web penalty-waiting 미러)", () => {
  it("창2 open + viewer 서약 챌린지만 (== PENALTY_WAITING_EXPECTED)", async () => {
    mockGetSupabaseClient.mockReturnValue(makeMockSupabase(PENALTY_WAITING_TABLES as MockTables));
    const view = await fetchPenaltyWaiting(PENALTY_WAITING_VIEWER, {
      now: new Date(PENALTY_WAITING_NOW),
    });
    expect(view).toEqual(PENALTY_WAITING_EXPECTED);
  });
});
```

> 상대경로는 `apps/mobile/src/features/penalty/api/` → repo root까지 6단계(`../../../../../../`)다 — recap-reads.spec.ts(api/ 디렉토리)와 동일 깊이.

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `pnpm --filter @withkey/mobile test -- penalty-reads`
Expected: FAIL — `./penalty-reads` 없음.

- [ ] **Step 3: penalty-reads.ts 작성**

```typescript
// apps/mobile/src/features/penalty/api/penalty-reads.ts
// 벌칙 창2 read service (spec 2026-06-29 §C2 · ADR-0036/0037).
// - fetchPenaltyStatus: admin hydrate read 라 BFF `GET /api/penalty-status`(Bearer) 단일 endpoint.
// - fetchPenaltyWaiting: 순수 RLS read(home 진입로)라 supabase 직접 (web penalty-waiting.ts 미러).
import {
  penaltyStatusViewSchema,
  type PenaltyStatusView,
  type PenaltyWaitingView,
} from "@withkey/domain";

import { bffGetJson, BffRequestError } from "@/services/api/bff-client";
import { getSupabaseClient } from "@/services/supabase/client";

// 창2 = [종료+48h, 종료+96h] (web penalty-status.ts·penalty-waiting.ts 상수 정합).
const WINDOW_OPEN_MS = 48 * 60 * 60 * 1000;
const WINDOW_CLOSE_MS = 96 * 60 * 60 * 1000;

/** 벌칙 창2 상태 — BFF(Bearer + admin hydrate). 404(벌칙 미션 없음/접근 불가)는 null. 계약 위반은 throw. */
export async function fetchPenaltyStatus(challengeId: string): Promise<PenaltyStatusView | null> {
  try {
    const json = await bffGetJson(
      `/api/penalty-status?challengeId=${encodeURIComponent(challengeId)}`,
    );
    return penaltyStatusViewSchema.parse(json);
  } catch (err) {
    if (err instanceof BffRequestError && err.status === 404) return null;
    throw err;
  }
}

type WaitingChallengeRow = {
  id: string;
  title: string;
  group_id: string;
  penalty_amount: number;
  penalty_mission: string | null;
  end_at: string | null;
  closed_at: string | null;
};

/** home "만회 찬스 대기" — 순수 RLS 직접 read(admin hydrate 아님). web fetchPenaltyWaitingInner 미러. */
export async function fetchPenaltyWaiting(
  viewerId: string,
  options: { now?: Date } = {},
): Promise<PenaltyWaitingView[]> {
  const supabase = getSupabaseClient();
  const now = (options.now ?? new Date()).getTime();

  // RLS(groups_select_member)가 viewer 그룹만 통과.
  const { data: groups } = await supabase
    .from("groups")
    .select("id, name")
    .is("disbanded_at", null);
  if (!groups || groups.length === 0) return [];
  const nameByGroup = new Map<string, string | null>(
    groups.map((g) => [g.id as string, (g.name as string | null) ?? null]),
  );

  // closed + penalty_mission 있는 챌린지(RLS: 그룹 멤버만). 창2 게이트는 메모리.
  const { data: challenges } = await supabase
    .from("challenges")
    .select("id, title, group_id, penalty_amount, penalty_mission, end_at, closed_at")
    .in("group_id", [...nameByGroup.keys()])
    .eq("status", "closed")
    .not("penalty_mission", "is", null);
  if (!challenges || challenges.length === 0) return [];

  const open = (challenges as unknown as WaitingChallengeRow[]).filter((c) => {
    const endAt = c.closed_at ?? c.end_at;
    if (!endAt) return false;
    const end = new Date(endAt).getTime();
    return now >= end + WINDOW_OPEN_MS && now <= end + WINDOW_CLOSE_MS;
  });
  if (open.length === 0) return [];

  // viewer 가 서약 참가자인 챌린지만.
  const { data: parts } = await supabase
    .from("challenge_participants")
    .select("challenge_id")
    .eq("user_id", viewerId)
    .not("signed_at", "is", null)
    .in(
      "challenge_id",
      open.map((c) => c.id),
    );
  const mySignedIds = new Set((parts ?? []).map((p) => p.challenge_id as string));

  return open
    .filter((c) => mySignedIds.has(c.id))
    .map((c) => ({
      challengeId: c.id,
      title: c.title,
      groupName: nameByGroup.get(c.group_id) ?? null,
      penaltyAmount: c.penalty_amount,
    }));
}
```

- [ ] **Step 4: 테스트 실행 → 통과 확인**

Run: `pnpm --filter @withkey/mobile test -- penalty-reads`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/features/penalty/api/penalty-reads.ts apps/mobile/src/features/penalty/api/penalty-reads.spec.ts
git commit -m "feat(mobile/penalty): penalty-reads — BFF status read + RLS-direct waiting read"
```

---

# Phase D — web 제출 코어 + BFF write

## Task 8: submitPenaltyProofCore 추출 + web action 위임

**Files:**

- Create: `apps/web/src/lib/penalty/submit-proof-core.ts`
- Modify: `apps/web/src/app/(app)/challenge/[id]/penalty/_actions.ts`

`submitActionLogCore` 패턴 미러 — client·user 주입형 코어로 증명 제출 로직(업로드 + RPC + `revalidatePath`)을 추출한다. `updateTag`(Server Action 전용)/`revalidateTag`(Route Handler)는 caller가 분기. 코어는 `mediaPath`를 반환해 caller가 video tag를 무효화한다.

- [ ] **Step 1: 코어 작성**

```typescript
// apps/web/src/lib/penalty/submit-proof-core.ts
// submitPenaltyProof 공유 코어 (spec 2026-06-29 §C2). submitActionLogCore 패턴 동일 —
// web Server Action(submitPenaltyProof)과 BFF route(POST /api/penalty-proof)가 같은 본문을 호출하는 SoT.
// caller 책임: client 생성·인증, 그리고 캐시 tail(updateTag/revalidateTag — mediaPath 반환으로 위임).
// 코어 책임: 영상 업로드(action-videos) + submit_penalty_proof RPC + revalidatePath(양 컨텍스트 가능).
import "server-only";
import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { penaltyProofSubmitInputSchema, type PenaltyProofStatus } from "@withkey/domain";
import { success, failure, validationFailure, type ActionResult } from "@/lib/actions/response";
import { mapSupabaseError } from "@/lib/actions/supabase-error";
import { uploadVideo } from "@/lib/storage/action-videos";

// action-videos 경로 3번째 세그먼트 — 벌칙 증명은 actionLogId 가 없으므로 합성 라벨.
// {userId}/{challengeId}/penalty-{nonce}.{ext} 는 submit_penalty_proof RPC 의 split_part 검증과 정합.
const PENALTY_VIDEO_LABEL = "penalty";

// status 는 write-contract penaltyProofSubmitResultSchema(enum)와 정합하도록 enum 으로 좁힌다.
export type SubmitPenaltyProofCoreResult = {
  proofId: string;
  status: PenaltyProofStatus;
  mediaPath: string;
};

export async function submitPenaltyProofCore(
  supabase: SupabaseClient,
  user: { id: string },
  formData: FormData,
): Promise<ActionResult<SubmitPenaltyProofCoreResult>> {
  const challengeId = String(formData.get("challengeId") ?? "");
  const maybeFile = formData.get("video");
  const file = maybeFile instanceof File && maybeFile.size > 0 ? maybeFile : null;
  if (!file) return failure("invalid_input", { video: ["required"] });

  // challengeId 경계 검증을 업로드보다 먼저(buildVideoPath SEGMENT_RE throw 방어).
  const idCheck = penaltyProofSubmitInputSchema.shape.challengeId.safeParse(challengeId);
  if (!idCheck.success) return failure("invalid_input", { challengeId: ["invalid"] });

  // action-videos 업로드 — MIME/크기 검증은 uploadVideo. actionLogId 자리에 합성 라벨.
  const upload = await uploadVideo({
    userId: user.id,
    challengeId: idCheck.data,
    actionLogId: PENALTY_VIDEO_LABEL,
    file,
    client: supabase,
  });
  if (!upload.ok) {
    return failure(upload.reason === "upload_failed" ? "upstream_error" : "invalid_input", {
      video: [upload.reason],
    });
  }

  const parsed = penaltyProofSubmitInputSchema.safeParse({
    challengeId: idCheck.data,
    mediaPath: upload.path,
  });
  if (!parsed.success) return validationFailure(parsed.error);

  const { data, error } = await supabase.rpc("submit_penalty_proof", {
    p_challenge_id: parsed.data.challengeId,
    p_media_path: parsed.data.mediaPath,
  });
  if (error) return failure(mapSupabaseError(error));
  const row = data?.[0];
  if (!row?.proof_id) return failure("upstream_error");

  // page revalidate 는 양 컨텍스트 가능 → 코어. video signed URL tag 무효화는 caller(mediaPath 반환).
  revalidatePath(`/challenge/${parsed.data.challengeId}/penalty`);
  return success({
    proofId: row.proof_id as string,
    // RPC 는 submit 시 항상 'pending' 반환 — write-contract enum 으로 좁힌다(예상 밖이면 RN parse 가 거른다).
    status: row.status as PenaltyProofStatus,
    mediaPath: parsed.data.mediaPath,
  });
}
```

- [ ] **Step 2: web action을 코어 위임으로 교체**

`apps/web/src/app/(app)/challenge/[id]/penalty/_actions.ts`에서 `submitPenaltyProof`를 코어 위임으로 바꾸고, 코어로 옮긴 import/상수를 정리한다.

(a) import 교체 — `uploadVideo` import를 코어 import로:

old:

```typescript
import { uploadVideo } from "@/lib/storage/action-videos";
```

new:

```typescript
import { submitPenaltyProofCore } from "@/lib/penalty/submit-proof-core";
```

(b) `PENALTY_VIDEO_LABEL` 상수 + 기존 `submitPenaltyProof` 본문 교체.

old (상수 + `submitPenaltyProof` 전체):

```typescript
// action-videos 경로의 3번째 세그먼트 — 벌칙 증명은 actionLogId 가 없으므로 합성 라벨을 쓴다.
// 결과 경로 {userId}/{challengeId}/penalty-{nonce}.{ext} 는 submit_penalty_proof RPC 의
// split_part 검증(seg1=userId, seg2=challengeId)·looksLikeVideoPath·storage RLS(av_insert_self) 모두 통과.
const PENALTY_VIDEO_LABEL = "penalty";

type SubmitResult = { proofId: string; status: string };

// 증명 제출: 영상 업로드 → submit_penalty_proof RPC(창2 시간창·자격 검증은 RPC 가 강제).
// FormData(challengeId + 영상 파일)를 받는다 — mediaPath 는 서버가 업로드 후 생성(클라 위조 방지).
export const submitPenaltyProof = withUser<FormData, SubmitResult>(
  async (user, formData): Promise<ActionResult<SubmitResult>> => {
    const challengeId = String(formData.get("challengeId") ?? "");
    const maybeFile = formData.get("video");
    const file = maybeFile instanceof File && maybeFile.size > 0 ? maybeFile : null;
    if (!file) return failure("invalid_input", { video: ["required"] });

    // 입력 경계 검증을 업로드보다 먼저 — challengeId 가 uuid 가 아니면 buildVideoPath 가 세그먼트
    // 검증(SEGMENT_RE)에서 throw 한다(uncaught → withUser 가 ActionResult shape 대신 오류 응답).
    // zod 로 먼저 막아 서버 경계 방어 + 일관된 실패 shape 를 보존한다.
    const idCheck = penaltyProofSubmitInputSchema.shape.challengeId.safeParse(challengeId);
    if (!idCheck.success) return failure("invalid_input", { challengeId: ["invalid"] });

    const supabase = await createClient();

    // action-videos 업로드 — MIME/크기 검증은 uploadVideo 가 담당. actionLogId 자리에 합성 라벨.
    const upload = await uploadVideo({
      userId: user.id,
      challengeId: idCheck.data,
      actionLogId: PENALTY_VIDEO_LABEL,
      file,
      client: supabase,
    });
    if (!upload.ok) {
      return failure(upload.reason === "upload_failed" ? "upstream_error" : "invalid_input", {
        video: [upload.reason],
      });
    }

    // 입력 계약(@withkey/domain zod) 검증 — challengeId uuid · mediaPath 길이.
    const parsed = penaltyProofSubmitInputSchema.safeParse({
      challengeId: idCheck.data,
      mediaPath: upload.path,
    });
    if (!parsed.success) return validationFailure(parsed.error);

    const { data, error } = await supabase.rpc("submit_penalty_proof", {
      p_challenge_id: parsed.data.challengeId,
      p_media_path: parsed.data.mediaPath,
    });
    if (error) return failure(mapSupabaseError(error));
    const row = data?.[0];
    if (!row?.proof_id) return failure("upstream_error");

    // read-your-writes: viewer proof·video signed URL 즉시 fresh. page 는 path revalidate.
    revalidatePath(`/challenge/${parsed.data.challengeId}/penalty`);
    updateTag(`penalty-video-${parsed.data.mediaPath}`);

    return success({ proofId: row.proof_id as string, status: String(row.status) });
  },
);
```

new (코어 위임 — `revalidatePath`는 코어, `updateTag`는 여기):

```typescript
type SubmitResult = { proofId: string; status: string };

// 증명 제출: 공유 코어(submitPenaltyProofCore) 위임 — web↔RN(BFF) 패리티 by construction.
// 코어가 영상 업로드 + RPC + revalidatePath 를 수행. video signed URL tag 무효화(updateTag,
// Server Action 전용)만 web wrapper 책임 — 코어가 mediaPath 를 반환해 위임.
export const submitPenaltyProof = withUser<FormData, SubmitResult>(
  async (user, formData): Promise<ActionResult<SubmitResult>> => {
    const supabase = await createClient();
    const result = await submitPenaltyProofCore(supabase, user, formData);
    if (!result.ok) return result;
    updateTag(`penalty-video-${result.data.mediaPath}`);
    return success({ proofId: result.data.proofId, status: result.data.status });
  },
);
```

> 이 교체로 `_actions.ts`에서 `validationFailure`·`penaltyProofSubmitInputSchema`가 `submitPenaltyProof`에서는 안 쓰일 수 있으나, `togglePenaltyProofRejection`이 여전히 쓰므로(또는 미사용 import) **typecheck/lint 결과를 보고 미사용 import만 제거**한다(예: `validationFailure`가 toggle에도 쓰임 — 유지). `mapSupabaseError`·`failure`·`success`는 toggle이 계속 쓴다.

- [ ] **Step 3: typecheck + lint (미사용 import 정리)**

Run: `pnpm --filter web exec tsc --noEmit`
Expected: PASS

Run: `pnpm --filter web lint`
Expected: PASS — 미사용 import가 잡히면 그 import만 제거(예: `penaltyProofSubmitInputSchema`가 toggle에서 미사용이면 제거). `validationFailure`는 toggle이 사용하므로 유지.

- [ ] **Step 4: 기존 web penalty action 테스트 비파괴**

Run: `pnpm --filter web test -- penalty`
Expected: PASS (있으면). 없으면 typecheck로 갈음 — 코어 위임은 동작 보존.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/penalty/submit-proof-core.ts "apps/web/src/app/(app)/challenge/[id]/penalty/_actions.ts"
git commit -m "refactor(web/penalty): submitPenaltyProofCore 추출 (BFF 공유 코어)"
```

---

## Task 9: BFF POST /api/penalty-proof route

**Files:**

- Create: `apps/web/src/app/api/penalty-proof/route.ts`
- Create: `apps/web/src/app/api/penalty-proof/route.spec.ts`

action-log BFF route 미러. Bearer → `request.formData()` → `submitPenaltyProofCore` → 봉투 passthrough + 파생 status. 성공 시 `revalidateTag(penalty-video-${mediaPath}, "max")`(Route Handler는 `updateTag` 금지).

- [ ] **Step 1: 실패 테스트 작성**

```typescript
// apps/web/src/app/api/penalty-proof/route.spec.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetUser = vi.fn();
const mockCore = vi.fn();
const mockRevalidateTag = vi.fn();

vi.mock("@/lib/supabase/bearer", () => ({
  bearerTokenFrom: (req: Request) => {
    const h = req.headers.get("authorization");
    if (!h) return null;
    const [s, t] = h.split(" ");
    return s?.toLowerCase() === "bearer" && t ? t : null;
  },
  createBearerClient: () => ({ auth: { getUser: mockGetUser } }),
}));
vi.mock("@/lib/penalty/submit-proof-core", () => ({
  submitPenaltyProofCore: (...a: unknown[]) => mockCore(...a),
}));
vi.mock("next/cache", () => ({ revalidateTag: (...a: unknown[]) => mockRevalidateTag(...a) }));

// eslint-disable-next-line import/first
import { POST } from "./route";

function postReq(token: string | null): Request {
  const fd = new FormData();
  fd.append("challengeId", "11111111-1111-1111-1111-111111111111");
  fd.append(
    "video",
    new File([new Uint8Array([1, 2, 3])], "penalty.mov", { type: "video/quicktime" }),
  );
  return new Request("https://x.test/api/penalty-proof", {
    method: "POST",
    headers: token ? { authorization: `Bearer ${token}` } : {},
    body: fd,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetUser.mockResolvedValue({ data: { user: { id: "u-minji" } }, error: null });
});

describe("POST /api/penalty-proof", () => {
  it("토큰 없으면 401 봉투", async () => {
    const res = await POST(postReq(null));
    expect(res.status).toBe(401);
    expect((await res.json()).ok).toBe(false);
  });

  it("성공 봉투 passthrough(200) + video tag revalidate", async () => {
    mockCore.mockResolvedValue({
      ok: true,
      data: { proofId: "p1", status: "pending", mediaPath: "u-minji/c1/penalty-abc.mov" },
    });
    const res = await POST(postReq("tok"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.data.proofId).toBe("p1");
    expect(mockRevalidateTag).toHaveBeenCalledWith(
      "penalty-video-u-minji/c1/penalty-abc.mov",
      "max",
    );
  });

  it("forbidden 실패 봉투는 403", async () => {
    mockCore.mockResolvedValue({ ok: false, error: "forbidden" });
    const res = await POST(postReq("tok"));
    expect(res.status).toBe(403);
    expect(mockRevalidateTag).not.toHaveBeenCalled();
  });

  it("코어 throw는 502 봉투", async () => {
    mockCore.mockRejectedValue(new Error("boom"));
    const res = await POST(postReq("tok"));
    expect(res.status).toBe(502);
    expect((await res.json()).error).toBe("upstream_error");
  });
});
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `pnpm --filter web test -- penalty-proof/route`
Expected: FAIL — `./route` 없음.

- [ ] **Step 3: route.ts 작성**

```typescript
// apps/web/src/app/api/penalty-proof/route.ts
// RN BFF — 벌칙 증명 영상 제출 단일 endpoint (spec 2026-06-29 §C2 · ADR-0036 §1 · action-log 선례).
// `POST /api/penalty-proof` + `Authorization: Bearer <token>` + multipart/form-data(challengeId + video)
// → ActionResult<{proofId,status}> 봉투 passthrough + 파생 HTTP status.
// web action 과 같은 submitPenaltyProofCore 를 호출해 web↔RN 패리티를 by construction 으로 보장한다.
import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import type { ErrorCode } from "@/lib/actions/response";
import { bearerTokenFrom, createBearerClient } from "@/lib/supabase/bearer";
import { submitPenaltyProofCore } from "@/lib/penalty/submit-proof-core";

function statusFor(error: ErrorCode): number {
  switch (error) {
    case "unauthorized":
      return 401;
    case "forbidden":
      return 403;
    case "invalid_input":
      return 422;
    case "not_found":
      return 404;
    case "conflict":
      return 409;
    case "rate_limited":
      return 429;
    case "upstream_error":
      return 502;
  }
}

export async function POST(request: Request) {
  const token = bearerTokenFrom(request);
  if (!token) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const supabase = createBearerClient(token);
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token);
  if (error || !user) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let result: Awaited<ReturnType<typeof submitPenaltyProofCore>>;
  try {
    result = await submitPenaltyProofCore(supabase, user, await request.formData());
  } catch (cause) {
    // 잘못된 multipart·코어 throw — 봉투 계약을 지켜 upstream_error. 본문/토큰 미로그.
    console.error("[api/penalty-proof] failed", { cause });
    return NextResponse.json({ ok: false, error: "upstream_error" }, { status: 502 });
  }

  // updateTag 는 Route Handler 금지 → 동일 무효화를 revalidateTag 로(action-log 선례).
  if (result.ok) {
    revalidateTag(`penalty-video-${result.data.mediaPath}`, "max");
  }

  // 성공 봉투의 data.mediaPath 는 RN penaltyProofSubmitResponseSchema 가 strip 한다(내부값).
  return NextResponse.json(result, { status: result.ok ? 200 : statusFor(result.error) });
}
```

- [ ] **Step 4: 테스트 실행 → 통과 확인**

Run: `pnpm --filter web test -- penalty-proof/route`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/api/penalty-proof/route.ts apps/web/src/app/api/penalty-proof/route.spec.ts
git commit -m "feat(web/bff): POST /api/penalty-proof (Bearer multipart · 증명 제출)"
```

---

# Phase E — RN mutations

## Task 10: RN penalty mutations (BFF 제출 + RPC 토글)

**Files:**

- Create: `apps/mobile/src/features/penalty/api/submit-penalty-proof.ts`
- Create: `apps/mobile/src/features/penalty/api/toggle-penalty-rejection.ts`
- Create: `apps/mobile/src/features/penalty/api/penalty-mutations.spec.ts`

제출 = `bffPostFormData("/api/penalty-proof")` + 응답 zod parse(submit-action-log 선례). 토글 = `supabase.rpc("toggle_penalty_proof_rejection")` 직접 + snake→camel 매핑 + zod parse(challenge-lifecycle 선례).

- [ ] **Step 1: 실패 테스트 작성**

```tsx
// apps/mobile/src/features/penalty/api/penalty-mutations.spec.ts
const mockBffPostFormData = jest.fn();
const mockRpc = jest.fn();

jest.mock("@/services/api/bff-client", () => ({
  bffPostFormData: (...a: unknown[]) => mockBffPostFormData(...a),
}));
jest.mock("@/services/supabase/client", () => ({
  getSupabaseClient: () => ({ rpc: (...a: unknown[]) => mockRpc(...a) }),
}));

// eslint-disable-next-line import/first
import { submitPenaltyProof } from "./submit-penalty-proof";
// eslint-disable-next-line import/first
import { togglePenaltyProofRejection } from "./toggle-penalty-rejection";

const CID = "11111111-1111-1111-1111-111111111111";
const PID = "22222222-2222-2222-2222-222222222222";

beforeEach(() => jest.clearAllMocks());

describe("submitPenaltyProof (BFF multipart)", () => {
  it("FormData(challengeId+video) POST 후 응답 parse", async () => {
    mockBffPostFormData.mockResolvedValue({ ok: true, data: { proofId: "p1", status: "pending" } });
    const res = await submitPenaltyProof({
      challengeId: CID,
      video: { uri: "file:///v.mov", name: "penalty.mov", type: "video/quicktime" },
    });
    expect(res.ok).toBe(true);
    expect(mockBffPostFormData).toHaveBeenCalledWith("/api/penalty-proof", expect.any(FormData));
  });

  it("실패 봉투도 parse(.ok=false)", async () => {
    mockBffPostFormData.mockResolvedValue({ ok: false, error: "forbidden" });
    const res = await submitPenaltyProof({
      challengeId: CID,
      video: { uri: "file:///v.mov", name: "penalty.mov", type: "video/quicktime" },
    });
    expect(res.ok).toBe(false);
  });
});

describe("togglePenaltyProofRejection (RPC 직접)", () => {
  it("snake_case RPC 반환을 camelCase로 parse", async () => {
    mockRpc.mockResolvedValue({
      data: [{ reject_count: 2, viewer_rejected: true, status: "rejected" }],
      error: null,
    });
    const res = await togglePenaltyProofRejection(PID);
    expect(res).toEqual({
      ok: true,
      data: { rejectCount: 2, viewerRejected: true, status: "rejected" },
    });
    expect(mockRpc).toHaveBeenCalledWith("toggle_penalty_proof_rejection", { p_proof_id: PID });
  });

  it("RLS 거부(42501)는 forbidden", async () => {
    mockRpc.mockResolvedValue({ data: null, error: { code: "42501" } });
    expect(await togglePenaltyProofRejection(PID)).toEqual({ ok: false, error: "forbidden" });
  });

  it("uuid 아니면 invalid_input(RPC 미호출)", async () => {
    expect(await togglePenaltyProofRejection("nope")).toEqual({
      ok: false,
      error: "invalid_input",
    });
    expect(mockRpc).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `pnpm --filter @withkey/mobile test -- penalty-mutations`
Expected: FAIL — 모듈 없음.

- [ ] **Step 3: submit-penalty-proof.ts 작성**

```typescript
// apps/mobile/src/features/penalty/api/submit-penalty-proof.ts
// 벌칙 증명 제출 — BFF `POST /api/penalty-proof`(Bearer multipart). submit-action-log 선례.
// 영상 캡처·압축은 호출 전(컴포넌트)에서. 서버(uploadVideo)가 MIME/크기 상한을 최종 강제.
import { penaltyProofSubmitResponseSchema, type PenaltyProofSubmitResponse } from "@withkey/domain";

import { bffPostFormData } from "@/services/api/bff-client";

// RN FormData 파일 파트 — { uri, name, type } 객체(web File 미지원, RN 관례). type 은 asset.mimeType
// (iOS=video/quicktime, Android=video/mp4) — 0059 허용목록과 정합.
export type PenaltyVideoPart = { uri: string; name: string; type: string };

export async function submitPenaltyProof(input: {
  challengeId: string;
  video: PenaltyVideoPart;
}): Promise<PenaltyProofSubmitResponse> {
  const fd = new FormData();
  fd.append("challengeId", input.challengeId);
  // RN FormData 는 { uri, name, type } 객체를 파일 파트로 받는다(web File 미지원).
  fd.append("video", input.video as unknown as Blob);

  const body = await bffPostFormData("/api/penalty-proof", fd);
  // 계약 위반(필드 누락·error 코드 밖)은 즉시 throw — 깨진 응답이 UI .ok 분기에 닿지 않는다.
  return penaltyProofSubmitResponseSchema.parse(body);
}
```

- [ ] **Step 4: toggle-penalty-rejection.ts 작성**

```typescript
// apps/mobile/src/features/penalty/api/toggle-penalty-rejection.ts
// 벌칙 증명 동료 판정 토글 — supabase.rpc("toggle_penalty_proof_rejection") 직접 (파일 없음 → BFF 불요).
// SECURITY DEFINER RPC 가 시간창·본인거부·과반전이·익명성을 한 트랜잭션으로 강제. challenge-lifecycle 선례.
// RPC 반환은 snake_case → domain penaltyProofRejectionToggleResultSchema(camelCase)로 매핑 후 parse.
import {
  penaltyProofRejectionInputSchema,
  penaltyProofRejectionToggleResultSchema,
  type PenaltyProofRejectionToggleResult,
} from "@withkey/domain";

import { getSupabaseClient } from "@/services/supabase/client";

export type ToggleRejectionErrorCode =
  | "invalid_input"
  | "forbidden" // 42501 — RLS/RPC 시간창·자격·본인거부
  | "not_found" // P0002/PGRST116
  | "mutation_failed";

export type ToggleRejectionResult =
  | { ok: true; data: PenaltyProofRejectionToggleResult }
  | { ok: false; error: ToggleRejectionErrorCode };

// web mapSupabaseError / mobile challenge-lifecycle mapPgError 와 동일 의미 매핑.
function mapPgError(code: string | null | undefined): ToggleRejectionErrorCode {
  switch (code) {
    case "42501":
      return "forbidden";
    case "P0002":
    case "PGRST116":
      return "not_found";
    case "23502":
    case "23503":
    case "23514":
      return "invalid_input";
    default:
      return "mutation_failed";
  }
}

export async function togglePenaltyProofRejection(proofId: string): Promise<ToggleRejectionResult> {
  if (!penaltyProofRejectionInputSchema.safeParse({ proofId }).success) {
    return { ok: false, error: "invalid_input" };
  }

  const supabase = getSupabaseClient();
  const { data, error } = await supabase.rpc("toggle_penalty_proof_rejection", {
    p_proof_id: proofId,
  });
  if (error) {
    console.error("[togglePenaltyProofRejection] rpc failed", error.code);
    return { ok: false, error: mapPgError(error.code) };
  }

  const row = (
    data as unknown as { reject_count: number; viewer_rejected: boolean; status: string }[] | null
  )?.[0];
  if (!row) return { ok: false, error: "not_found" };

  // snake_case → camelCase 매핑 후 domain zod 검증(예상 밖 status·shape 면 mutation_failed).
  const parsed = penaltyProofRejectionToggleResultSchema.safeParse({
    rejectCount: row.reject_count,
    viewerRejected: row.viewer_rejected,
    status: row.status,
  });
  if (!parsed.success) return { ok: false, error: "mutation_failed" };

  return { ok: true, data: parsed.data };
}
```

- [ ] **Step 5: 테스트 실행 → 통과 확인**

Run: `pnpm --filter @withkey/mobile test -- penalty-mutations`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/features/penalty/api/submit-penalty-proof.ts apps/mobile/src/features/penalty/api/toggle-penalty-rejection.ts apps/mobile/src/features/penalty/api/penalty-mutations.spec.ts
git commit -m "feat(mobile/penalty): 증명 제출(BFF multipart) + 동료 판정 토글(RPC 직접) mutation"
```

---

# Phase F — RN 화면 + 컴포넌트 + home 진입

## Task 11: RN penalty 컴포넌트 (proof-form · proof-card · judge-buttons)

**Files:**

- Create: `apps/mobile/src/features/penalty/components/penalty-judge-buttons.tsx`
- Create: `apps/mobile/src/features/penalty/components/penalty-proof-card.tsx`
- Create: `apps/mobile/src/features/penalty/components/penalty-proof-form.tsx`
- Create: `apps/mobile/src/features/penalty/components/penalty-components.spec.tsx`

web `_components/*` 미러. 마이크로카피·상태 라벨은 web과 동일. 영상 캡처는 `expo-image-picker` 카메라(영상), 영상 재생은 `Linking.openURL`(인라인 player 없음).

- [ ] **Step 1: 실패 테스트 작성**

```tsx
// apps/mobile/src/features/penalty/components/penalty-components.spec.tsx
import { render, screen, fireEvent } from "@testing-library/react-native";

const mockToggle = jest.fn();
const mockSubmit = jest.fn();
const mockOpenURL = jest.fn();
const mockLaunchCamera = jest.fn();

jest.mock("../api/toggle-penalty-rejection", () => ({
  togglePenaltyProofRejection: (...a: unknown[]) => mockToggle(...a),
}));
jest.mock("../api/submit-penalty-proof", () => ({
  submitPenaltyProof: (...a: unknown[]) => mockSubmit(...a),
}));
jest.mock("expo-linking", () => ({ openURL: (...a: unknown[]) => mockOpenURL(...a) }));
jest.mock("expo-image-picker", () => ({
  launchCameraAsync: (...a: unknown[]) => mockLaunchCamera(...a),
}));

// eslint-disable-next-line import/first
import { PenaltyJudgeButtons } from "./penalty-judge-buttons";
// eslint-disable-next-line import/first
import { PenaltyProofCard } from "./penalty-proof-card";
// eslint-disable-next-line import/first
import { PenaltyProofForm } from "./penalty-proof-form";

const PROOF_BASE = {
  proofId: "p-jj",
  performerId: "u-jj",
  performerName: "JJ",
  status: "pending" as const,
  videoSignedUrl: "https://signed.example.com/p-jj",
  rejectCount: 1,
  viewerRejected: false,
  rejectedByPeers: false,
  isViewer: false,
};

beforeEach(() => jest.clearAllMocks());

describe("PenaltyJudgeButtons", () => {
  it("인정/반려 + 반려 카운트 렌더", () => {
    render(<PenaltyJudgeButtons proofId="p-jj" rejectCount={1} viewerRejected={false} />);
    expect(screen.getByText("인정")).toBeTruthy();
    expect(screen.getByText("반려")).toBeTruthy();
    expect(screen.getByText(/현재 반려 1명/)).toBeTruthy();
  });

  it("반려 탭 → togglePenaltyProofRejection 호출", () => {
    mockToggle.mockResolvedValue({
      ok: true,
      data: { rejectCount: 2, viewerRejected: true, status: "pending" },
    });
    render(<PenaltyJudgeButtons proofId="p-jj" rejectCount={1} viewerRejected={false} />);
    fireEvent.press(screen.getByText("반려"));
    expect(mockToggle).toHaveBeenCalledWith("p-jj");
  });
});

describe("PenaltyProofCard", () => {
  it("status 라벨 + 영상 보기 버튼(openURL)", () => {
    render(<PenaltyProofCard proof={PROOF_BASE} canJudge={false} />);
    expect(screen.getByText("판정 대기")).toBeTruthy();
    // 컴포넌트 렌더 텍스트는 "▶ 영상 보기" — RNTL getByText 는 기본 exact:true.
    fireEvent.press(screen.getByText("▶ 영상 보기"));
    expect(mockOpenURL).toHaveBeenCalledWith("https://signed.example.com/p-jj");
  });

  it("canJudge + pending + 본인 아님 → 판정 토글 노출", () => {
    render(<PenaltyProofCard proof={PROOF_BASE} canJudge />);
    expect(screen.getByText("인정")).toBeTruthy();
  });

  it("rejected status 라벨 = '반려 · 2배 이월'", () => {
    render(<PenaltyProofCard proof={{ ...PROOF_BASE, status: "rejected" }} canJudge={false} />);
    expect(screen.getByText("반려 · 2배 이월")).toBeTruthy();
  });
});

describe("PenaltyProofForm", () => {
  it("idle 안내 카피 렌더", () => {
    render(<PenaltyProofForm challengeId="c1" />);
    expect(screen.getByText("앱 카메라로 바로 찍어요")).toBeTruthy();
    expect(screen.getByText("미리 찍어둔 영상은 올릴 수 없어요")).toBeTruthy();
  });

  it("녹화 버튼 탭 → launchCameraAsync(videos)", async () => {
    mockLaunchCamera.mockResolvedValue({ canceled: true });
    render(<PenaltyProofForm challengeId="c1" />);
    fireEvent.press(screen.getByText("미션 영상 녹화"));
    expect(mockLaunchCamera).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `pnpm --filter @withkey/mobile test -- penalty-components`
Expected: FAIL — 컴포넌트 없음.

- [ ] **Step 3: penalty-judge-buttons.tsx 작성**

```tsx
// apps/mobile/src/features/penalty/components/penalty-judge-buttons.tsx
// 동료 판정 토글 — web penalty-judge-buttons.tsx 미러. 기본=인정, 반려 토글 1탭, 익명 카운트.
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { colors } from "@/shared/theme/colors";

import { togglePenaltyProofRejection } from "../api/toggle-penalty-rejection";

interface Props {
  proofId: string;
  rejectCount: number;
  viewerRejected: boolean;
  disabled?: boolean;
  onToggled?: () => void;
}

export function PenaltyJudgeButtons({
  proofId,
  rejectCount,
  viewerRejected,
  disabled = false,
  onToggled,
}: Props) {
  const [rejected, setRejected] = useState(viewerRejected);
  const [count, setCount] = useState(rejectCount);
  const [pending, setPending] = useState(false);

  async function setVerdict(nextRejected: boolean) {
    if (nextRejected === rejected || pending || disabled) return;
    setPending(true);
    const res = await togglePenaltyProofRejection(proofId);
    setPending(false);
    if (!res.ok) return;
    setRejected(res.data.viewerRejected);
    setCount(res.data.rejectCount);
    onToggled?.();
  }

  const busy = pending || disabled;
  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ selected: !rejected, disabled: busy }}
          disabled={busy}
          onPress={() => void setVerdict(false)}
          style={[styles.btn, !rejected ? styles.acceptOn : styles.off]}
        >
          <Text
            style={[
              styles.label,
              { color: !rejected ? colors.brandSuccess : colors.mutedForeground },
            ]}
          >
            인정
          </Text>
          <Text style={styles.hint}>미션 통과</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ selected: rejected, disabled: busy }}
          disabled={busy}
          onPress={() => void setVerdict(true)}
          style={[styles.btn, rejected ? styles.rejectOn : styles.off]}
        >
          <Text
            style={[styles.label, { color: rejected ? colors.brandWarn : colors.mutedForeground }]}
          >
            반려
          </Text>
          <Text style={styles.hint}>불성실</Text>
        </Pressable>
      </View>
      <Text style={styles.meta}>현재 반려 {count}명 · 누가 눌렀는지는 공개되지 않아요</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  row: { flexDirection: "row", gap: 8 },
  btn: {
    alignItems: "center",
    borderRadius: 16,
    borderWidth: 1,
    flex: 1,
    gap: 4,
    paddingVertical: 14,
  },
  acceptOn: { backgroundColor: "rgba(82,194,140,0.10)", borderColor: colors.brandSuccess },
  rejectOn: { backgroundColor: colors.brandSecondarySoft, borderColor: colors.brandWarn },
  off: { backgroundColor: colors.card, borderColor: colors.border },
  label: { fontSize: 13, fontWeight: "700" },
  hint: { color: colors.mutedForeground, fontSize: 11 },
  meta: { color: colors.mutedForeground, fontSize: 11, textAlign: "center" },
});
```

- [ ] **Step 4: penalty-proof-card.tsx 작성**

```tsx
// apps/mobile/src/features/penalty/components/penalty-proof-card.tsx
// 한 명의 증명 카드 — web penalty-proof-card.tsx 미러. 영상은 Linking.openURL(외부 player; 인라인 후속).
// 본인 외 + pending + canJudge 면 판정 토글, 아니면 익명 카운트만.
import type { PenaltyProofView } from "@withkey/domain";
import * as Linking from "expo-linking";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Card } from "@/shared/ui/card";
import { Chip } from "@/shared/ui/chip";
import { colors } from "@/shared/theme/colors";
import { typography } from "@/shared/theme/typography";

import { PenaltyJudgeButtons } from "./penalty-judge-buttons";

type Props = {
  proof: PenaltyProofView;
  // 판정 가능 = 창2 open + viewer 서약 + 본인 아님.
  canJudge: boolean;
  onJudged?: () => void;
};

const STATUS_LABEL: Record<
  PenaltyProofView["status"],
  { text: string; tone: "success" | "secondary" | "neutral" }
> = {
  pending: { text: "판정 대기", tone: "neutral" },
  accepted: { text: "면제 확정", tone: "success" },
  rejected: { text: "반려 · 2배 이월", tone: "secondary" },
  expired: { text: "기간 만료", tone: "secondary" },
};

export function PenaltyProofCard({ proof, canJudge, onJudged }: Props) {
  const status = STATUS_LABEL[proof.status];
  return (
    <Card padding="md">
      <View style={styles.header}>
        <Text style={[typography.body, styles.name]}>
          {proof.isViewer ? "내 증명" : `${proof.performerName}님의 증명`}
        </Text>
        <Chip tone={status.tone}>{status.text}</Chip>
      </View>

      {proof.videoSignedUrl ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${proof.performerName}님의 증명 영상 보기`}
          onPress={() => void Linking.openURL(proof.videoSignedUrl!)}
          style={({ pressed }) => [styles.videoBtn, pressed && styles.pressed]}
        >
          <Text style={styles.videoBtnLabel}>▶ 영상 보기</Text>
        </Pressable>
      ) : (
        <View style={styles.videoMissing}>
          <Text style={styles.videoMissingLabel}>영상을 불러올 수 없어요</Text>
        </View>
      )}

      {canJudge && !proof.isViewer && proof.status === "pending" ? (
        <PenaltyJudgeButtons
          proofId={proof.proofId}
          rejectCount={proof.rejectCount}
          viewerRejected={proof.viewerRejected}
          onToggled={onJudged}
        />
      ) : !proof.isViewer ? (
        <Text style={styles.meta}>
          반려 {proof.rejectCount}명 · 누가 눌렀는지는 공개되지 않아요
        </Text>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  header: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  name: { fontWeight: "600" },
  videoBtn: {
    alignItems: "center",
    backgroundColor: colors.foreground,
    borderRadius: 16,
    marginBottom: 12,
    paddingVertical: 18,
  },
  videoBtnLabel: { color: colors.primaryForeground, fontSize: 14, fontWeight: "700" },
  pressed: { opacity: 0.8 },
  videoMissing: {
    alignItems: "center",
    backgroundColor: colors.muted,
    borderRadius: 16,
    marginBottom: 12,
    paddingVertical: 18,
  },
  videoMissingLabel: { color: colors.mutedForeground, fontSize: 12 },
  meta: { color: colors.mutedForeground, fontSize: 11, textAlign: "center" },
});
```

- [ ] **Step 5: penalty-proof-form.tsx 작성**

```tsx
// apps/mobile/src/features/penalty/components/penalty-proof-form.tsx
// 증명 영상 캡처·제출 — web penalty-proof-form.tsx 미러(카피·15초 상한). 단 RN 은 MediaRecorder 대신
// expo-image-picker 카메라(영상). 갤러리 업로드 없음(각서 신뢰 = 실시간 캡처만, web 정합).
// 인라인 미리보기 player 는 expo-video 미설치라 생략(촬영 완료 상태 + 다시 찍기/제출).
import * as ImagePicker from "expo-image-picker";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { Button } from "@/shared/ui/button";
import { Card } from "@/shared/ui/card";
import { colors } from "@/shared/theme/colors";
import { typography } from "@/shared/theme/typography";

import { submitPenaltyProof, type PenaltyVideoPart } from "../api/submit-penalty-proof";

const MAX_VIDEO_SECONDS = 15; // web MAX_RECORD_MS 15s 정합.

function partFromAsset(asset: ImagePicker.ImagePickerAsset): PenaltyVideoPart {
  // iOS=video/quicktime(.mov), Android=video/mp4 (0059 허용목록). mimeType 미제공 시 uri 확장자로 추론.
  const type =
    asset.mimeType ?? (asset.uri.toLowerCase().endsWith(".mov") ? "video/quicktime" : "video/mp4");
  const name = asset.fileName ?? (type === "video/quicktime" ? "penalty.mov" : "penalty.mp4");
  return { uri: asset.uri, name, type };
}

interface Props {
  challengeId: string;
  onSubmitted?: () => void;
}

export function PenaltyProofForm({ challengeId, onSubmitted }: Props) {
  const [video, setVideo] = useState<PenaltyVideoPart | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  async function capture() {
    setNotice(null);
    const picked = await ImagePicker.launchCameraAsync({
      mediaTypes: ["videos"],
      videoMaxDuration: MAX_VIDEO_SECONDS,
    });
    const asset = picked.canceled ? null : picked.assets[0];
    if (!asset) return;
    setVideo(partFromAsset(asset));
  }

  async function submit() {
    if (!video) return;
    setBusy(true);
    setNotice(null);
    try {
      const res = await submitPenaltyProof({ challengeId, video });
      setBusy(false);
      if (!res.ok) {
        setNotice(
          res.error === "forbidden"
            ? "지금은 만회 찬스를 제출할 수 있는 기간이 아니에요."
            : res.error === "invalid_input"
              ? "영상을 다시 확인해 주세요. (mp4·webm·mov, 20MB 이하)"
              : "제출에 실패했어요. 다시 시도해 주세요.",
        );
        return;
      }
      onSubmitted?.();
    } catch {
      setBusy(false);
      setNotice("제출에 실패했어요. 다시 시도해 주세요.");
    }
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.stage}>
        {video ? (
          <Text style={styles.stageText}>✓ 영상 촬영 완료</Text>
        ) : (
          <View style={styles.stageIdle}>
            <Text style={[typography.body, styles.stageTitle]}>앱 카메라로 바로 찍어요</Text>
            <Text style={styles.stageSub}>미리 찍어둔 영상은 올릴 수 없어요</Text>
          </View>
        )}
      </View>

      {video ? (
        <View style={styles.controls}>
          <Button size="lg" disabled={busy} onPress={() => void submit()}>
            {busy ? "제출 중..." : "증명 제출하기"}
          </Button>
          <Button size="lg" variant="outline" disabled={busy} onPress={() => void capture()}>
            다시 찍기
          </Button>
        </View>
      ) : (
        <Button size="lg" onPress={() => void capture()}>
          미션 영상 녹화
        </Button>
      )}

      {notice ? <Text style={styles.notice}>{notice}</Text> : null}

      <Card tone="muted" padding="sm">
        <Text style={styles.info}>
          혼자 하는 챌린지라면 판단자가 없어 제출 즉시 자동 면제돼요. 친구 과반이 인정하면 벌금이
          면제되고, 미제출·반려되면 벌금이 2배로 다음 정산에 이월돼요.
        </Text>
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 12 },
  stage: {
    alignItems: "center",
    aspectRatio: 9 / 12,
    backgroundColor: colors.foreground,
    borderRadius: 20,
    justifyContent: "center",
    width: "100%",
  },
  stageText: { color: colors.primaryForeground, fontSize: 16, fontWeight: "700" },
  stageIdle: { alignItems: "center", gap: 6 },
  stageTitle: { color: colors.primaryForeground, fontWeight: "600" },
  stageSub: { color: colors.primaryForeground, fontSize: 12, opacity: 0.75 },
  controls: { gap: 8 },
  notice: { color: colors.destructive, fontSize: 13, textAlign: "center" },
  info: { color: colors.mutedForeground, fontSize: 12, lineHeight: 18 },
});
```

- [ ] **Step 6: 테스트 실행 → 통과 확인**

Run: `pnpm --filter @withkey/mobile test -- penalty-components`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add apps/mobile/src/features/penalty/components/penalty-judge-buttons.tsx apps/mobile/src/features/penalty/components/penalty-proof-card.tsx apps/mobile/src/features/penalty/components/penalty-proof-form.tsx apps/mobile/src/features/penalty/components/penalty-components.spec.tsx
git commit -m "feat(mobile/penalty): proof-form(카메라) · proof-card(외부재생) · judge-buttons (web 미러)"
```

---

## Task 12: RN penalty.tsx 화면 + feature barrel

**Files:**

- Create: `apps/mobile/src/features/penalty/index.ts`
- Create: `apps/mobile/src/app/(app)/challenge/[id]/penalty.tsx`
- Create: `apps/mobile/src/app/(app)/challenge/[id]/penalty.spec.tsx`

web `penalty/page.tsx`의 `PenaltyBody` 게이트 로직을 RN으로 미러. `fetchPenaltyStatus`(BFF)를 `useAsyncRead`로, 3-state + null 처리. windowPhase 게이트 순서: before → !isSigned → isPenalizedSelf(제출 영역) → 동료 판정 섹션.

- [ ] **Step 1: feature barrel 작성**

```typescript
// apps/mobile/src/features/penalty/index.ts
export { fetchPenaltyStatus, fetchPenaltyWaiting } from "./api/penalty-reads";
export { submitPenaltyProof } from "./api/submit-penalty-proof";
export { togglePenaltyProofRejection } from "./api/toggle-penalty-rejection";
export { PenaltyProofForm } from "./components/penalty-proof-form";
export { PenaltyProofCard } from "./components/penalty-proof-card";
export { PenaltyJudgeButtons } from "./components/penalty-judge-buttons";
export { PenaltyWaitingSection } from "./components/penalty-waiting-section";
```

> `PenaltyWaitingSection`은 Task 13에서 생성한다. barrel에 미리 넣으면 Task 12 typecheck가 깨지므로, **이 줄은 Task 13 Step에서 추가**한다. Task 12에서는 그 줄을 제외하고 작성한다(아래 코드 블록에서 마지막 export 제외).

실제 Task 12에서 쓸 barrel(마지막 줄 제외):

```typescript
// apps/mobile/src/features/penalty/index.ts
export { fetchPenaltyStatus, fetchPenaltyWaiting } from "./api/penalty-reads";
export { submitPenaltyProof } from "./api/submit-penalty-proof";
export { togglePenaltyProofRejection } from "./api/toggle-penalty-rejection";
export { PenaltyProofForm } from "./components/penalty-proof-form";
export { PenaltyProofCard } from "./components/penalty-proof-card";
export { PenaltyJudgeButtons } from "./components/penalty-judge-buttons";
```

- [ ] **Step 2: 실패 테스트 작성**

```tsx
// apps/mobile/src/app/(app)/challenge/[id]/penalty.spec.tsx
const mockFetchStatus = jest.fn();
const mockUseSession = jest.fn();

jest.mock("@/features/penalty", () => ({
  fetchPenaltyStatus: (...a: unknown[]) => mockFetchStatus(...a),
  PenaltyProofForm: () => null,
  PenaltyProofCard: jest.requireActual("@/features/penalty/components/penalty-proof-card")
    .PenaltyProofCard,
  PenaltyJudgeButtons: () => null,
}));
jest.mock("@/features/auth", () => ({ useSession: () => mockUseSession() }));
// PenaltyProofCard(real) → penalty-judge-buttons(real) → toggle-penalty-rejection(real, getSupabaseClient
// 내부 호출) 체인 격리 — 마운트 시 supabase 의존 없이 안정.
jest.mock("@/features/penalty/components/penalty-judge-buttons", () => ({
  PenaltyJudgeButtons: () => null,
}));
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ id: "c1" }),
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
}));
jest.mock("expo-linking", () => ({ openURL: jest.fn() }));

// eslint-disable-next-line import/first
import { render, screen, waitFor } from "@testing-library/react-native";
// eslint-disable-next-line import/first
import { PENALTY_STATUS_EXPECTED } from "../../../../../../../evals/fixtures/read-contracts/penalty-status";
// eslint-disable-next-line import/first
import ChallengePenaltyScreen from "./penalty";

beforeEach(() => {
  jest.clearAllMocks();
  // SessionState shape 완전성 — { session, isLoading }.
  mockUseSession.mockReturnValue({ session: { user: { id: "u-minji" } }, isLoading: false });
});

describe("ChallengePenaltyScreen", () => {
  it("창2 open + 미달 본인 → 미션 카드 + 내 증명 카드 렌더", async () => {
    mockFetchStatus.mockResolvedValue(PENALTY_STATUS_EXPECTED);
    render(<ChallengePenaltyScreen />);
    await waitFor(() => expect(screen.getByText("팔굽혀펴기 20개")).toBeTruthy());
    expect(screen.getByText("내 증명")).toBeTruthy();
    // 동료(JJ) 증명 판정 섹션
    expect(screen.getByText("JJ님의 증명")).toBeTruthy();
  });

  it("windowPhase=before → 안내 빈 상태", async () => {
    mockFetchStatus.mockResolvedValue({ ...PENALTY_STATUS_EXPECTED, windowPhase: "before" });
    render(<ChallengePenaltyScreen />);
    await waitFor(() => expect(screen.getByText("아직 만회 찬스가 열리지 않았어요")).toBeTruthy());
  });

  it("null(벌칙 없음) → 빈 상태", async () => {
    mockFetchStatus.mockResolvedValue(null);
    render(<ChallengePenaltyScreen />);
    await waitFor(() => expect(screen.getByText("만회 찬스 정보가 없어요")).toBeTruthy());
  });
});
```

> 상대경로는 `[id]/` → repo root까지 7단계(`../` ×7)다 — recap.spec.tsx와 동일 깊이.

- [ ] **Step 3: 테스트 실행 → 실패 확인**

Run: `pnpm --filter @withkey/mobile test -- "challenge/\[id\]/penalty.spec"`
Expected: FAIL — `./penalty` 없음.

- [ ] **Step 4: penalty.tsx 작성**

```tsx
// apps/mobile/src/app/(app)/challenge/[id]/penalty.tsx
// 벌칙(만회 찬스) 창2 화면 (C2). web penalty/page.tsx PenaltyBody 게이트 미러.
// read=BFF(fetchPenaltyStatus). 제출=BFF multipart, 판정=RPC 직접(컴포넌트 내부).
import type { PenaltyStatusView } from "@withkey/domain";
import { formatKRW } from "@withkey/domain";
import { useLocalSearchParams } from "expo-router";
import { useCallback } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useSession } from "@/features/auth";
import { fetchPenaltyStatus, PenaltyProofCard, PenaltyProofForm } from "@/features/penalty";
import { LoadingScreen } from "@/shared/components/screen-states";
import { useAsyncRead } from "@/shared/hooks/use-async-read";
import { Card } from "@/shared/ui/card";
import { Chip } from "@/shared/ui/chip";
import { EmptyState } from "@/shared/ui/empty-state";
import { ErrorState } from "@/shared/ui/error-state";
import { colors } from "@/shared/theme/colors";
import { typography } from "@/shared/theme/typography";

export default function ChallengePenaltyScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const id = Array.isArray(params.id) ? params.id[0]! : params.id;
  const { session } = useSession();
  const viewerId = session?.user.id ?? null;

  const read = useCallback(async () => {
    if (!viewerId) return null;
    return fetchPenaltyStatus(id);
  }, [id, viewerId]);

  const { state, reload, refresh } = useAsyncRead(read);

  if (!viewerId || state.status === "loading") return <LoadingScreen />;
  if (state.status === "error") return <ErrorState onRetry={reload} />;

  const status = state.data;
  if (!status || !status.penaltyMission) {
    return (
      <SafeAreaView edges={["top"]} style={styles.screen}>
        <EmptyState
          title="만회 찬스 정보가 없어요"
          description="벌칙 미션이 있는 종료 챌린지에서만 만회 찬스가 열려요."
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={["top"]} style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={[typography.h3, styles.title]}>만회 찬스</Text>
          <Chip tone="secondary">증명 · 판정</Chip>
        </View>

        {/* 미션 카드 — 그룹장이 정한 미션. */}
        <Card tone="primary" padding="md">
          <Text style={styles.missionLabel}>그룹장이 정한 미션</Text>
          <Text style={styles.missionText}>{status.penaltyMission}</Text>
          <Text style={styles.missionMeta}>
            미달자 모두 같은 미션 수행 · 친구 과반 인정 시 벌금 {formatKRW(status.penaltyAmount)}{" "}
            면제
          </Text>
        </Card>

        <PenaltyBody status={status} onChanged={() => void refresh()} />
      </ScrollView>
    </SafeAreaView>
  );
}

function PenaltyBody({ status, onChanged }: { status: PenaltyStatusView; onChanged: () => void }) {
  // 1) 창2 시작 전 — 직접 진입 방어.
  if (status.windowPhase === "before") {
    return (
      <EmptyState
        title="아직 만회 찬스가 열리지 않았어요"
        description="챌린지 종료 48시간 뒤부터 증명을 제출하고 판정할 수 있어요."
      />
    );
  }

  // 자격: 서약 참가자만.
  if (!status.isSigned) {
    return (
      <EmptyState
        title="이 만회 찬스의 참가자가 아니에요"
        description="서약한 참가자만 증명을 제출하거나 판정할 수 있어요."
      />
    );
  }

  const isPenalizedSelf = status.viewerConfirmedPenalty > 0;
  const judgeableProofs = status.proofs.filter((p) => !p.isViewer);
  const canJudge = status.windowPhase === "open";

  return (
    <View style={styles.body}>
      {/* 2) 미달자 본인 제출 영역. */}
      {isPenalizedSelf && (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>내 만회 찬스</Text>
          {status.viewerProof ? (
            <PenaltyProofCard proof={status.viewerProof} canJudge={false} />
          ) : status.windowPhase === "open" ? (
            <PenaltyProofForm challengeId={status.challengeId} onSubmitted={onChanged} />
          ) : (
            <Card tone="muted" padding="md">
              <Text style={typography.sub}>
                제출 기간이 끝났어요. 미제출이라 벌금이 2배로 다음 정산에 이월돼요.
              </Text>
            </Card>
          )}
        </View>
      )}

      {/* 3) 동료 판정. */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>친구들의 증명 판정</Text>
        {judgeableProofs.length === 0 ? (
          <EmptyState
            title="아직 제출된 증명이 없어요"
            description={
              canJudge
                ? "증명이 올라오면 여기서 판정할 수 있어요. 마감까지 제출이 없으면 자동으로 벌금 2배가 이월돼요."
                : "판정 기간이 끝났어요."
            }
          />
        ) : (
          <View style={styles.proofList}>
            {judgeableProofs.map((proof) => (
              <PenaltyProofCard
                key={proof.proofId}
                proof={proof}
                canJudge={canJudge}
                onJudged={onChanged}
              />
            ))}
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.background, flex: 1 },
  content: { gap: 16, padding: 16, paddingBottom: 32 },
  header: { alignItems: "center", flexDirection: "row", gap: 8, justifyContent: "space-between" },
  title: { color: colors.foreground },
  missionLabel: { color: colors.primaryForeground, fontSize: 11, fontWeight: "700", opacity: 0.8 },
  missionText: { color: colors.primaryForeground, fontSize: 17, fontWeight: "700", marginTop: 6 },
  missionMeta: { color: colors.primaryForeground, fontSize: 12, marginTop: 6, opacity: 0.85 },
  body: { gap: 20 },
  section: { gap: 12 },
  sectionLabel: {
    color: colors.mutedForeground,
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.5,
  },
  proofList: { gap: 16 },
});
```

> `PenaltyProofForm`은 `tone="primary"` Card 위 텍스트 가독성을 위해 흰색 카피를 쓴다(미션 카드). web의 `bg-primary text-primary-foreground` 정합.

- [ ] **Step 5: 테스트 실행 → 통과 확인**

Run: `pnpm --filter @withkey/mobile test -- "challenge/\[id\]/penalty.spec"`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/features/penalty/index.ts "apps/mobile/src/app/(app)/challenge/[id]/penalty.tsx" "apps/mobile/src/app/(app)/challenge/[id]/penalty.spec.tsx"
git commit -m "feat(mobile/penalty): penalty.tsx 화면 — windowPhase 게이트 + 제출/판정 (web 미러)"
```

---

## Task 13: home "만회 찬스 대기" 섹션 + 진입

**Files:**

- Create: `apps/mobile/src/features/penalty/components/penalty-waiting-section.tsx`
- Modify: `apps/mobile/src/features/penalty/index.ts` (barrel에 추가)
- Modify: `apps/mobile/src/app/(app)/(tabs)/home.tsx`

home read에 `fetchPenaltyWaiting`을 합성하고, 대기 목록이 있으면 `HomeOverview` 위에 섹션을 렌더한다. 각 카드 탭 → `/challenge/[id]/penalty`.

- [ ] **Step 1: 실패 테스트 작성**

```tsx
// apps/mobile/src/features/penalty/components/penalty-waiting-section.spec.tsx
import { render, screen, fireEvent } from "@testing-library/react-native";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({ useRouter: () => ({ push: mockPush }) }));

// eslint-disable-next-line import/first
import { PenaltyWaitingSection } from "./penalty-waiting-section";

beforeEach(() => jest.clearAllMocks());

describe("PenaltyWaitingSection", () => {
  const items = [
    { challengeId: "cw1", title: "주 3회 헬스장", groupName: "운동 그룹", penaltyAmount: 3000 },
  ];

  it("항목 없으면 아무것도 렌더 안 함", () => {
    const { toJSON } = render(<PenaltyWaitingSection items={[]} />);
    expect(toJSON()).toBeNull();
  });

  it("항목 렌더 + 탭 시 penalty 라우트 push", () => {
    render(<PenaltyWaitingSection items={items} />);
    expect(screen.getByText("주 3회 헬스장")).toBeTruthy();
    fireEvent.press(screen.getByText("주 3회 헬스장"));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: "/challenge/[id]/penalty",
      params: { id: "cw1" },
    });
  });
});
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `pnpm --filter @withkey/mobile test -- penalty-waiting-section`
Expected: FAIL — 컴포넌트 없음.

- [ ] **Step 3: penalty-waiting-section.tsx 작성**

```tsx
// apps/mobile/src/features/penalty/components/penalty-waiting-section.tsx
// home "만회 찬스 대기" 섹션 — 창2 open + viewer 서약 챌린지 진입로 (spec §C2 / penalty.tsx 진입).
import type { PenaltyWaitingView } from "@withkey/domain";
import { formatKRW } from "@withkey/domain";
import { useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Card } from "@/shared/ui/card";
import { Chip } from "@/shared/ui/chip";
import { colors } from "@/shared/theme/colors";
import { typography } from "@/shared/theme/typography";

export function PenaltyWaitingSection({ items }: { items: ReadonlyArray<PenaltyWaitingView> }) {
  const router = useRouter();
  if (items.length === 0) return null;

  return (
    <View style={styles.wrap}>
      <Text style={styles.heading}>만회 찬스 대기</Text>
      {items.map((item) => (
        <Pressable
          key={item.challengeId}
          accessibilityRole="button"
          accessibilityLabel={`${item.title} 만회 찬스 열기`}
          onPress={() =>
            router.push({ pathname: "/challenge/[id]/penalty", params: { id: item.challengeId } })
          }
          style={({ pressed }) => [styles.cardPressable, pressed && styles.pressed]}
        >
          <Card padding="md">
            <View style={styles.row}>
              <View style={styles.info}>
                <Text style={[typography.body, styles.title]}>{item.title}</Text>
                {item.groupName ? <Text style={typography.sub}>{item.groupName}</Text> : null}
              </View>
              <Chip tone="secondary">벌금 {formatKRW(item.penaltyAmount)}</Chip>
            </View>
            <Text style={styles.cta}>증명을 제출하면 벌금 2배 이월을 피할 수 있어요 →</Text>
          </Card>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  heading: { color: colors.foreground, fontSize: 15, fontWeight: "700" },
  cardPressable: {},
  pressed: { opacity: 0.85 },
  row: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  info: { flex: 1, gap: 2 },
  title: { fontWeight: "600" },
  cta: { color: colors.primary, fontSize: 12, fontWeight: "600", marginTop: 8 },
});
```

- [ ] **Step 4: feature barrel에 섹션 추가**

`apps/mobile/src/features/penalty/index.ts` 끝에 추가:

```typescript
export { PenaltyWaitingSection } from "./components/penalty-waiting-section";
```

- [ ] **Step 5: home.tsx에 대기 read + 섹션 연결**

`apps/mobile/src/app/(app)/(tabs)/home.tsx`를 수정한다.

(a) import 추가(기존 feature import 근처):

```typescript
import { fetchPenaltyWaiting, PenaltyWaitingSection } from "@/features/penalty";
```

(b) `HomeData` 타입에 `waiting` 추가:

old:

```typescript
type HomeData = {
  displayName: string | null;
  groups: Awaited<ReturnType<typeof fetchCurrentChallenges>>;
  unsignedPendingIds: ReadonlySet<string>;
};
```

new:

```typescript
type HomeData = {
  displayName: string | null;
  groups: Awaited<ReturnType<typeof fetchCurrentChallenges>>;
  unsignedPendingIds: ReadonlySet<string>;
  penaltyWaiting: Awaited<ReturnType<typeof fetchPenaltyWaiting>>;
};
```

(c) read의 `Promise.all`에 대기 read 추가 + 반환 객체에 포함:

old:

```typescript
const [groups, displayName] = await Promise.all([
  fetchCurrentChallenges(userId),
  fetchMyDisplayName(userId),
]);
```

new:

```typescript
const [groups, displayName, penaltyWaiting] = await Promise.all([
  fetchCurrentChallenges(userId),
  fetchMyDisplayName(userId),
  fetchPenaltyWaiting(userId),
]);
```

old:

```typescript
return { displayName, groups, unsignedPendingIds };
```

new:

```typescript
return { displayName, groups, unsignedPendingIds, penaltyWaiting };
```

(d) 구조 분해 + 렌더에 섹션 추가:

old:

```typescript
const { displayName, groups, unsignedPendingIds } = state.data;
```

new:

```typescript
const { displayName, groups, unsignedPendingIds, penaltyWaiting } = state.data;
```

old (greeting 다음 `HomeOverview` 위치):

```tsx
          <View style={styles.greeting}>
            <Text style={styles.greetingTitle}>안녕, {displayName ?? "친구"} 👋</Text>
          </View>
          <HomeOverview groups={groups} unsignedPendingIds={unsignedPendingIds} />
```

new:

```tsx
          <View style={styles.greeting}>
            <Text style={styles.greetingTitle}>안녕, {displayName ?? "친구"} 👋</Text>
          </View>
          <PenaltyWaitingSection items={penaltyWaiting} />
          <HomeOverview groups={groups} unsignedPendingIds={unsignedPendingIds} />
```

- [ ] **Step 6: 테스트 + typecheck**

Run: `pnpm --filter @withkey/mobile test -- penalty-waiting-section`
Expected: PASS

Run: `pnpm --filter @withkey/mobile exec tsc --noEmit`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add apps/mobile/src/features/penalty/components/penalty-waiting-section.tsx apps/mobile/src/features/penalty/components/penalty-waiting-section.spec.tsx apps/mobile/src/features/penalty/index.ts "apps/mobile/src/app/(app)/(tabs)/home.tsx"
git commit -m "feat(mobile/home): 만회 찬스 대기 섹션 + penalty 화면 진입"
```

---

## Task 14: 전체 검증

- [ ] **Step 1: domain 게이트**

Run: `pnpm --filter @withkey/domain test`
Expected: PASS — penalty read/write-contract · action-log(quicktime) · fixture parity 포함 green

- [ ] **Step 2: web 게이트**

Run: `pnpm --filter web exec tsc --noEmit`
Expected: PASS

Run: `pnpm --filter web lint`
Expected: PASS

Run: `pnpm --filter web test -- penalty`
Expected: PASS — penalty-status/route · penalty-proof/route + 기존 penalty 테스트 green

- [ ] **Step 3: mobile 게이트**

Run: `pnpm --filter @withkey/mobile exec tsc --noEmit`
Expected: PASS

Run: `pnpm --filter @withkey/mobile lint`
Expected: PASS

Run: `pnpm --filter @withkey/mobile test`
Expected: PASS — penalty-reads · penalty-mutations · penalty-components · penalty-waiting-section · penalty.spec + 기존 테스트 green

- [ ] **Step 4: migration 적용 검증 (로컬)**

Run: `pnpm supabase db reset`
Expected: 0059 포함 전 migration 적용 성공

Run: `pnpm supabase db reset`은 무겁다 — 대안으로 적용 후 버킷 확인만 수동으로:
`select allowed_mime_types from storage.buckets where id='action-videos';` → `{video/mp4,video/webm,video/quicktime}`

- [ ] **Step 5: 수동 시각·기능 검증 (Expo dev build, 모바일 viewport)**

web과 시각·플로우 비교(같은 UI/UX):

- 종료+48h 챌린지 → home "만회 찬스 대기" 카드 → penalty 화면 진입
- 미달 본인: 미션 카드 · "미션 영상 녹화"(카메라 영상) → 제출 → 내 증명 카드 "판정 대기"
- 동료 증명: "영상 보기"(외부 player) · 인정/반려 토글 → "현재 반려 N명"
- 창2 전 직접 진입 → "아직 만회 찬스가 열리지 않았어요"
- 비참가자(서약 안 함) 직접 진입 → "이 만회 찬스의 참가자가 아니에요"
- **익명성(spec §Verification ②)**: `GET /api/penalty-status` 응답 본문에 `voter_id`/판정자 식별자가 없고 `rejectCount`만 있는지 확인(예: 기기 네트워크 로그 또는 `curl -H "Authorization: Bearer …"`). 토글 후 다른 viewer로 조회 시 누가 반려했는지 노출 안 됨.
- iOS 실기: `.mov` 영상 제출이 `422` 없이 성공(0059 버킷 + `update_action_log_video_path` 정규식 검증)
- RLS negative: 창2 외 시간/본인 proof 토글이 `42501` 반환(Supabase Studio 또는 curl 음성 경로)

참조: web `penalty/page.tsx` 실제 화면 · `docs/mockups/2026-06-24-feed-type-penalty-screens.html`

- [ ] **Step 6: (검증 통과 시) PR 준비 보고**

푸시·PR은 사용자 확인 후. PR 본문은 한국어(가드레일), spec 링크 + spec-required 경로(migration 0059 · validators) 명시.

---

## 완료 기준 (Definition of Done)

- [ ] penalty 상태 read가 BFF `GET /api/penalty-status`(Bearer + 주입 변형 + admin hydrate)로 공급
- [ ] 증명 제출이 BFF `POST /api/penalty-proof`(multipart, 공유 코어)로, 동료 판정 토글이 RN `supabase.rpc()` 직접으로
- [ ] `PenaltyStatusView`·`PenaltyProofView`·`PenaltyWindowPhase`·`PenaltyWaitingView`가 read-contract, 증명 제출 응답이 write-contract로 승격(web↔RN 공유 SoT)
- [ ] iOS `.mov`(video/quicktime) 영상이 허용목록(0059 migration: 버킷 + `update_action_log_video_path` RPC + validators + storage)에 추가됨
- [ ] penalty 화면이 web `PenaltyBody` 게이트(before/!isSigned/제출/판정)와 카피 일치
- [ ] home "만회 찬스 대기" 섹션이 RLS-direct read로 penalty 진입로 제공
- [ ] 증명 영상 재생은 `Linking.openURL`(인라인 player 후속), 캡처는 카메라 전용(갤러리 차단)
- [ ] `penalty-status`·`penalty-waiting` 패리티 fixture + BFF route 계약 테스트 green
- [ ] domain/web/mobile `{typecheck,lint,test}` 모두 PASS, migration 0059 로컬 적용 확인
- [ ] 푸시·PR은 사용자 확인 후 (브랜치 `feat/rn-settlement-c2-penalty`)

## 후속 / 미해결 (이 계획 범위 밖)

- **증명 영상 인라인 재생** — `expo-video`/`expo-av` 의존 추가 + VideoView 컴포넌트(현재 `Linking.openURL` 외부 재생).
- **영상 클라이언트 압축** — 서버가 20MB 상한 강제. 큰 영상 사전 압축은 후속(`prepare-photo.ts` 영상 버전).
- **RN analytics emit** — `track()` server-side service_role, RN BFF(`/api/track`) 인프라 부재(spec Out of scope).
- **carry-over(−2X) 영수증 라인** — C1 후속과 동일 간극(별도 정합).
- **재제출 UX** — RPC는 `on conflict` upsert로 재제출 허용하나, RN 화면은 viewerProof 있으면 상태 카드만 보인다(web 동일). 재제출 폼 노출은 후속.
- **penalty 화면 진입로 보강** — challenge feed `index.tsx` closed phase에도 진입 버튼 추가 검토(현재 home 대기 섹션이 유일 진입로).
