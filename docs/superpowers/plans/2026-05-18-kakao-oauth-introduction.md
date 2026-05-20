---
plan: 2026-05-18-kakao-oauth-introduction
title: Kakao OAuth 도입 + 매직링크 UI 숨김
author: pistachio8
date: 2026-05-18
status: draft
---

## 목표

매직링크가 카카오톡/인스타/페북/네이버 인앱뷰에서 세션 유지에 실패하는 문제를 우회하기 위해, **카카오 OAuth 를 1차 로그인 경로로 도입**한다. 매직링크 server action(`requestMagicLink`)과 callback 의 `token_hash` flow 는 코드로 남기고 **UI 진입점만 환경변수 토글로 숨긴다** — 카카오 OAuth 운영 사고 시 즉시 fallback.

대응되는 PRD AC: §3.3 AC-3 (카카오 로그인 or 매직링크), §11.1 민지 시퀀스, §9.1 `user_signed_up` (provider 분기).

## 영향 범위

- **변경 경로**
  - `supabase/migrations/0027_handle_new_auth_user_kakao_safe.sql` (신규)
  - `src/app/auth/callback/route.ts`
  - `src/app/(auth)/login/page.tsx`
  - `src/lib/auth/in-app-browser.ts` (신규)
  - `src/components/auth/in-app-browser-guard.tsx` (신규)
  - `src/app/(auth)/invite/[token]/page.tsx` (가드 wire · SSR UA)
  - `src/app/(auth)/invite/[token]/_components/accept-form.tsx` (카카오 버튼 · 가드 wrap)
  - `src/app/(app)/challenge/[id]/pledge/page.tsx` (welcome 배너 inline)
  - `src/app/(app)/group/[id]/page.tsx` (welcome 배너 inline)
  - `.env.example`
- **데이터/RLS 영향**: `handle_new_auth_user()` 트리거 본문 변경. 데이터 손실 없음(`CREATE OR REPLACE FUNCTION` — 시그니처 보존). RLS 정책 미변경.
- **외부 서비스**: 카카오 개발자 콘솔(앱 설정) · Supabase Auth Providers(Kakao enable) · Vercel Env. OpenAI/Web Push 영향 없음.
- **재사용 후보**: `src/lib/actions/response.ts` · `src/lib/analytics/track.ts` · `src/components/pwa/install-banner.tsx` (PwaGate 그대로).

## 사용자 시퀀스 ↔ 실제 흐름 매핑

사용자 요청 시퀀스를 with-key 코드 상의 실제 라우트로 정확히 매핑하고, deviation 이 의도된 결정인 부분을 명시한다.

### 신규 유저

| 사용자 시퀀스                  | with-key 실제 흐름                                                                                                                                   |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. 카카오톡 초대 링크 클릭     | `/invite/[token]` (OG 카드 — 익명도 미리보기 노출, ADR `2026-05-17-invite-og-preview`)                                                               |
| 2. 초대 랜딩 표시              | invite 페이지의 ShareCard + "초대장 도착" 카피 (이미 구현)                                                                                           |
| 3. CTA "참여하고 시작하기"     | AcceptForm 의 `isAuthed=false` 분기 — "로그인하고 참여하기" 버튼                                                                                     |
| 4. 인앱뷰면 외부 브라우저 안내 | `<InAppBrowserGuard>` 가 CTA 자리 통째로 교체 (앱별 분기 안내)                                                                                       |
| 5. 카카오 로그인               | 외부 브라우저에서 같은 invite 페이지 → "로그인하고 참여하기" → `/login?next=/invite/{token}` → 카카오 OAuth                                          |
| 6. 그룹 자동 가입              | `/auth/callback` 에서 `accept_invite` RPC 자동 호출                                                                                                  |
| 7. 가입 완료 화면              | **welcome cushion** — pledge/group page 로 redirect 시 `?welcome={groupName}` query 부착 → 페이지 첫 paint 시 inline 배너 ("🎉 {그룹}에 합류했어요") |
| 8. 첫 인증 유도                | pledge 서명 → 전원 서명 대기 → 챌린지 `active` → 시작 푸시 → `/challenge/[id]/action` 진입. **즉시 인증 가능 시점은 active 후** — 본 PR 변경 없음    |
| 9. 첫 인증 후 PWA 설치 유도    | 결과 모달 close → `/home` → 기존 `PwaGate` 자동 노출. 본 PR 변경 없음                                                                                |

