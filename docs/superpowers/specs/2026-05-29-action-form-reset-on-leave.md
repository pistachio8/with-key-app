---
spec: 2026-05-29-action-form-reset-on-leave
title: 인증하기 폼 — 라우트 이탈 시 작성 중 state 초기화
author: pistachio8
date: 2026-05-29
status: draft
---

## Summary

인증하기(`/challenge/[id]/action`) 화면에서 사진을 고르거나 찍고 키워드·메모를 작성하던 중,
앱 내 다른 페이지로 이동했다가 다시 인증 화면으로 돌아오면 **이전에 작성하던 내용(사진 포함)이 그대로 남아있다.**
사용자는 인증 화면을 떠나면 작성 중이던 state 가 초기화되어, 다음 진입 시 깨끗한 폼에서 시작하기를 원한다.

본 spec 은 (1) 잔존의 실제 원인을 진단하고, (2) "라우트 이탈 시 초기화" 의 정확한 동작 계약과 경계 조건을 확정하며,
(3) 기존 PRD §4.4 "1시간 보관"(제출 실패-draft 복구) 기능과의 공존 규칙, (4) 구현 시 절대 어겨선 안 되는 제약을 정의한다.

훅(어떤 시점에 어떻게 state 를 비울지)의 최종 선택은 **구현 1단계의 실측 재현 결과에 따라 확정**한다 — 코드 증거가 상충하기 때문이다(아래 Design 참조).

## Why

- **혼란/오작동**: 재진입 시 오래된 사진·메모가 남아 "왜 옛날 내용이 보이지?" 혼란을 주고, 무심코 stale 한 사진을 그대로 제출할 위험이 있다.
- **재현 경로(실측)**: 실기 모바일 PWA 에서 `/action`(내용 입력) → FAB 홈 → `/home` → FAB 인증 → `/action` 의 **forward soft-nav 사이클**에서 사진까지 복원됨.
- **잔존 원인이 코드 의도와 불일치**: `ActionForm` 의 모든 state 는 `useState` 라 unmount 시 사라져야 하고, 사진(`File`)은 어디에도 직렬화 저장되지 않는다. 그럼에도 사진이 살아남는다는 건 컴포넌트 subtree 가 unmount 되지 않고 보존된다는 뜻 — Next.js App Router client-side segment cache(`cacheComponents: true` 가 증폭)가 유력하다.
- **기존 기능과의 경계 필요**: localStorage 의 §4.4 실패-draft 는 "제출 실패 시에만" 저장되는 의도된 안전망이다. 이번 변경이 이를 훼손하면 안 된다.
- **429 회귀 위험**: 잘못된 구현(라우트 강제 remount)은 `MarkActionStartedOnMount` 의 server action 재발화를 유발해 과거 GoTrue `over_request_rate_limit`(429) 문제를 되살릴 수 있다.

## Impact Scope

### 변경 경로

- 신규: `docs/superpowers/specs/2026-05-29-action-form-reset-on-leave.md` (본 문서)
- 수정(구현 PR 예상): `src/app/(app)/challenge/[id]/action/_components/action-form.tsx` (state reset 로직). 실측 결과에 따라 보조 hook 파일 1개 신설 가능(`use-reset-on-route-leave.ts` 등, 동일 `_components/` 내 colocate).

### src/ 영향

- `src/app/(app)/challenge/[id]/action/_components/action-form.tsx` — 작성 중 state 초기화 로직 추가.
- 그 외 `src/` 변경 없음. FAB(`src/components/app-shell/fab-menu.tsx` · `fab-photo-verify-sheet.tsx`)는 단순 `<Link>` 진입점일 뿐 photo/memo state 를 보유하지 않으므로 변경 대상 아님.

### Supabase / RLS / migration 영향

없음. 클라이언트 in-memory state 만 다룬다. DB 쓰기·읽기·RLS 변경 없음.

### 외부 서비스

없음. 단, 구현 제약으로 `markActionStarted`(PRD §6.2 그룹 알림 server action) **재발화를 유발하지 않을 것**을 요구(429 회귀 방지).

## Design

### 진단 (확정된 사실 + 가정 분리)

**사실**

