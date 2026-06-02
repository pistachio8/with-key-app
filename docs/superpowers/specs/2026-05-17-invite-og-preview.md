---
spec: 2026-05-17-invite-og-preview
title: 초대 링크 OG 미리보기 (KakaoTalk 카드)
author: pistachio8
date: 2026-05-17
status: draft
---

## Summary

`/invite/[token]` 공유 시 KakaoTalk·Slack·기타 메신저에서 그룹·서약서 맥락이
담긴 큰 카드 미리보기가 떠야 한다. 현재는 OG(Open Graph) 메타가 비어 있고
인증 게이트가 크롤러를 `/login`으로 튕겨서 폴백 favicon만 보임.

해결: ① `/invite/[token]`에서 진입 redirect 제거, 익명 사용자도 미리보기를
렌더한 뒤 액션 버튼에서만 로그인 게이트(이하 "α 리팩토링"). ② 같은 라우트에
`generateMetadata` + `opengraph-image.tsx`(Edge runtime, `next/og`)를 콜로케이트.

## Why

- 카톡 카드 미리보기가 빈 채로 공유되면 친구 초대 전환률에 직접 손해.
- Next.js Server Component에서 `redirect()`는 HTTP 307만 보내고 HTML(메타 포함)을
  송출하지 않음 — 인증 게이트를 진입부에 그대로 두면 OG를 어디에도 박을 수 없다.
  따라서 α 리팩토링이 전제 조건.
- 토큰은 bearer 시크릿이지만 친밀 채널(카톡 1:1·소그룹) 전용이라 그룹명·서약서
  제목 노출은 Discord/Slack/Notion 수준의 표준 트레이드오프로 수용.
- 곁다리 UX 개선: 카톡에서 cold-land한 사용자가 "친구가 무엇을 같이 하자고 했는지"
  보기 전에 로그인을 강요받지 않게 됨.

## Impact Scope

### 변경 경로

- 신규:
  - `src/app/(auth)/invite/[token]/opengraph-image.tsx`
- 수정:
  - `src/app/(auth)/invite/[token]/page.tsx` — 진입 `redirect()` 제거,
    `generateMetadata` export 추가
  - `src/app/(auth)/invite/[token]/_components/accept-form.tsx` — 익명 사용자
    "로그인하고 참여하기" 분기 추가
  - `src/app/(auth)/invite/[token]/_actions.spec.ts` ·
    `src/app/(auth)/invite/[token]/_components/accept-form.spec.tsx` — 익명 분기
    케이스 추가

### src/ 영향

- `src/lib/db/reads/invite.ts` — 변경 없음 (이미 `adminClient()` 사용 →
  RLS(Row Level Security) 우회, 익명 컨텍스트에서도 동작)
- `src/lib/invite/share-url.ts` — 변경 없음
- `src/lib/supabase/*` · 인증 미들웨어 — 변경 없음

### Supabase / RLS / migration 영향

없음. 기존 `invites` RLS(오너 SELECT 전용) 그대로 — `fetchInvitePreview`는 이미
service_role로 우회 조회.

### 외부 서비스

- KakaoTalk OG 크롤러·OG 이미지 CDN — 캐시 사이드이펙트만 발생. 무효화 공식
  API 없음. POC 범위에서는 수용.

## Design

### C1. 라우트 리팩토링 (α)

- `page.tsx` 진입부의 `redirect('/login?next=...')`를 제거.
- `await supabase.auth.getUser()` 결과의 `user`(null 가능)를 `AcceptForm`에
  prop으로 전달.
- 미리보기 본문(그룹명·서약서 카드)은 인증 여부와 무관하게 렌더.

### C2. AcceptForm 분기

- `user !== null`: 기존 동작 유지(수락 버튼 → Server Action 호출).
- `user === null`: "로그인하고 참여하기" 버튼만 표시. 클릭 시
  `/login?next=/invite/{token}`로 client-side 이동. **왜**: 로그인 후 callback
  분기(`#53`에서 복원)가 next 파라미터로 invite로 복귀 → 자동 재진입.

### C3. `generateMetadata`

- `page.tsx`에 `export async function generateMetadata({ params })` 추가.
- 내부에서 `fetchInvitePreview(token)` 1회 호출 — Next.js가 같은 요청 내
  중복 호출을 자동 dedup하므로 RSC 본문 호출과 합산 1회.
- 반환:
  - `openGraph.title` · `openGraph.description` · `openGraph.images`
  - `openGraph.siteName: "from. with"`
  - `twitter.card: "summary_large_image"`
  - `robots: { index: false, follow: false }` — **왜**: 토큰은 bearer
    시크릿이라 검색엔진 인덱싱 차단

### C4. `opengraph-image.tsx` (Edge runtime, 1200×630)

- `export const runtime = "edge"` · `export const size = { width: 1200, height: 630 }`
  · `export const contentType = "image/png"`.
- 풀블리드 그라데이션 `linear-gradient(135deg, #8AA4FF 0%, #BCA6FF 50%, #FFB6C6 100%)`
  — `src/components/ui/share-card.tsx`와 동일.
- 좌상단 "FROM. WITH" 워드마크 (Pretendard Bold, 추적 0.05em).
- 중앙 hook: `{groupName ?? "친구"}이 같이\n운동하자고 해요` (대형 타이포).
- 하단 보조: `{challengeTitle} · {durationDays}일 · 주 {goalCount}회`.
  `pendingChallenge`가 null이면 보조 행 자체를 숨김.