### 기존 유저 (이미 로그인됨)

| 사용자 시퀀스                      | with-key 실제 흐름                                                                                                                                                                   |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1. 카카오톡 초대 링크 클릭         | `/invite/[token]`                                                                                                                                                                    |
| 2. 세션 있으면 바로 그룹 가입/이동 | AcceptForm `isAuthed=true` 분기 — "참여하기" 버튼 **1탭 confirmation 유지** (가입 의도 확인 — 가드레일 §useEffect 자동 mutation 금지 정합. 사용자 시퀀스 "바로" 와 의도된 deviation) |
| 5. 이미 멤버면 바로 그룹 홈        | RPC `accept_invite` 가 `v_already_member` 처리(0018 라인 45). 같은 group_id 반환 → pending 없음/멤버 케이스에서 자연스럽게 `/group/{groupId}`                                        |
| 6. PWA 설치 유도 작은 배너         | 기존 `/home` PwaGate (변경 없음)                                                                                                                                                     |

### 세션 없는 기존 유저

| 사용자 시퀀스                                    | with-key 실제 흐름                                                |
| ------------------------------------------------ | ----------------------------------------------------------------- |
| 1~3. 인앱뷰 가드 → 외부 브라우저 → 카카오 로그인 | 신규 유저와 동일                                                  |
| 4. 로그인 후 초대 그룹 자동 이동                 | callback 자동가입 → pending 없으면 `/group/{groupId}?welcome=...` |

### 가드 외부 열기 URL 의 결정 근거

인앱뷰 가드에서 "외부 브라우저로 열기" 의 target URL 은 **invite 페이지 자체** (`/invite/{token}`) — `/login?next=...` 직행이 1탭 절감 가능하나 OG 미리보기/챌린지 카드 보존을 잃음. 가입 동기 cushion 우선.

## 운영 준비 (코드 변경 전 사용자 외부 작업)

> 이 단계가 끝나지 않으면 dev 에서도 카카오 OAuth 가 동작하지 않는다.