- `ActionForm`(`action-form.tsx:119`)이 사용자 입력 state 를 모두 `useState` 로 보유(context/외부 store 없음): `activityType`(line 125)·`shuffleByActivity`(128)·`selected`(131)·`memoOpen`(132)·`memo`(133)·`file`(134)·`preview`(135)·`result`(136, 성공 모달 state). 그 외 transient 플래그 `preparing`(124, 사진 transcode 중)·`pending`(123, `useTransition` 제출 중)이 있다.
- 사진은 직렬화 불가(`File`)라 localStorage draft 에서 **항상 제외**됨(`action-form.tsx:241-247`). 즉 잔존 사진은 localStorage 출처가 아니다.
- §4.4 draft 는 **제출 실패 시에만** 저장(`saveDraft`, line 240-247), mount 시 hydrate(line 140-150), 제출 성공 시 clear(line 256), TTL 1시간.
- **hydration effect 는 set-only**: `loadDraft` 후 draft 가 있으면 5개 필드를 `set`, **없으면 `if (!draft) return`(line 142) 로 조기 반환해 state 를 비우지 않는다.** 즉 보존된 인스턴스가 재사용되면 이전 값이 그대로 남는다.
- `page.tsx:47,52` 에서 `MarkActionStartedOnMount` 와 `ActionForm` 은 **형제(sibling)**이며 둘 다 `key` 없음. → `<ActionForm>` 만 `key` 로 remount 해도 형제인 `MarkActionStartedOnMount` 는 remount 되지 않아 `markActionStarted` 재발화가 없다(H1 회피 가능).
- 분석 이벤트: `keywords_shown` 은 schema union 에 **정의만 되어 있고 app/components 어디서도 발화되지 않음**(미배선). 액션 경로에서 실제 발화하는 건 제출 시 server-side `action_logged`·`ai_generated`(`_actions.ts:224,245`)뿐. → client reset 은 어떤 분석 이벤트도 재발화하지 않는다.
- `markActionStarted` 는 PRD §6.2 AC-2 로 **1일 최대 1회**(server idempotency) 보장 → 재발화돼도 중복 알림은 없으나, 문제는 알림이 아니라 `auth.getUser()` 호출 폭증으로 인한 GoTrue 429 다(`page.tsx:13-17` 주석).
- FAB 인증 버튼은 활성 챌린지 1개면 `<Link href="/challenge/[id]/action">`(soft nav), 여러 개면 `FabPhotoVerifySheet`(챌린지 picker, photo state 없음) → 결국 `/action` 라우트로 이동.
- `next.config` 에 `cacheComponents: true`. 코드상 React `<Activity>` 사용 없음.
- 재현은 **forward soft-nav** 사이클(`/action`→`/home`→`/action`)이며 bfcache(back-forward cache) 경로가 아님.

**가정(실측으로 확정 필요)**

- forward 재진입 시 `ActionForm` subtree 가 Next.js client-side segment cache 에 의해 **unmount 되지 않고 보존**되어 `useState`(File·blob URL 포함)가 복원된다.
- `MarkActionStartedOnMount`(`mark-action-started-on-mount.tsx`) 주석은 "새로고침/뒤로가기서 remount" 라 서술 → 이는 forward 재진입과 다른 경로일 수 있어, 둘의 mount/unmount 거동을 실측으로 분리 확인해야 한다.
- **교차 챌린지(cross-challenge) 의심**: `ActionForm` 은 모든 `/challenge/[id]/action` 에서 트리 동일 위치에 있다. React 가 인스턴스를 재사용한 채 `challengeId` prop 만 바꾸면(A→B 이동), `[challengeId]` hydration effect 는 돌지만 B 에 draft 가 없으면 조기 반환 → **B 화면에 A 의 사진/키워드가 남는 잠재 누수**. 동일 id 재진입과 별개로 실측 확인 필요(privacy 영향: 다른 챌린지 사진 노출).

### 동작 계약 (product)

> 핵심: **"`/action` 재진입 = 최초 mount 와 정확히 동일하게 행동한다."**

