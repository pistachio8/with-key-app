---
spec: 2026-06-13-d-7-submit-action-log-bff
title: D-7 submitActionLog BFF 계약
author: pistachio8
date: 2026-06-13
status: accepted
---

## Summary

RN(React Native) 앱의 사진 인증 쓰기 경로(`submitActionLog`)를 노출하는 BFF(Backend-for-Frontend) 계약을 확정한다. [00-rn-conversion-plan §13.4 D-7](../../migration/00-rn-conversion-plan.md)이 spec 으로 지정한 decision debt 이며, [EVAL-0019](../../../evals/tasks/0019-rn-native-action-log-mvp.md)(G10 native action log MVP)의 `Blocked-by` 조건이다.

핵심 결정은 **Fat BFF** — RN 은 사진(multipart) + 입력값을 단일 `POST /api/action-log` 로 보내고, 서버가 AI 일기 생성 → `action_logs` insert → Storage 업로드 → photo_path RPC → push/analytics 부수효과까지 **단일 요청 처리 경계(비파괴 다단계 + best-effort cleanup, DB 트랜잭션 아님)에서** 수행한다. web 의 기존 `submitActionLog` Server Action 본문을 `submitActionLogCore(supabase, user, formData)` 공유 함수로 추출해 web Server Action 과 BFF route 가 **같은 코어를 호출**한다 — 이것이 web↔RN drift 를 막는 단일 출처(SoT)다.

본 spec 이 머지된 뒤 EVAL-0019 구현 PR(코어 추출 + BFF route + RN service/UI)이 따라온다.

## Why