- [ ] 카카오 개발자 콘솔(https://developers.kakao.com) → 내 애플리케이션 → 앱 선택
- [ ] **앱 키 → REST API 키** 복사 (= Client ID)
- [ ] **카카오 로그인 → 보안** → Client Secret 코드 활성화 + 코드 복사
- [ ] **카카오 로그인** → 활성화 ON
- [ ] **Redirect URI** 등록 — `https://<supabase-project>.supabase.co/auth/v1/callback`
- [ ] **동의 항목** — 닉네임(필수) · 카카오계정(이메일)(선택)
- [ ] **플랫폼 → Web** → 사이트 도메인 production 등록(wildcard 미지원)
- [ ] Supabase Dashboard → Authentication → Providers → Kakao enable + Client ID/Secret 입력
- [ ] Supabase Dashboard → Authentication → URL Configuration → Site URL(`https://from.with`) + Redirect URLs 에 production callback + Vercel preview wildcard(`https://with-key-*-pistachio8.vercel.app/auth/callback`)
- [ ] Vercel → Environment Variables → `NEXT_PUBLIC_ENABLE_MAGIC_LINK=false` (production · preview 둘 다)

## UI 디자인 가이드

본 PR 의 신규 UI 표면 4개 — **(a) login 페이지의 카카오 버튼 / (b) 인앱뷰 가드 컴포넌트 / (c) pledge welcome 배너 / (d) group welcome 배너** — 는 모두 `frontend-design` 스킬을 호출해 작업한다. 기존 두 페이지(로그인 · 온보딩 슬라이드)에서 추출한 디자인 시스템에 정렬한다.

### 참고 컴포넌트 (SoT)

- **로그인** — `src/app/(auth)/login/page.tsx` (LoginForm · invite 배너)
- **온보딩 슬라이드** — `src/app/(auth)/login/_components/onboarding-slides.tsx` (progress dots · illust circle · t-h2 title)

새 UI 를 그리기 전에 이 두 파일을 먼저 읽고 패턴을 그대로 재사용한다 — 새 토큰·새 컬러·새 스페이싱을 만들지 않는다.

### 공통 디자인 시스템 (추출 토큰)

| 카테고리            | 값 / 패턴                                                                                                                                                     | 출처                                                           |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| 컨테이너            | `mx-auto flex min-h-svh w-full max-w-screen-sm flex-col`                                                                                                      | login·onboarding 공통                                          |
| 패딩                | `px-6 py-6` ~ `px-6 py-10` (페이지 톤 따라)                                                                                                                   | login=py-10, invite=py-6                                       |
| 배경                | `bg-card` (소프트 화이트 surface) / 페이지 외곽                                                                                                               | onboarding, invite                                             |
| 1차 Button          | `size="lg" className="h-12 w-full"` (shadcn `Button`)                                                                                                         | login·onboarding                                               |
| Title               | `t-h1` (히어로) · `t-h2` (슬라이드 제목) · `t-h3` (카드 제목) — 커스텀 typography token                                                                       | onboarding=t-h2                                                |
| 본문                | `text-muted-foreground text-sm` + `break-keep` (한글 단어 분절 방지) + `whitespace-pre-line` (개행 보존 시)                                                   | 공통                                                           |
| 카드 표면           | `rounded-2xl border` · 알림 톤은 `border-border/60 bg-card/80 backdrop-blur` · 상태 톤은 `bg-primary/5 border-primary/20`                                     | login invite 배너 = backdrop-blur, sentEmail 카드 = primary 톤 |
| illust container    | `grid size-32 place-items-center rounded-full text-5xl` + tone bg (`var(--brand-primary-soft)` / `var(--brand-secondary-soft)` / `oklch(0.96 0.025 12)` pink) | onboarding                                                     |
| Progress dots       | active = `bg-primary h-1.5 w-4.5 rounded-full` · idle = `h-1.5 w-1.5 rounded-full bg-[oklch(0.86 0.005 264)]`                                                 | onboarding                                                     |
| logo                | `next/image` `/logo-from-with.svg` · `unoptimized` · `priority` (히어로) / `h-14 w-auto`(로그인) · `h-6 w-auto`(헤더)                                         | login·invite                                                   |
| Aria                | `role="status" aria-live="polite"` (상태/결과 박스)                                                                                                           | login·AcceptForm                                               |
| Skip/secondary link | `text-muted-foreground hover:text-foreground text-sm` text button                                                                                             | onboarding 건너뛰기                                            |

### 표면별 디자인 명세

#### (a) 카카오 로그인 버튼 — `login/page.tsx`

- 위치: `<section aria-label="로그인 방법 선택">` 안 primary CTA. brand heading 아래.
- 시안: shadcn `Button` `size="lg" h-12 w-full` 그대로 사용하되 카카오 톤 색상은 인라인 또는 신규 variant 도입 금지. **회사 컬러 시스템에 카카오 노란색을 직접 끌어오지 않는다** — 카카오 로고 아이콘만 left adornment 로 두고 텍스트는 "카카오로 시작하기"로. 이유: 가드레일 §단순함 + 컬러 시스템 일관성. 사용자가 카카오 인지 못 할 가능성은 로고 아이콘으로 충족.
- 아이콘: `lucide-react` 에는 카카오 없음 — `public/icons/kakao.svg` 정적 자산 추가하고 `next/image` `width=20 height=20` 로딩. unoptimized + priority 불필요.
- pending 상태(`useTransition`): "로그인 페이지 이동 중…" 텍스트로 swap. login 페이지의 기존 "링크 보내는 중..." 패턴 mirror.

#### (b) 인앱뷰 가드 — `components/auth/in-app-browser-guard.tsx`

- 위치: AcceptForm `isAuthed=false` 분기 · login 페이지 로그인 방법 선택 section 의 **자리 통째 교체** (CTA 영역만). 상위 ShareCard·brand heading 은 보존.
- 시안 구성 (top → bottom):
  1. **상태 인디케이터**: `🚫` 또는 외부 브라우저 아이콘(`lucide-react ExternalLink`) — onboarding illust circle 패턴 축소판 `size-12 rounded-full bg-[var(--brand-primary-soft)]`.
  2. **헤딩**: `t-h3` "인앱브라우저에서는 카카오 로그인이 안 돼요"
  3. **앱별 안내 텍스트**: `text-muted-foreground text-sm break-keep` — kind 별 카피 (plan step 4 표 참조).
  4. **1차 액션**: Android `h-12 w-full` Button "외부 브라우저로 열기" · iOS `h-12 w-full variant="outline"` Button "링크 복사".
  5. **메뉴 안내 fallback**: `rounded-2xl border bg-card/80 backdrop-blur p-4` 카드 안에 단계 텍스트 ("1. 우상단 ⋯ 탭 → 2. 'Safari/Chrome 에서 열기' 선택"). Android/iOS 둘 다 노출.
- 색상: brand-primary-soft 만 사용 — 경고 톤(붉은색) 회피, 사용자 자책감 방지.
- 깜빡임 방지: 컴포넌트가 SSR kind prop 으로 첫 paint 부터 가드 노출. hydration 후 navigator 로 재확정.

#### (c) pledge welcome 배너 — `challenge/[id]/pledge/page.tsx`

- 위치: pledge 페이지 본문 최상단 (서약서 카드 위).
- 시안: `bg-primary/5 border-primary/20 rounded-2xl border px-4 py-4 text-center` (login sentEmail 카드 톤 mirror).
  - 1행: `text-foreground font-semibold` `🎉 {welcome}에 합류했어요`
  - 2행: `text-muted-foreground text-xs` "첫 챌린지에 서명해 보세요"
- `role="status" aria-live="polite"`.
- 색상은 brand primary 톤만 — celebration 이지만 차분한 confirmation 형태. 동적 confetti·풀스크린 transition 같은 motion 추가 금지(가드레일 §단순함 + 사용자 시퀀스 cushion 의도 충족).

#### (d) group welcome 배너 — `group/[id]/page.tsx`

- 위치: 그룹 상세 헤더 직하 (멤버 리스트 위).
- 시안: (c) 와 동일 패턴. 카피만 분기 — `🎉 {welcome}에 합류했어요` · `text-muted-foreground text-xs` "여기서 챌린지를 함께 시작해 보세요".

### 작업 절차

각 표면 작업 시 다음 순서로 `frontend-design` 스킬 호출:

1. 스킬 호출 시 prompt 에 본 plan 의 "참고 컴포넌트" 두 파일 경로를 명시 — 스킬이 새 시스템을 만들지 않고 기존 톤을 mirror 하도록 강제.
2. 스킬이 산출한 시안을 본 plan 의 "공통 디자인 시스템" 표와 대조 — 새 토큰/컬러가 추가됐으면 거부하고 기존 토큰으로 환원.
3. shadcn primitive(`src/components/ui/*`) 만 사용. 신규 primitive 추가 시 가드레일 §단순함 위반 — 별도 review.
4. 모바일 viewport (DevTools 320px·375px) 에서 첫 paint 확인.

### Quality Gate (frontend-design 스킬 §Quality Gate 적용)

- [ ] 표면별 시안이 기존 login/onboarding 톤과 한 화면에 두고 봐도 자연스러운가
- [ ] 새 컬러/스페이싱/typography 토큰을 만들지 않았는가
- [ ] `t-h*` · `text-muted-foreground` · `break-keep` 사용이 일관된가
- [ ] Button 은 `size="lg" h-12 w-full` 기본을 따랐는가
- [ ] 모바일 viewport 에서 무너지지 않는가

## 작업 단계

### 1. DB trigger 안전화 — `supabase/migrations/0027_handle_new_auth_user_kakao_safe.sql`

기존 트리거(0001_init.sql)의 함수 시그니처를 **그대로 보존**하고 본문만 교체. trigger 재바인딩 불필요.

```sql
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.users (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(
      nullif(new.raw_user_meta_data->>'name', ''),
      nullif(new.raw_user_meta_data->>'nickname', ''),
      nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
      '사용자'
    ),
    nullif(new.raw_user_meta_data->>'avatar_url', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
```

`returns trigger`, `language plpgsql`, `security definer`, `set search_path = public` 시그니처가 0001_init.sql 과 동일해야 trigger `on_auth_user_created` 가 자동으로 새 함수를 가리킨다.

**검증**: `pnpm supabase db reset` → 카카오 OAuth 테스트 유저 1명(email NULL · meta.name 있음) + 매직링크 유저 1명(email 있음 · meta NULL) 인서트 → `users.display_name` · `avatar_url` 정확성 확인.

### 2. callback 자동 가입 + 분석 emit + welcome cushion — `src/app/auth/callback/route.ts`

다섯 가지 보강:

(a) **provider 판정**: `code` flow 가 OAuth(카카오) 와 매직링크 legacy PKCE 둘 다 사용함. flow 추정 대신 세션 성립 후 `user.app_metadata.provider` 직접 사용:

```ts
const {
  data: { user },
} = await supabase.auth.getUser();
const provider = (user?.app_metadata?.provider ?? "email") as "kakao" | "email";
```

(b) **invite 자동 가입**: `next` parse 로 `^/invite/([^/?#]+)` 추출 → 매칭되면 `supabase.rpc("accept_invite", { p_token })` 호출. RPC 에러 매핑: `P0002` → `/invite/{token}?error=expired`, `42501` → `?error=full`, 그 외 → `/login?error=auth`.

(c) **invite_opened emit**: callback 자동가입 경로에서도 `track({ name: "invite_opened", props: { groupId, fromOrganicUser: false } }, { userId: user.id })` emit. AcceptForm 의 수동 경로와 양방 일관성.

(d) **user_signed_up emit (휴리스틱)**: users 조회를 `onboarded_at, created_at` 으로 확장. `created_at > now() - 60s AND onboarded_at IS NULL` 이면 `track({ name: "user_signed_up", props: { provider, invitedBy: inviterUserId? } })` emit.

(e) **welcome cushion**: RPC 성공 시 추가 SELECT 로 pending challenge id 조회. redirect URL 에 `?welcome={groupName}` 부착:

```ts
const welcome = encodeURIComponent(groupName ?? "");
return NextResponse.redirect(
  pendingChallengeId
    ? `${origin}/challenge/${pendingChallengeId}/pledge?welcome=${welcome}`
    : `${origin}/group/${groupId}?welcome=${welcome}`,
);
```

기존 onboarding 분기는 보존 — invite next 가 없고 onboarded_at NULL 이면 `/login?onboard=1` (ADR-0006 유지).

**검증**: dev — 새 카카오 계정 invite 진입 → callback 자동가입 → pledge URL 의 `?welcome=` 파라미터 확인 + invite_opened·user_signed_up 이벤트 각 1회 emit 확인.

### 3. 인앱뷰 감지 라이브러리 — `src/lib/auth/in-app-browser.ts`

가드 UI 안내를 앱별로 분기하기 위해 boolean 대신 **kind** 반환:

```ts
export type InAppBrowserKind = "kakaotalk" | "instagram" | "facebook" | "naver" | "line" | "other";

export function detectInAppBrowser(ua: string | null | undefined): InAppBrowserKind | null {
  if (!ua) return null;
  if (/KAKAOTALK/i.test(ua)) return "kakaotalk";
  if (/Instagram/i.test(ua)) return "instagram";
  if (/FBAN|FBAV|FB_IAB/i.test(ua)) return "facebook";
  if (/NAVER\(inapp|; NAVER /i.test(ua)) return "naver";
  if (/Line/i.test(ua)) return "line";
  if (/; wv\)/i.test(ua)) return "other";
  return null;
}

export function isAndroid(ua: string | null | undefined): boolean {
  return !!ua && /Android/i.test(ua);
}
export function isIOS(ua: string | null | undefined): boolean {
  return !!ua && /iPhone|iPad|iPod/i.test(ua);
}

export function buildAndroidIntentUrl(target: string): string {
  const u = new URL(target);
  const host = u.host;
  const pathQuery = u.pathname + u.search + u.hash;
  return `intent://${host}${pathQuery}#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(target)};end`;
}
```

**검증**: vitest unit — UA 픽스처(카카오톡 안드/iOS, 인스타, 네이버앱, Line, 일반 Safari/Chrome) 별 kind 분기.

### 4. 인앱뷰 가드 컴포넌트 — `src/components/auth/in-app-browser-guard.tsx`

> UI 시안은 본 plan "UI 디자인 가이드 §(b)" 참조. `frontend-design` 스킬 호출 + 로그인/온보딩 톤 mirror.

`"use client"` 컴포넌트. props 로 SSR 단계에서 결정된 kind 를 받고, 클라이언트 hydration 후 navigator.userAgent 로 보강(SSR/CDN UA 변조 fallback).

```tsx
type Props = {
  kind: InAppBrowserKind | null;
  targetUrl: string;
  children: React.ReactNode;
};