- C1. **이탈 트리거 범위**: 앱 내 라우트 이동(soft nav)으로 `/action` 을 떠난 경우에만 작성 중 state 를 버린다. **왜**: 앱 백그라운드·탭 전환·멀티태스킹(예: 갤러리/메신저 갔다 복귀)에서 초기화하면 작업 중 손실이 크다. 따라서 트리거는 React/router 레이어 신호여야 하고 `pageshow`/`visibilitychange`(백그라운드 복귀도 발화) 를 트리거로 쓰지 않는다.
- C2. **초기화 범위 = 사용자 입력 state 전부**: `file`+`preview`·`selected`·`memo`·`memoOpen`·`activityType`(→ 기본 `gym`)·`shuffleByActivity`(→ fresh shuffle)·`result`(→ `{open:false, variant:"completed"}`)를 최초 mount 상태로 되돌린다. transient 플래그 `preparing`·`pending` 은 **수동 리셋하지 않는다** — 각각 try-finally·`useTransition` 이 소유하므로 진행 중 강제 false 처리하면 in-flight 작업과 어긋난다(아래 C7). **왜**: "새 진입 = 깨끗한 폼" 이 가장 단순하고 예측 가능. 부분 보존은 carve-out 복잡도만 키운다.
- C3. **조용히 초기화**: 이탈 전 확인 dialog 없음. **왜**: 사용자 의도와 일치하고, App Router soft-nav 가로채기는 공식 API 가 없어 fragile. `beforeunload` 는 soft-nav 를 못 잡는다.
- C4. **§4.4 실패-draft 는 보존**: 초기화는 in-memory state 만 비우고 localStorage 의 실패-draft 는 건드리지 않는다. 재진입이 "최초 mount 와 동일" 하므로, 실패-draft 가 있으면 키워드/메모는 기존 hydration 계약대로 다시 채워진다(사진은 원래도 복구 안 됨). **왜**: §4.4 는 "제출이 실패한" 별개의 안전망이고 PO 승인 영역. 이번 UX 요청과 의도가 다르다.
- C5. **blob URL 해제**: 사진 state 를 비울 때 `URL.revokeObjectURL(preview)` 로 누수 방지(기존 unmount cleanup `action-form.tsx:152-156` 과 동일 원칙).
- C6. **교차 챌린지 격리**: `/challenge/A/action` → `/challenge/B/action` 처럼 **다른 챌린지의 인증 화면에 진입하면 A 의 작성 내용이 절대 보여선 안 된다.** B 에 draft 가 없으면 빈 폼, 있으면 B 의 draft. **왜**: 현재 hydration 이 set-only(no-draft 시 비우지 않음)라 인스턴스 재사용 시 다른 챌린지 사진이 노출될 수 있다(privacy). 초기화/hydration 경로는 "초기값으로 리셋 → 대상 챌린지 draft 있으면 적용" 순서여야 한다.
- C7. **in-flight 작업 보호**: 제출(`pending`)·사진 transcode(`preparing`)·AI 일기 생성(server 4.5s) 진행 중 이탈해도 server action 은 그대로 완료된다(reset 은 화면 state 만 비움). reset 이 in-flight 서버 작업을 취소하거나 `pending`/`preparing` 을 강제 조작하지 않는다. **왜**: 제출 성공/실패 후처리(draft clear/save)는 server action 의 resolve 에 매여 있어, 그 흐름을 끊으면 §4.4 draft 정합이 깨진다.

### 구현 제약 (hard)

- H1. **`MarkActionStartedOnMount` 재마운트 금지** — 페이지/라우트 subtree 를 통째로 재마운트(전체 `key` bump, route cache opt-out 등)하면 `MarkActionStartedOnMount` 가 다시 mount 되어 `markActionStarted`(server action)→`auth.getUser` 가 재호출, 과거 **429 회귀** 위험. 허용되는 것은 (a) `useState` in-place 리셋(훅 A) 또는 (b) **`ActionForm` 단독** `key` remount(훅 B — 형제 `MarkActionStartedOnMount` 는 영향 없음)뿐. 즉 "초기화" 의 폭발 반경을 `ActionForm` 이하로 가둔다.
- H2. **분석 이벤트 재발화 없음** — `action_logged`·`ai_generated` 는 제출 시 **server-side** 발화라 client reset 과 무관(안전). 새 분석 이벤트 추가하지 않는다(PRD §9.1 union 1:1, PO 승인 영역).
- H3. **§4.4 hydration 계약 유지(reset-then-apply)** — reset 후 상태가 "최초 mount" 와 동일하도록, "초기값 리셋 → 대상 챌린지 draft 있으면 적용" 순서를 보장한다. 현재 set-only hydration(no-draft 시 비우지 않음, C6 누수 원인)을 이 순서로 교정하는 것을 포함한다.