- 폰트: `new URL("/fonts/PretendardVariable.woff2", request.url)`로 fetch해
  satori에 주입.
- `fetchInvitePreview`가 null/expired/full을 반환해도 폴백 데이터로 같은 템플릿
  렌더 ("친구가 같이 …"). **왜**: 템플릿 1개 유지 — POC 유지보수 비용 최소화.
- 이미지에 **벌금·인원수는 제외**. **왜**: 토큰 보유자에게도 OG에서는 노출
  최소화.

### C5. 카드 텍스트 워딩

- `og:title` = 이미지 hook과 동일 — `{groupName}이 같이 운동하자고 해요`.
  **왜**: 이미지 미표시·접근성 모드 클라이언트의 안전망.
- `og:description` = `{challengeTitle} · {durationDays}일 · 주 {goalCount}회 ·
탭해서 함께 시작하기`.
- `pendingChallenge`가 null이면 description = "탭해서 그룹에 참여하기".
- `og:site_name` = "from. with".

### C6. 캐싱

- OG 이미지 응답에 `Cache-Control: public, max-age=3600, s-maxage=86400` 헤더.
  **왜**: 토큰이 unique key라 동일 토큰 재크롤링이 발생해도 안전. TTL 72h 대비
  s-maxage 1일은 충분히 짧고 충분히 적극적.

## Alternatives Considered

- **β. `/i/[token]` public 프리뷰 라우트 신설**: redirect 체인이 길어지고 최근
  `#53`(매직링크 next 파라미터 회귀)에서 다친 영역을 다시 만짐. 또 기존에 카톡으로
  뿌려진 `/invite/{token}` 링크는 OG 안 나오는 채로 남음. — 기각.
- **상태별 OG 템플릿 3종** (active / closed(만료·꽉참) / invalid): 템플릿 3배
  유지보수 대비, 카톡 미리보기 단계에서 만료/꽉참을 미리 알릴 가치가 작음 (탭
  후 페이지에서 안내). — 기각.
- **OG에 인앱 `ShareCard` 그대로 포팅 (카드-인-카드)**: 카톡이 또 카드로 감싸
  3중 frame이 됨 — 시각적으로 답답함. — 기각.
- **사전 렌더 후 Supabase Storage 저장**: 인프라 표면 확장, 매번 createInvite
  비용. — POC에 과함, 기각.
- **콘텐츠를 브랜드 generic으로 후퇴 (Q1 옵션 A)**: 토큰별 카드의 동적 가치
  사라짐. — 기각.

## Verification

### 명령

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build  # opengraph-image route 컴파일 확인
```

### 시나리오

1. 로컬: `pnpm dev` → `/invite/{유효토큰}` **익명** 접근 → 미리보기 렌더 +
   "로그인하고 참여하기" 버튼 노출 확인.
2. 로컬: `/invite/{유효토큰}/opengraph-image`를 브라우저에서 직접 열어 1200×630
   PNG가 다운로드 됨을 확인. 페이지 `<head>`에서 `og:image` · `og:title` ·
   `og:description` · `<meta name="robots" content="noindex,nofollow">` 확인.
3. 만료 토큰 · 꽉찬 그룹 · 존재 안 하는 토큰으로 OG 엔드포인트 호출 →
   "친구가 같이 …" 폴백 템플릿 렌더 확인.
4. Vercel preview 배포 → Kakao Sharing Debugger
   `https://developers.kakao.com/tool/debugger/sharing` 에 preview URL을 붙여
   큰 카드 렌더 + 강제 재크롤링 → **스크린샷을 PR 본문에 첨부**.
5. 머지 후 본인 카톡으로 실제 공유 1회 smoke (cold-cache 첫인상 확인).

## Rollout

1. PR 머지 = dogfood. 기존에 카톡으로 뿌려진 토큰은 카톡 캐시 락인으로 빈
   미리보기 유지 (수용 — 소수의 dogfood 링크).
2. 1주 후 `invite_opened` 이벤트 추이 vs 카톡 share 시도 비율 비교.

### 롤백

`opengraph-image.tsx` 삭제 + `page.tsx`에서 `generateMetadata` 제거 + 진입
redirect 복구. 단일 커밋 revert로 즉시 회복.

## 용어집

- **bearer 시크릿**: 토큰 자체가 권한 증명인 방식. 토큰을 가진 사람은 정당한
  수신자로 간주.
- **cold-cache 첫인상**: 카톡 OG CDN이 URL을 처음 크롤링할 때의 렌더 결과 —
  이후 캐시 락인으로 며칠~몇 주 유지됨.
- **dedup (Next.js fetch dedup)**: 같은 요청 내 동일 인자 호출을 자동으로 1회로
  합치는 React/Next.js의 캐시 동작.
- **Edge runtime**: Vercel Edge에서 실행되는 경량 V8 런타임. Node API 일부 제한.
- **OG (Open Graph)**: Facebook이 만든 링크 미리보기 메타 표준. 카톡·트위터·
  슬랙 등이 동일 태그를 읽음.
- **RLS (Row Level Security)**: Postgres 행 단위 접근 제어. with-key는
  전 테이블 ON.
- **satori**: `next/og` 내부 렌더 엔진. JSX → SVG → PNG.
- **service_role**: Supabase의 RLS 우회 키. 서버 전용.
- **α 리팩토링**: `/invite/[token]` 진입 시 redirect를 제거하고 미리보기를
  익명에게도 렌더하는 본 spec의 핵심 구조 변경.