export function InAppBrowserGuard({ kind: ssrKind, targetUrl, children }: Props) {
  const [kind, setKind] = useState<InAppBrowserKind | null>(ssrKind);
  useEffect(() => {
    if (typeof navigator !== "undefined") {
      setKind(detectInAppBrowser(navigator.userAgent) ?? ssrKind);
    }
  }, [ssrKind]);
  if (!kind) return <>{children}</>;
  return <Guide kind={kind} targetUrl={targetUrl} />;
}
```

**Guide UI 핵심**:

- 메시지: "인앱브라우저에서는 카카오 로그인이 안 돼요"
- **앱별 메뉴 안내** (kind 기반 카피 분기):
  | kind | 안내 텍스트 |
  |---|---|
  | kakaotalk | "카카오톡 우상단 ⋯ 메뉴 → 'Safari/Chrome 에서 열기'" |
  | instagram | "인스타그램 우상단 ⋯ 메뉴 → '브라우저에서 열기'" |
  | naver | "네이버 우상단 메뉴 → '외부 브라우저로 열기'" |
  | facebook | "페이스북 우상단 ⋯ 메뉴 → '시스템 브라우저에서 열기'" |
  | line | "라인 우상단 메뉴 → '기본 브라우저에서 열기'" |
  | other | "오른쪽 상단 메뉴 → '외부 브라우저에서 열기'" |
- **Android 처리** (`isAndroid(ua)`):
  - 1차: "외부 브라우저로 열기" 버튼 → `window.location.href = buildAndroidIntentUrl(targetUrl)`
  - 2차 fallback: **앱별 메뉴 안내도 같이 노출** (intent 실패 시 무한 머무름 방지)
- **iOS 처리** (`isIOS(ua)`):
  - "링크 복사 후 Safari 에서 붙여넣기" 버튼 → `navigator.clipboard.writeText(targetUrl)` → toast "복사됐어요. Safari 를 열고 주소창을 길게 눌러 붙여넣기 해주세요."
  - 앱별 메뉴 안내도 같이 노출

**검증**: vitest + RTL — kind 별 UI 텍스트 정확성, Android/iOS 분기 동작.

### 5. login 페이지 UI — `src/app/(auth)/login/page.tsx`

> 카카오 버튼 시안은 본 plan "UI 디자인 가이드 §(a)" 참조. `frontend-design` 스킬 호출 + 기존 LoginForm 톤 보존(brand heading · invite 배너 · sentEmail 카드 그대로).

(a) **SSR UA 가드**: page 를 server component 진입점으로 분리(현재는 전부 client). `headers().get('user-agent')` 로 kind 결정 → client component 에 props 로 내려보냄. 깜빡임 방지.

```tsx
// page.tsx (server)
export default async function LoginPage() {
  const h = await headers();
  const kind = detectInAppBrowser(h.get("user-agent"));
  return (
    <Suspense fallback={null}>
      <LoginScreen kind={kind} />
    </Suspense>
  );
}
```

(b) **매직링크 토글**: `process.env.NEXT_PUBLIC_ENABLE_MAGIC_LINK === 'true'` (기본 false) 일 때만 이메일 input · "로그인 링크 받기" 버튼 · sentEmail 결과 영역 묶음 conditional render. `onboard=1` 슬라이드 분기는 그대로.

(c) **카카오 로그인 버튼** (primary CTA). next param URL encoding 명시:

```ts
const next = sp.get("next");
const origin = window.location.origin;
const callback = `${origin}/auth/callback${next ? `?next=${encodeURIComponent(next)}` : ""}`;
await supabase.auth.signInWithOAuth({
  provider: "kakao",
  options: { redirectTo: callback },
});
```

(d) `<InAppBrowserGuard kind={kind} targetUrl={현재 URL}>` 로 로그인 방법 선택 section 만 감쌈. brand heading · invite 배너는 보존.

**검증**: dev — 토글 ON/OFF 두 케이스. 카카오톡 인앱뷰 UA spoof → 가드 UI 노출.

### 6. invite 페이지 가드 wire — `src/app/(auth)/invite/[token]/page.tsx` + `_components/accept-form.tsx`

(a) **SSR UA 결정**: page server component 에서 `headers().get('user-agent')` 로 kind → AcceptForm 에 props 로 전달.

(b) **가드 wrap 범위**: AcceptForm 의 `isAuthed=false` 분기(= "로그인하고 참여하기" 버튼)에만 `<InAppBrowserGuard>` 적용. `isAuthed=true` 분기(이미 로그인된 사용자 = 카카오 OAuth 단계 불필요) 와 `pending=true` 분기(이미 acceptInvite 호출 중)에는 가드 미적용.

(c) `/login?next=/invite/{token}` 라우팅은 그대로(login 페이지가 카카오 버튼 노출).

**검증**: invite 페이지 server component 가 user-agent header 정확히 읽음 + AcceptForm `isAuthed=false` 분기에서 가드 노출, 다른 분기는 미노출.

### 7. pledge 페이지 welcome 배너 — `src/app/(app)/challenge/[id]/pledge/page.tsx`

> 배너 시안은 본 plan "UI 디자인 가이드 §(c)" 참조 (login sentEmail 카드 톤 mirror).

searchParams 의 `welcome` 을 읽어 inline 배너 렌더. dismiss 불필요(query 가 1회성 — 사용자가 새로고침/이동 시 자연 소실).

```tsx
const sp = await searchParams;
const welcome = typeof sp.welcome === "string" ? sp.welcome : null;
// ...
{
  welcome && (
    <div role="status" aria-live="polite" className="...">
      <p>🎉 {welcome}에 합류했어요</p>
      <p className="text-muted-foreground text-xs">첫 챌린지에 서명해 보세요</p>
    </div>
  );
}
```

**검증**: `?welcome={그룹이름}` 으로 진입 시 배너 노출. 일반 진입(서명 재방문)은 배너 없음.

### 8. group 페이지 welcome 배너 — `src/app/(app)/group/[id]/page.tsx`

> 배너 시안은 본 plan "UI 디자인 가이드 §(d)" 참조 (§(c) 와 동일 패턴, 카피만 분기).

step 7 과 동일 패턴. pending challenge 없는 그룹 또는 이미 멤버 케이스에 노출.

**검증**: `?welcome={그룹이름}` 진입 시 배너 노출.

### 9. `.env.example` 동기화

`NEXT_PUBLIC_ENABLE_MAGIC_LINK=false` 추가 + 주석 ("매직링크 UI 노출 토글. 카카오 OAuth 운영 사고 시 true 로 비상 fallback").

### 10. ADR-0008 작성 — `docs/adr/0008-kakao-oauth-introduction.md`

Context / Decision / Alternatives / Consequences 채움 (별도 commit).

## 검증

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm supabase db reset
pnpm build
```