### 트리거 모델 (정밀화)

사용자 멘탈 모델은 "이탈하면 사라진다" 지만, 보존된 인스턴스에서는 **"재진입 시점"** 에 초기화하는 편이 견고하다(이탈 경로 — FAB·헤더 back·하드웨어 back·브라우저 back — 에 무관하게 동작). 두 관점은 관측상 동일(다음 진입 시 깨끗한 폼)하다. 트리거 신호는 "현재 활성 라우트가 이 챌린지의 `/action` 으로 (재)진입했다 + 직전과 다른 방문이다" 여야 하며, 교차 챌린지(C6)에서는 `challengeId` 변화도 트리거다.

트리거는 **edge-triggered(진입 전이 1회)** 여야 한다 — `/action` 에 머무는 동안(예: 제출 성공 후 결과 모달·confetti 표시 중)에는 절대 재발화하지 않는다. 매 렌더마다 리셋하면 성공 UX·작성 중 입력이 파괴된다.

### 훅 후보 (실측 후 택1)

- **A. 재진입 감지 in-place reset**: 보존된 `ActionForm` 이 `/action` 재활성·`challengeId` 변화 transition 을 감지(예: `usePathname` 전이 또는 nav 식별자 변화)해 모든 입력 `useState` 를 초기값으로 리셋 + blob 해제 + (있으면) §4.4 draft 재적용. unmount 가 안 되는 경우에 유효. H1 자동 충족.
- **B. `<ActionForm>` 만 `key` remount (유력 — 형제 구조 덕에 H1-safe)**: 재진입/`challengeId` 신호를 `key` 로 흘려 `ActionForm` **단독** remount. 형제인 `MarkActionStartedOnMount` 는 remount 되지 않아 `markActionStarted` 재발화 없음(H1 충족). 기존 unmount cleanup(blob 해제, C5)·mount hydration(§4.4, H3)·초기 state 가 그대로 재실행되어 C2/C4/C5/C6/H3 를 **추가 로직 없이** 충족. 관건은 "올바른 재진입 신호로 key 를 바꾸는 것"(부모 RSC 가 캐시될 때 key 가 갱신되는지 실측 필요).
- **C. `/action` 라우트 client cache opt-out**: 매 진입 fresh mount 유도. 단 page RSC 전체 재실행 + `MarkActionStartedOnMount` remount → `markActionStarted`/`auth.getUser` 재호출로 **429 회귀 위험**(H1 정면 충돌). 최후 수단.

## Alternatives Considered

- **이탈 시 확인 dialog (반려)**: 사용자 의도("조용히 초기화")와 상충 + App Router soft-nav 가로채기 미지원으로 fragile. C3 로 기각.
- **§4.4 draft 까지 모두 삭제 (반려)**: PRD §4.4 "1시간 보관" 사실상 폐기 → ADR/PRD 수정 + PO 승인 필요. 이번 요청 범위 밖. C4 로 기각.
- **bfcache(`pageshow`/`event.persisted`) 훅 (반려)**: 실측 재현이 forward soft-nav 라 bfcache 경로가 아님. 또한 백그라운드 복귀까지 초기화해 C1 위반. 진단으로 기각.
- **모든 page-restore(visibilitychange) 시 초기화 (반려)**: 앱 전환/멀티태스킹 복귀에도 작업 손실. C1 로 기각.

## Verification

### 명령

```bash
pnpm typecheck
pnpm lint
pnpm test
```

기존 `action-form.spec.tsx` 에 reset 동작 단위/컴포넌트 테스트를 **먼저 추가(RED)** 후 구현(GREEN): (a) `challengeId` 가 바뀌면 photo/keyword/memo 가 초기화되는가(C6), (b) draft 가 있는 챌린지 재진입 시 키워드/메모만 복구(C4), (c) draft 없는 재진입은 빈 폼(C2). 단, "Next.js segment cache 가 인스턴스를 보존하는가" 는 단위 테스트로 재현 불가 — 실기/Preview 수동 시나리오로 보완한다.

### 시나리오

수동(모바일 viewport / 실기 PWA 우선 — 본 현상은 실기에서 재현됨):