- **OpenAI 키가 BFF 를 강제한다.** `submitActionLog` 의 거의 전부가 RN 토큰 RLS 로 가능하다 — `al_insert_self_active`(0028, 본인·active·기간·참가자 강제) · `ap_insert_self`(0011, 본인 경로 Storage INSERT) · `update_action_log_photo_path`(0011, `authenticated` grant). RLS 로 **불가능한 본질은 `generateDiary`(OpenAI secret) 하나뿐**이다. push·analytics·verify 는 service-role 이라 서버 유지(EVAL-0018 D-2/D-3 과 동일). 그래서 lifecycle mutation(EVAL-0018)은 RPC-direct 였지만 `submitActionLog` 는 BFF 다.
- **단일 요청 처리 경계가 명시 요구다.** [00 §9 #13](../../migration/00-rn-conversion-plan.md)은 "Storage write, AI, analytics, push side effect 를 한 트랜잭션 경계로 유지"를 못박는다. 여기서 "트랜잭션 경계"는 DB 원자성이 아니라 **한 요청이 부수효과 전체와 실패 정리(cleanup)를 책임지는 경계**를 뜻한다. 클라이언트가 단계를 쪼개 오케스트레이션하면 사진 고아(orphan) 정리 책임이 RN 으로 넘어가고 복구가 복잡해진다.
- **drift 위험을 코드 구조로 차단해야 한다.** web 과 RN 이 KST 일자 계산·doneCount·AI fallback·cleanup 로직을 각자 구현하면 패리티 snapshot 이 비싸지고 동작이 어긋난다. 같은 코어 함수 + 같은 zod 응답 계약이면 패리티가 by construction 으로 보장된다.
- **기존 BFF 표면과 정합해야 한다.** read 경로는 이미 [ADR-0036](../../adr/0036-rn-admin-hydrate-bff-contract.md) `GET /api/feed`(Bearer)로 정립됐고, write 경로도 같은 Bearer 인증 · transport-중립 계약 · domain zod 검증 패턴을 따라야 한다.

## Impact Scope

### 변경 경로

- 신규:
  - `apps/web/src/lib/action-log/submit-core.ts` — `submitActionLogCore` (SoT, `"server-only"`)
  - `apps/web/src/app/api/action-log/route.ts` — Bearer 검증 → core → HTTP 매핑
  - `packages/domain/src/write-contracts/action-log.ts` — `submitActionLogResponseSchema` · `SubmitResult` · `ErrorCode` 승격
  - `apps/mobile/src/features/action-log/api/submit-action-log.ts` — RN service (`bffPostFormData` → schema.parse → ok/error)
  - `apps/mobile/src/features/action-log/**` — native 촬영/선택·압축·제출 UI (구현 PR)
  - `evals/fixtures/write-contracts/action-log.ts` — 공유 fixture
  - 위 모듈별 `*.spec.ts` (domain 계약 · RN boundary eval · BFF route)
- 수정:
  - `apps/web/src/app/(app)/challenge/[id]/action/_actions.ts` — `submitActionLog` 을 `submitActionLogCore` 호출 wrapper 로 (외부 동작 동일)
  - `apps/web/src/app/(app)/challenge/[id]/action/_actions.spec.ts` — 본문 검증을 코어 타깃으로 재배치
  - `apps/mobile/src/services/api/bff-client.ts` — `bffPostFormData`(4xx 에도 body 읽음, no-throw) 추가

### src/ 영향

- `apps/web/src/lib/action-log/`(신규) · `apps/web/src/app/api/action-log/`(신규) · `apps/web/src/app/(app)/challenge/[id]/action/_actions.ts`(wrapper 화).
- `packages/domain/src/write-contracts/`(신규 디렉토리) — domain 은 순수 유지(네트워크/supabase/openai 미포함), zod 계약만.
- `apps/mobile/src/features/action-log/`(신규) · `apps/mobile/src/services/api/bff-client.ts`.

### Supabase / RLS / migration 영향

**없음.** 기존 정책·RPC 를 그대로 소비한다 — `al_insert_self_active`(0028) · `ap_insert_self`/`ap_select_group_member`(0011) · `update_action_log_photo_path` RPC(0011). 신규 컬럼·정책·migration 을 만들지 않는다(서버 idempotency key 를 도입하지 않기로 한 이유 중 하나).

### 외부 서비스

- **OpenAI** — `generateDiary`(4.5s 타임아웃, 커버리지 부족 시 `templateFallback`). RN 제출이 web 과 같은 서버측 `ai_cost_log` 예산·rate-limit 을 공유한다(코어 재사용).
- **Web Push** — `dispatchActionCompletedNotification`(그룹원 인증 완료 알림), `after()` 로 응답 latency 와 분리.

## Design

### 결정 요약 (그릴링 11)

| #   | 결정        | 선택                                                                                                                          |
| --- | ----------- | ----------------------------------------------------------------------------------------------------------------------------- |
| 1   | BFF 두께    | **Fat BFF** — 서버가 AI→insert→upload→RPC→push/analytics 전부, 단일 요청 처리 경계                                            |
| 2   | transport   | **multipart/form-data** — web FormData 필드 동일 (base64 ✗, ~33% 팽창)                                                        |
| 3   | 코드 SoT    | web 본문 **통째 추출** → `submitActionLogCore(supabase, user, formData)`, client 주입 + 캐시 tail caller별                    |
| 4   | 응답        | **ActionResult 봉투 passthrough + 파생 HTTP status** + `@withkey/domain` zod 계약 승격                                        |
| 5   | endpoint    | **`POST /api/action-log`** (flat·단수, challengeId 는 body)                                                                   |
| 6   | memo        | 계약 optional 유지, **RN MVP UI 는 AI 경로만** (memo defer, BFF 변경 0)                                                       |
| 7   | 사진 교체   | **제외** — `replaceActionPhoto` 는 별도 보안 경계, 0019 non-goal                                                              |
| 8   | 중복 제출   | **UI-only + `retry:0` 강제 + 넉넉한 타임아웃** (서버 idempotency key ✗ = migration)                                           |
| 9   | pending UI  | **web 미러** — 컨트롤 disable + 버튼 `ActivityIndicator` + "인증 중...", dim 없음                                             |
| 10  | 캐시 무효화 | `revalidatePath` 는 코어 유지(양 컨텍스트), **`updateTag` 는 Route Handler 금지** → web=`updateTag`(RYOW)·BFF=`revalidateTag` |
| 11  | 검증        | 5겹 (아래 Verification)                                                                                                       |

### C1. 공유 코어 — `submitActionLogCore`

web `_actions.ts` 의 `submitActionLog` 본문(파싱 → membership/active/기간 선제 체크 → KST priorLogs/doneCount 산출 → AI 일기 or memo → `action_logs` insert → 2-step 사진 업로드 + `update_action_log_photo_path` RPC + 실패 시 `deletePhoto` cleanup → `track()` → `after()` push/verify → `revalidatePath`)을 코어로 옮긴다. 코어가 받는 것은 `supabase` client(주입)와 인증된 `user` 이고, **인증·client 생성·`updateTag` 캐시 tail 은 코어 밖(caller)에 둔다**.

```ts
// apps/web/src/lib/action-log/submit-core.ts  ("server-only")
export async function submitActionLogCore(
  supabase: SupabaseClient, // cookie client OR bearer client
  user: { id: string; email?: string | null },
  formData: FormData,
): Promise<ActionResult<SubmitResult>> {
  /* 기존 본문 — createClient()·withUser·updateTag 제외, revalidatePath 는 포함 */
}
```

호출자 재배선(각 컨텍스트의 차이):

```ts
// web wrapper — 기존 withUser·createClient 유지 후 코어 호출, updateTag(RYOW)는 wrapper 가 담당
export const submitActionLog = withUser<FormData, SubmitResult>(async (user, fd) => {
  const r = await submitActionLogCore(await createClient(), user, fd);
  updateTag(`user-${user.id}-home-feed`); // Server Action 전용 — read-your-own-writes 즉시 갱신
  return r;
});
// BFF route — getUser(token) 직접(ADR-0022 getAuthedUser dedupe 는 단일 호출이라 불필요),
//             Route Handler 금지인 updateTag 대신 revalidateTag 사용
const r = await submitActionLogCore(supabase, user, await request.formData());
revalidateTag(`user-${user.id}-home-feed`);
```

- **왜 client 주입인가**: web 은 cookie 세션 client, BFF 는 Bearer token client(`createBearerClient`)로 호출 client 만 다르고 나머지 로직은 동일하다. 주입으로 분기 없이 한 본문을 공유한다.
- **왜 `updateTag` 만 분리하나**: Next 16 `updateTag` 는 **Server Action 전용 — Route Handler 호출 시 런타임 throw**(`node_modules/next/dist/docs/.../updateTag.md` "It cannot be used in Route Handlers"). 따라서 코어에 두면 BFF 경로가 깨진다. `revalidatePath` 는 양 컨텍스트에서 호출 가능(Route Handler 에선 next-visit 시 revalidate)하므로 코어에 남긴다. BFF 는 동일 무효화를 `revalidateTag`(Route Handler 지원)로 수행한다.
- **왜 RLS 경로인가(admin 아님)**: 메인 경로의 모든 쓰기(insert·Storage·RPC)는 주입된 user client 로 실행되어 RLS 가 강제된다. ADR-0036 §2(Bearer 경로도 RLS, admin 대체 금지) 준수. 코어 메인 경로에 `adminClient` 없음 — admin 은 `replaceActionPhoto`(범위 밖)와 verify `after()` 내부에만 존재한다.

### C2. BFF route — `POST /api/action-log`

```ts
// apps/web/src/app/api/action-log/route.ts
export async function POST(request: Request) {
  const token = bearerTokenFrom(request); // 기존 헬퍼 재사용
  if (!token) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const supabase = createBearerClient(token); // 기존 헬퍼 재사용
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token);
  if (error || !user)
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const result = await submitActionLogCore(supabase, user, await request.formData());
  return NextResponse.json(result, { status: result.ok ? 200 : statusFor(result.error) });
}
```

- 가드레일: Route Handler 는 외부 콜백 + RN BFF(Bearer) 전용 — **PWA(web) 클라이언트는 이 endpoint 를 호출하지 않는다**(web 은 RSC + Server Action 유지, ADR-0036 §5).
- `statusFor`: `unauthorized→401` · `forbidden→403` · `invalid_input→422` · `not_found→404` · `conflict→409` · `rate_limited→429` · `upstream_error→502`.
- **왜 봉투 passthrough인가**: body 에 web client 가 받는 것과 동일한 `ActionResult` 봉투(`{ok:true,data}` 또는 `{ok:false,error,issues}`)를 그대로 실어 RN 이 `.ok` 분기 + field `issues` 를 web 과 동일하게 처리한다. status code 도 정상 세팅돼 모니터링·미들웨어가 올바른 코드를 본다.

### C3. domain 계약 — `submitActionLogResponseSchema`

`SubmitResult`(현재 `_actions.ts` 로컬 타입)와 `ErrorCode`(현재 `apps/web/src/lib/actions/response.ts` 의 7 리터럴: `unauthorized`·`forbidden`·`invalid_input`·`not_found`·`conflict`·`rate_limited`·`upstream_error`)를 `packages/domain/src/write-contracts/action-log.ts` 로 **verbatim 승격**하고, discriminated union(`ok`) zod 스키마를 둔다. `feedResponseSchema`(read-contracts) 패턴과 동일하다.

```ts
// packages/domain/src/write-contracts/action-log.ts
const errorCode = z.enum([
  "unauthorized",
  "forbidden",
  "invalid_input",
  "not_found",
  "conflict",
  "rate_limited",
  "upstream_error",
]);
const issues = z.record(z.string(), z.array(z.string()).optional()).optional(); // response.ts ActionFailure.issues 미러
export const submitActionLogResponseSchema = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), data: submitResultSchema }),
  z.object({ ok: z.literal(false), error: errorCode, issues }),
]);
```

- **왜 domain 인가**: BFF 응답이 타입되는 스키마와 RN 이 parse 하는 스키마가 한 곳이어야 계약이 단일하다. domain 은 순수(네트워크 코드 미포함)라 web·RN·BFF 가 모두 의존 가능하다.
- `ErrorCode` 를 domain 으로 옮긴 뒤 `response.ts` 는 domain 에서 re-export 해 web 의 기존 import 를 깨지 않는다(surgical).

### C4. RN service — `submit-action-log.ts`

`apps/mobile/src/features/action-log/api/submit-action-log.ts` 가 native 압축 사진 + 입력으로 `FormData` 를 만들어 `bffPostFormData("/api/action-log", fd)` 호출 → `submitActionLogResponseSchema.parse(body)` → `ok`/`error` 분기.

**업로드 정책 패리티(web `prepareForUpload`)**: `expo-image-manipulator` 로 **전송 전** ① long-edge 1920px clamp ② JPEG quality 0.85 ③ HEIC/HEIF 입력은 JPEG 로 변환 ④ 결과 5MB 초과 시 거부(버킷 `file_size_limit` 5MB·`uploadPhoto` `MAX_PHOTO_BYTES` 와 동일 상한). 압축본은 통상 <1MB 라 Vercel Serverless Function 의 request body 기본 한도(~4.5MB, [FUNCTION_PAYLOAD_TOO_LARGE](https://vercel.com/docs/errors/FUNCTION_PAYLOAD_TOO_LARGE))를 넘지 않는다. 압축 실패 시 web 과 동일하게 원본 fallback(버킷 정책이 최종 거부).

`bffPostFormData`(신규, `bff-client.ts`)는 GET 용 `bffGetJson`(`!ok` 면 throw)과 달리 **봉투를 값으로 반환**한다 — status→동작 계약:

| 응답                                                                                         | 동작                                  |
| -------------------------------------------------------------------------------------------- | ------------------------------------- |
| 200 + JSON body                                                                              | 봉투 값 반환(`ok:true`)               |
| 4xx + JSON body (401 `unauthorized`·422 `invalid_input`+issues·403 `forbidden`·404·409 포함) | 봉투 값 반환(`ok:false`) — throw 아님 |
| body 없음 · JSON parse 실패 · 5xx(`upstream_error` 봉투 제외) · 네트워크 오류                | `BffRequestError(status)` throw       |

→ 401 도 route 가 `{ok:false,error:"unauthorized"}` 봉투(C2)로 주므로 "4xx body-읽기" 규칙에 일관되게 포함된다. 5xx 중 `upstream_error` 봉투가 실리면 값으로, 빈 body 5xx 는 throw 로 분기.

### C5. RN UI — 제출/pending (web 미러)

- native 촬영/선택: `expo-camera`/`expo-image-picker`, permission denied · 재시도 UI(AC `native photo flow`).
- pending: `busy`(mutation pending + 압축) 동안 폼 컨트롤 disable + 제출 버튼 `ActivityIndicator` + 라벨 "인증 중...". full-screen dim 오버레이는 web·mobile 어디에도 없어 도입하지 않는다(scope creep 회피). 버튼 disable 이 더블탭(중복 제출)을 막는다.
- 중복 제출: TanStack `useMutation` `retry: 0` **강제**(자동 재시도가 RN 을 web 보다 나쁘게 만드는 유일 요인) + fetch 타임아웃 **≥ 30s**(직렬 경로 = AI 최대 4.5s + 압축 사진 업로드 RTT + insert/RPC; 이보다 짧으면 서버 성공 후 client abort → 사용자 수동 재시도로 중복). 서버 부분 성공 후 client timeout 시 봉투를 못 받는 잔여 위험은 `retry:0`+버튼 disable 로 web 과 동일 risk class 유지(Alternatives 4).

### Data flow

```
RN: 촬영/선택 → expo-image-manipulator(1920px/0.85) → FormData
   → bffPostFormData(POST /api/action-log, Bearer)
BFF route: bearerTokenFrom → createBearerClient → getUser(token)
   → submitActionLogCore(supabase, user, formData)
        ① membership/active/기간 선제 체크 (RLS user client)
        ② priorLogs → KST doneCount/verifiedDays 산출 (@withkey/domain)
        ③ generateDiary(OpenAI 4.5s) | memo passthrough
        ④ action_logs insert (RLS al_insert_self_active)
        ⑤ uploadPhoto(Storage ap_insert_self) → update_action_log_photo_path RPC
           ↳ RPC 실패 시 deletePhoto cleanup (photoAttached=false 비파괴)
        ⑥ track() action_logged/ai_generated (never-throw)
        ⑦ after(): dispatchActionCompletedNotification + verify signals
        ⑧ revalidatePath (코어; 양 컨텍스트)
   → ActionResult<SubmitResult> 봉투
BFF: revalidateTag(user-${id}-home-feed) → NextResponse.json(result, {status: statusFor})
     (web wrapper 는 updateTag — Route Handler 금지라 caller별 분기)
RN: submitActionLogResponseSchema.parse → ok ? 성공 모달/슬라이더/컨페티 : error 매핑
```

## Alternatives Considered

### 1. Thin BFF (AI-only) + RN RLS 오케스트레이션

- **내용**: RN 이 Storage 업로드·`action_logs` insert·photo_path RPC 를 자기 토큰으로 직접 하고, BFF 는 AI 일기 생성만.
- **기각**: ① 단일 트랜잭션 경계(00 §9 #13) 를 3-hop 으로 깨뜨림 ② 사진 고아 정리 책임이 RN 으로 넘어가 복구 복잡 ③ KST·doneCount·insert 로직이 RN 으로 복제돼 drift ④ verify 가 사진 bytes 를 서버에서 못 봄(Storage 재다운로드 필요). 단계 수는 줄지만 정합성·SoT 비용이 더 크다.

### 2. JSON + base64 사진 전송

- **기각**: base64 는 ~33% 크기 팽창으로 오히려 Vercel ~4.5MB 한도에 가까워진다. multipart 는 바이너리 그대로라 효율적이고 web `parseFormData` 로직을 그대로 재사용할 수 있다.

### 3. HTTP-idiomatic 응답 (성공 bare body / 실패 status+`{error}`)

- **기각**: RN 이 status→error code 역매핑(lossy)하고 field `issues` 를 별도 처리해야 한다. 봉투 passthrough 가 web client 와 동일 shape 을 줘 에러 처리 패리티가 높다(status code 는 봉투와 함께 정상 세팅).

### 4. 서버 idempotency key (중복 제출 방지)

- **기각**: client uuid + BFF dedup 은 unique 컬럼/dedup 테이블 **migration** 이 필요해 POC 스코프를 넘고, web 에 없는 RN-only 분기를 만든다(0019 "port only" 정신과 충돌). UI-only(`retry:0` + 버튼 disable)로 web 과 같은 리스크 클래스를 유지한다.

## Verification

### 명령

```bash
pnpm -r typecheck
pnpm -r lint
pnpm -r test
pnpm --filter @withkey/mobile test -- action-log
pnpm harness:check
pnpm validate:docs
```

### 시나리오

5겹 검증(feed 보존 eval 패턴 재사용):

1. **공유 fixture** `evals/fixtures/write-contracts/action-log.ts` — `SUBMIT_SUCCESS_ENVELOPE`(valid `{ok:true,data:SubmitResult}`) + `SUBMIT_FAILURE_ENVELOPE`(`{ok:false,error:"forbidden"}`).
2. **domain 계약 테스트** — `submitActionLogResponseSchema` 가 success/failure 봉투 accept, malformed reject.
3. **RN boundary eval**(= AC `action-log` 본체) — `bffPostFormData` mock → fixture 주입 → ① 성공봉투 parse·`ok` 분기 ② 실패봉투 `error` 매핑 ③ 계약위반 throw. `feed-reads.spec.ts` 1:1.
4. **web 행동 테스트 재배치** — 기존 `_actions.spec.ts` 의 본문 검증(KST·doneCount·AI fallback·orphan cleanup)을 추출된 `submitActionLogCore`(client 주입) 타깃으로 이전 → SoT 가 테스트 대상. wrapper 는 smoke 만.
5. **BFF route 테스트** — bearer 없음→401, 성공봉투→200, 실패봉투→`statusFor` 매핑(forbidden→403 등). core·bearer mock.

**패리티 by construction**: web action·BFF route 가 같은 코어 호출 + RN 이 BFF 응답이 타입된 같은 스키마 parse → 단일 계약·단일 코어라 표면별 행동 중복 단언 불필요.

**P95 latency 실측**: BFF 경로는 `getUser(token)` GoTrue 왕복(~50~200ms) + AI 최대 4.5s + Storage 업로드가 직렬이라, PRD §5.3(P95 5s)·Vercel function timeout 을 실 API·실기기로 측정한다(feed BFF 와 동일한 getUser 패턴이나 submit 은 heavy 경로).

**수동/device(위조 금지)**: native 사진 permission flow · secret boundary(EAS 번들에 `OPENAI_API_KEY`/`sb_secret_*` 부재) · 실 AI fallback · KST doneCount parity(첫 인증 증가/2차 미증가) · RN·PWA feed signed private photo 표시 · BFF 제출 후 PWA feed 갱신(`revalidatePath` Route Handler 는 next-visit revalidate) → PO·실기기 핸드오프.

## Rollout

1. 본 spec 머지 → [00 §13.4 D-7](../../migration/00-rn-conversion-plan.md) 행에 본 spec 링크 추가.
2. EVAL-0019 구현 PR — (a) 코어 추출 + web wrapper 화(외부 동작 동일, 기존 테스트 green 유지) (b) BFF route + `bffPostFormData` (c) domain 계약 + fixture (d) RN service + UI.
3. dogfood: EAS Dev Build 로 active 챌린지 → native 사진 인증 1회 → AI 일기 → RN/PWA feed 확인.
4. 재검토: cutover 후 BFF 를 별도 백엔드로 이전 시 같은 계약을 재구현하고 mobile 은 `EXPO_PUBLIC_BFF_BASE_URL` 만 교체(ADR-0036 transport-중립). 중복 제출 운영 데이터가 유의미하면 서버 idempotency key 재논의.

### 롤백

코어 추출은 web `submitActionLog` 의 외부 동작을 바꾸지 않으므로(wrapper 가 같은 시그니처·동작 유지), BFF route·RN service 추가분만 revert 하면 web 은 무영향. spec 자체는 1 commit revert.

## Out of scope

- P2 자동 사기 검증·피어 반려(EVAL-0021/0022 의 RN 기능화) — 단, 기존 서버 verify 파이프라인은 RN 사진에도 `after()` 에서 자동 실행된다(패리티, non-goal 위반 아님).
- 사진 1회 교체(`replaceActionPhoto`, EVAL-0024) — 별도 보안 경계(service-role once-gate), 별도 결정.
- 직접 입력 일기(memo) RN UI — 계약은 optional 로 열어두되 MVP UI 미출시.
- 서버 idempotency key · 오프라인 업로드 큐.
- push token model migration(`device_push_tokens`) — action 제출에 필요한 기존 서버 부수효과 외.
- AI 프롬프트·키워드 풀·analytics 유니온·Storage 버킷 가시성 변경.

## 용어집

- **ADR**: Architecture Decision Record — 되돌리기 비용이 큰 결정 기록.
- **BFF**: Backend-for-Frontend — RN ↔ Supabase 사이 보안 경계 서버. 여기선 `apps/web` Next API route.
- **봉투(envelope)**: 성공/실패를 `{ok, data}` / `{ok:false, error, issues}` 한 형태로 감싼 응답 구조(`ActionResult`). web client·BFF·RN 이 같은 봉투를 본다.
- **Bearer**: `Authorization: Bearer <Supabase access token>` 인증. cookie 세션이 없는 RN 요청에 사용.
- **decision debt(D-N)**: Phase 진입 전 결정이 필요한 항목. D-7 = `submitActionLog` BFF 계약.
- **drift**: web 과 RN 구현이 시간이 지나며 어긋나는 현상.
- **Fat BFF**: 서버가 쓰기 부수효과 전체를 단일 요청에서 수행하는 BFF(↔ Thin BFF: 클라이언트가 단계 오케스트레이션).
- **idempotency key**: 중복 요청을 같은 결과로 수렴시키는 클라이언트 발급 식별자.
- **KST doneCount**: 한국시(Asia/Seoul) 캘린더 distinct 일자 기준 누적 인증일수. 같은 날 2차 인증은 미증가.
- **RLS**: Row Level Security — Postgres 행 단위 접근 제어.
- **RSC**: React Server Component.
- **SoT**: Single Source of Truth — 중복 없이 기준이 되는 단일 출처.