수동 확인 항목:

- [ ] dev — 새 카카오 계정 로그인 (invite 없음) → onboarding 슬라이드 → /home → PwaGate 노출
- [ ] dev — 새 카카오 계정 + invite (pending challenge 있음) → `/challenge/{cid}/pledge?welcome={그룹}` → welcome 배너 노출
- [ ] dev — 새 카카오 계정 + invite (pending 없음) → `/group/{id}?welcome={그룹}` → welcome 배너 노출
- [ ] dev — 이미 멤버인 카카오 계정 invite 재클릭 → `/group/{id}?welcome=...` (RPC 멱등)
- [ ] dev — 만료된 invite → `/invite/{token}?error=expired`
- [ ] dev — Chrome DevTools UA spoof: 카카오톡/인스타/네이버/페북/Line → 가드 UI + 앱별 메뉴 안내 정확
- [ ] dev — Android UA spoof → "외부 브라우저로 열기" 버튼 + 메뉴 안내 동시 노출
- [ ] dev — iOS UA spoof → "링크 복사 후 Safari 붙여넣기" 버튼 + 메뉴 안내 동시 노출
- [ ] dev — `NEXT_PUBLIC_ENABLE_MAGIC_LINK=true` 토글 → 매직링크 UI 노출, 기존 동작 회귀 없음
- [ ] dev — 매직링크 가입 → user_signed_up.provider="email" 1회 emit
- [ ] dev — 카카오 가입 → user_signed_up.provider="kakao" 1회 emit
- [ ] dev — 같은 카카오 계정 재로그인 → user_signed_up 추가 emit 없음
- [ ] dev — callback 자동가입 경로 → invite_opened 이벤트 1회 emit (AcceptForm 수동 경로와 동일성)
- [ ] dev — provider 판정: 매직링크 legacy(`code` flow) 진입 시 `provider="email"` 정확히 기록 (app_metadata 기반)
- [ ] iOS Safari / Android Chrome 모바일 viewport — 카카오 버튼 가시성, intent 동작, 배너 가독성
- [ ] production smoke — Vercel preview 에서 카카오 로그인 end-to-end 1회
- [ ] **디자인 정합성**: 신규 UI 4개(카카오 버튼·인앱뷰 가드·pledge welcome·group welcome) 가 login/onboarding 페이지와 같은 톤(`max-w-screen-sm` · `h-12` Button · `t-h*` typography · `bg-card` 표면 · brand-primary-soft 톤 · `break-keep`)을 유지하는지 — UI 디자인 가이드 Quality Gate 5개 항목 통과