1. **재현 확인(구현 전, 1단계)**: `/action` 에서 사진+메모 입력 → FAB 홈 → `/home` → FAB 인증 → `/action`. 현재: 사진·메모 잔존함을 먼저 재현하고, ActionForm 의 mount/unmount·`usePathname` 거동을 관측해 훅 확정.
2. **정상(수정 후)**: 위와 동일 경로 → 재진입 시 폼이 **깨끗**(사진·키워드·메모·활동유형·셔플 모두 초기 상태).
3. **§4.4 보존**: 제출을 일부러 실패시켜 draft 저장 → 다른 페이지 이동 → `/action` 재진입 → **키워드/메모는 1시간 내 복구**(사진은 복구 안 됨). 초기화가 이 경로를 깨지 않음을 확인.
4. **멀티태스킹 비초기화(C1)**: `/action` 에서 입력 → OS 홈/다른 앱(갤러리 등) 전환 → 다시 PWA 복귀 → 작성 중 내용이 **유지**됨(이탈 아님).
5. **429 비회귀(H1)**: 재진입을 반복해도 `markActionStarted` server action 호출 폭증·GoTrue 429 가 발생하지 않음(네트워크/로그 관측).
6. **메모리(C5)**: 사진 여러 번 교체·이탈 반복 시 blob URL 이 revoke 되어 누적되지 않음.
7. **교차 챌린지 격리(C6)**: 챌린지 2개 이상 활성 상태에서 `/challenge/A/action` 에 사진+메모 입력 → FAB picker(`FabPhotoVerifySheet`)로 `/challenge/B/action` 진입 → B 화면에 **A 의 사진·키워드가 보이지 않음**(B draft 있으면 B 것만).
8. **in-flight 제출 보호(C7)**: 제출 직후(또는 AI 생성 중) 이탈 → server action 은 정상 완료(피드/알림 반영). 재진입 시 폼은 깨끗하고, 직전 제출이 실패였다면 §4.4 draft 가 복구됨. 진행 중 작업이 reset 으로 취소되지 않음.

## Rollout

- 단일 PR(베이스 `develop`). 구현 1단계에서 실측 재현으로 훅 확정 후 surgical 변경.
- Vercel Preview 에서 모바일 viewport 및 가능하면 실기 PWA 로 시나리오 1~6 확인 후 머지.
- dogfood 중 "재진입 후에도 stale 내용" 재보고 0건이면 안정으로 간주.

### 롤백

state reset 로직(또는 신설 hook)을 제거하는 1 commit revert 로 원복. DB/외부 서비스 변경이 없어 데이터 영향 없음.

## Out of scope

- 이탈 시 확인 dialog / 떠나기 경고.
- §4.4 "1시간 보관" 정책 자체의 변경(삭제·연장·사진 포함 등).
- 앱 백그라운드·탭 전환·멀티태스킹 복귀 시 초기화.
- 새 분석 이벤트(예: 작성 이탈/draft 폐기 측정) 추가.
- 멀티스텝 라우트 분해 등 인증 플로우 구조 변경.

## 용어집

- **bfcache**: back-forward cache — 브라우저가 페이지 전체(JS heap 포함)를 얼려 뒤로/앞으로 이동 시 복원하는 캐시. 본 건은 이 경로가 아님.
- **cacheComponents**: Next.js 16 의 App Router prerender/캐시 실험 플래그. 본 프로젝트 `next.config` 에서 ON. client-side segment 보존을 증폭할 수 있음.
- **draft(§4.4)**: 제출 실패 시 localStorage 에 1시간 보관되는 작성 복구본. 키워드/메모만 저장(사진 제외).
- **forward soft-nav**: `<Link>`/router 로 document 새로고침 없이 앞으로 이동하는 클라이언트 네비게이션.
- **PRD §4.4**: 인증 작성 중 제출 실패 시 1시간 draft 보관 요구사항.
- **PRD §6.2**: 인증 화면 진입 시 그룹원에게 시작 알림 자동 발화 요구사항(`markActionStarted`).
- **PRD §9.1**: AnalyticsEvent 이벤트 표. 코드 union 과 1:1.
- **server action**: Next.js 서버 측 쓰기 처리 함수(`_actions.ts`).
- **soft nav**: 클라이언트 라우터 네비게이션(전체 페이지 재로드 없음).