## 리스크 / 미해결

- **emit 휴리스틱 fragility**: `created_at < 1분` 시계 의존. POC dogfood 규모(~10~20명)에서 ±1~2 이벤트 오차 허용. V1 진입 시 `events` 테이블 partial unique index 도입 권장.
- **카카오 콘솔 사이트 도메인 wildcard 미지원**: production 만 등록. preview 에서 OAuth redirect 자체는 Supabase callback 으로 가므로 OAuth flow 동작, 카카오톡 공유 카드 검증 경로에 잠재적 회귀.
- **인앱뷰 UA 패턴 유지보수 부담**: 카카오톡/인스타/페북/네이버/라인 UA 변경 시 회귀 risk. 매년 1~2회 점검. detection 미스 시 사용자가 일반 브라우저로 인지하고 카카오 OAuth 실패 — V1 에서 callback 실패 시 가드 화면으로 graceful fallback 추가 검토.
- **welcome 배너 query 의 SEO/공유 영향**: pledge/group page URL 이 `?welcome=...` 로 외부 공유될 가능성. PRD §10 noindex 정책 + 멤버 전용 RLS 로 풀더 누출 위험 없으나, 일반 사용자가 URL 공유 시 배너가 반복 노출됨 — 1회성으로 제한하려면 sessionStorage flag 필요. POC 범위에선 그대로 둠.
- **Android intent 의 카카오톡 버전별 차단**: 카카오톡 최신 버전이 intent scheme 차단한 사례 보고. 메뉴 안내 fallback 으로 보장하지만, intent 미동작 시 사용자가 즉시 메뉴 안내로 시선 이동하는지 UX 모니터.
- **profile_image scope 미요청**: avatar_url 폴백이 `raw_user_meta_data->>'avatar_url'` 의존. 카카오 동의 항목에 프로필 사진 미포함 시 avatar NULL. V1 검토.
- **매직링크 fallback 비상 절차**: Vercel Env 토글로 자동 재배포(즉시). 카카오/Supabase 설정 변경 불필요.
- **첫 인증 유도 시점**: 사용자 시퀀스 step 8 은 챌린지 active 후에만 가능 — 본 PR 변경 범위 외 (기존 푸시 알림 로직 그대로).
- **AI 일기 / PROMPT_VERSION 무관** — 본 변경 범위 밖.
