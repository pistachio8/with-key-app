---
spec: 2026-05-21-recap-invitation-design
title: Recap 정산 페이지 청첩장 리디자인
author: pistachio8
date: 2026-05-21
status: draft
---

## Summary

챌린지가 종료(`status = 'closed'`)된 뒤 진입하는 정산 페이지(`/challenge/[id]/recap`)를 모바일 청첩장 톤(살구·아이보리·세리프 헤딩)으로 리디자인한다. 본문은 4개 섹션으로 재구성: 청첩장 헤더 · 그룹 인증 사진 갤러리(3열 그리드 + 라이트박스) · 전체 멤버 명단(MVP에 황금 왕관) · 그룹 등록 계좌. 본인 정산 금액과 결과 공유 액션은 청첩장 톤 위·아래에 별도 카드로 분리해 톤 일관성과 정보 명확성을 동시에 확보한다. 외부 공유는 1080×1080 정사각 PNG 카드를 Next.js `ImageResponse`로 즉시 생성해 Web Share API(또는 다운로드 폴백)로 전달한다.

recap 페이지는 영구 접근 가능(`/recap` 단축 redirect · 챌린지 상세 ended-banner · `/me/challenges` 종료 액션) — 청첩장 메타포가 "지나간 N일의 기록"으로 자연스럽게 부합.

## Why

- 현재 recap은 표 형태 통계 위주라 챌린지 종료 회고의 감정·정서가 약하다. 청첩장 메타포로 "함께한 N일의 기록"이라는 정서를 추가한다.
- 인증 사진이 데이터로는 쌓이는데 정산 화면에서 보이지 않는다. 사진 갤러리 추가로 잠긴 가치 노출.
- 정산 계좌 정보가 정보 카드 한 줄로만 존재한다. 멤버 명단·계좌·기간을 하나의 "지난 약속" 단위로 묶어 가독성·기억 가치 ↑.
- 외부(메신저·SNS) 공유는 현재 텍스트 메시지(Web Share)뿐이라 미리보기 부재. 텍스트 중심 PNG 카드로 보강.

## Impact Scope

### 변경 경로

- **신규**:
  - `src/app/(app)/challenge/[id]/recap/_components/invitation-header.tsx`
  - `src/app/(app)/challenge/[id]/recap/_components/photo-gallery.tsx` (client — lightbox)
  - `src/app/(app)/challenge/[id]/recap/_components/member-roster.tsx`
  - `src/app/(app)/challenge/[id]/recap/_components/settlement-account.tsx`
  - `src/app/(app)/challenge/[id]/recap/_components/my-penalty-card.tsx` (기존 `recap-end-card` + `recap-stats-row` 흡수)
  - `src/app/(app)/challenge/[id]/recap/_components/share-card-action.tsx` (기존 `recap-actions` 흡수 + PNG 다운로드)
  - `src/lib/db/reads/challenge-photos.ts` (`fetchChallengePhotos`)
  - `src/app/api/og/recap-card/route.ts` (Next.js `ImageResponse`, Node runtime)
  - `docs/adr/0014-route-handler-binary-response.md` (가드레일 확장 결정)

- **수정**:
  - `src/app/(app)/challenge/[id]/recap/page.tsx` (새 컴포넌트로 재구성, `Promise.all`로 사진 fetch 병렬화)
  - `src/app/(app)/challenge/[id]/recap/_components/account-inline-prompt.tsx` (살구 톤만 교체, props/로직 미변경)
  - `docs/mockups/2026-05-14-ui-revision.html` (§11-C, §11-D frame 추가 — **이미 적용**)

- **폐기**:
  - `recap-hero.tsx` · `recap-hero.spec.tsx`
  - `recap-members-list.tsx` · `recap-members-list.spec.tsx`
  - `recap-end-card.tsx`
  - `recap-stats-row.tsx`
  - `recap-actions.tsx`

### src/ 영향

- 정산 페이지 라우트 1개, 컴포넌트 6개 신규 + 1개 톤 교체 + 5개 폐기.
- `fetchRecap`(`src/lib/db/reads/recap.ts`) **변경 없음** — 기존 fetcher의 데이터 contract 그대로 사용.

### Supabase / RLS / migration 영향

- **없음.** 사진 read는 기존 `actions`/`action_photos` RLS 정책이 그룹 멤버만 허용 → 자연 가드. signed URL 발급은 기존 `getPhotoSignedUrls(paths)` 재사용. 새 테이블·정책 추가 X.

### 외부 서비스

- **없음.** OpenAI · Web Push 비관련. `ImageResponse`는 Next.js 내장.

## Design

### 페이지 세로 흐름 (max-w-screen-sm)

```
┌── AccountInlinePrompt ────────────┐  오너 & 계좌 미등록일 때만, 살구 톤
├── MyPenaltyCard ──────────────────┤  본인 정산액 + 달성률 (with-key 톤)
│   ┌──────────────────────────────┐ │
│   │ InvitationHeader             │ │  ─┐
│   │ PhotoGallery (0장이면 숨김)  │ │   │  살구·아이보리 본문 4섹션
│   │ MemberRoster                 │ │   │  (청첩장 톤)
│   │ SettlementAccount            │ │  ─┘
│   └──────────────────────────────┘ │
├── ShareCardAction ────────────────┤  결과 공유 + 공유 카드 PNG (with-key 톤)
└────────────────────────────────────┘
```

청첩장 톤은 본문 4섹션에만 적용. 액션·개인 통계는 with-key 메인 톤 유지 — 톤 일관성 확보와 본인 정보 명확성을 동시에. **왜**: 청첩장 톤에 ₩X 같은 명확한 수치를 섞으면 가독성 ↓, 본문 분리로 회고 영역과 액션 영역을 정신적으로 분리.

### 컴포넌트 분해

#### C1. `InvitationHeader` (server)

```ts
type Props = { groupName: string; title: string; startAt: string; endAt: string; durationDays: number };
```

- 자동 카피: `"<groupName>의 <title>, 그 <durationDays>일의 기록"`. 추가 사용자 편집 X — POC 범위.
- 톤: 살구 eyebrow(uppercase, letter-spacing .35em) + serif 타이틀 + 기간 한 줄(`YYYY · MM · DD — MM · DD`).

#### C2. `PhotoGallery` (client — lightbox `Dialog` 때문)

```ts
type Props = { photos: ReadonlyArray<{ id: string; signedUrl: string; takenAt: string; ownerDisplayName: string }> };
```

- `photos.length === 0` → `null` 반환 (섹션 숨김).
- 3열 그리드, `aspect-square`, `loading="lazy"`, `next/image` 사용.
- 탭 → shadcn `Dialog`로 풀스크린 1장 + 작성자·`takenAt` 캡션. 좌·우 스와이프 / 자동재생 / 인접 사진 미리보기 **없음** — 가벼움 유지.

#### C3. `MemberRoster` (server)

```ts
type Props = { members: ReadonlyArray<{ displayName: string; isMvp: boolean }> };
```

- 청첩장식 정렬: 2명씩 `A · B`, `C · D` 줄. 모바일 좁아지면 줄바꿈 자연 흐름.
- `isMvp` true면 이름 옆에 `<Crown />` (lucide-react, 11~12px, `text-amber-700` 또는 `--invite-gold`).
- 달성·미달성 차이 시각화 **없음** — 사용자 합의(전체 멤버 동일 표시).

#### C4. `SettlementAccount` (server)

```ts
type Props = { bankCode: string | null; holder: string | null; last4: string | null };
```

- 세 값 모두 채워지면 `"<은행명> ***-****<last4> · <holder>"` 한 줄 카드.
- 하나라도 비면 `null` 반환 — 안내 책임은 위쪽 `AccountInlinePrompt`.

#### C5. `MyPenaltyCard` (server, 기존 `RecapEndCard` + `RecapStatsRow` 흡수)

```ts
type Props = { doneCount: number; goalCount: number; viewerAchieved: boolean; viewerPerHeadPenalty: number; totalPenalty: number };
```

- 달성: "축하해요! 정산할 금액 없음" + 달성률 바.
- 미달성: 큰 `₩X` + 진행도(`<doneCount> / <goalCount>회`) + 진행 바.
- 톤: with-key 메인 (`--primary` 등). 청첩장 톤 X.

#### C6. `ShareCardAction` (client, 기존 `RecapActions` 흡수 + PNG 다운로드)

```ts
type Props = { challengeId: string; shareMessage: string };
```

- 버튼 2개:
  - `[결과 공유]` — 기존 `navigator.share({ title, text })` + 클립보드 폴백 그대로.
  - `[공유 카드 저장]` — `fetch('/api/og/recap-card?challengeId=...')` → Blob 응답.
    - Web Share API + `files` 지원 시 `navigator.share({ files: [pngFile] })`로 SNS 첨부.
    - 미지원 시 `URL.createObjectURL(blob)` + `<a download>` 트리거로 폴백.

### PNG 카드 API 라우트

**`src/app/api/og/recap-card/route.ts`**

- Runtime: **Node** (Edge 아님 — Supabase auth helpers·signed URL 호환).
- 입력: `searchParams.challengeId`.
- 가드:
  1. 세션 확인 (`createClient()` → `auth.getUser()`) → 미인증 401.
  2. `fetchRecap(userId, { challengeId })` 호출 — RLS 통과(=멤버) + `status === 'closed'`이 아니면 403/404 처리.
- 응답: `ImageResponse(<RecapShareCard ... />, { width: 1080, height: 1080 })`.
- 헤더: `Cache-Control: private, max-age=300` (5분 — closed 후 데이터 변동 적음).
- 폰트: Pretendard ttf를 `fonts: [{ name, data, weight, style }]` 옵션에 등록(서버에서 `fs.readFile`). **왜**: `ImageResponse` 기본 폰트는 영문, 한글 없으면 사각형으로 깨짐.

PNG 콘텐츠 (정사각 1080×1080, 텍스트 중심) — 시각 명세는 `docs/mockups/2026-05-14-ui-revision.html` §11-D를 SoT로 한다:

- 상단: `with-key` eyebrow + 청첩장 카피 (serif italic)
- 중앙: 멤버 명단 (왕관 포함)
- 하단: 그룹 계좌 일부 + 챌린지 기간

사진은 미포함 — signed URL 외부 fetch + 이미지 처리 비용 회피. POC 범위 보호.

### 데이터 흐름

```ts
// src/lib/db/reads/challenge-photos.ts
export type RecapPhotoView = {
  id: string;
  signedUrl: string;
  takenAt: string;
  ownerDisplayName: string;
};

export async function fetchChallengePhotos(
  client: SupabaseClient,
  args: { challengeId: string },
): Promise<ReadonlyArray<RecapPhotoView>>;
```

- 쿼리: `actions` → `inner join users(display_name)` → `inner join action_photos(photo_path)`. `where challenge_id = $1 and photo_path is not null order by created_at asc`.
- signed URL: 기존 `getPhotoSignedUrls(paths)` 재사용.
- 페이지네이션 없음(POC 가정 ≤ ~100장). 200장 이상은 후속 이슈.

`page.tsx`:
```ts
const [recap, photos] = await Promise.all([
  fetchRecap(user.id, { challengeId }),
  fetchChallengePhotos(supabase, { challengeId }),
]);
```

### 엣지 케이스

| 케이스 | 처리 |
|---|---|
| `recap.status === 'active'` | 기존 "아직 결과가 없어요" 빈 상태 유지 (page.tsx 기존 로직) |
| 사진 0장 | `PhotoGallery` null — 헤더→divider→멤버 흐름 자연스럽게 |
| 일부 signed URL 발급 실패 | 발급된 사진만 표시 + 메타 로그(`fallback: true`). UI에 에러 표시 X |
| 멤버 1명 (혼자 챌린지) | 청첩장 본문 4섹션 렌더 X (`recap-hero`의 `isSolo` 동작과 동등) — `MyPenaltyCard`만 |
| 계좌 미등록 | 위 `AccountInlinePrompt`만, 아래 `SettlementAccount` null |
| 챌린지 멤버 아닌 사용자 | RLS로 차단 → 기존 빈 상태 |
| 정산 완료 상태 | **이번 스코프 X**. 시간 지난 청첩장에서도 PNG/공유·금액 노출 동일. 후속 이슈로 추적 |

### 가드레일 처리

- **`src/app/api/*`는 외부 콜백 전용** (AGENTS.md §아키텍처) 가드와 충돌 → **ADR-0014 작성**: 바이너리 응답(이미지·파일) Route Handler 허용 예외 + 적용 조건 명문화.
- `MyPenaltyCard`는 기존 컴포넌트의 SoT 이동 — 데이터 contract(`viewerPerHeadPenalty` 계산 등)는 `fetchRecap` 그대로 유지.
- 키워드 풀·AnalyticsEvent·Supabase migration 변경 없음.

## Alternatives Considered

### 접근법 A — 최소 변경 (톤만 교체)

- **Pros**: 변경 면적 최소, 기존 테스트 그대로, 롤백 비용 0.
- **Cons**: 청첩장 메타포 약함 — "예쁜 recap"으로 그침. 구조(사진/멤버/계좌 흐름)가 청첩장처럼 안 읽힘.
- **Why not**: 사용자 요청의 핵심("청첩장처럼")이 시각 메타포 + 구조 둘 다라 톤 교체만으로는 의도 미충족.

### 접근법 B — 완전 교체 (기존 6개 전부 폐기)

- **Pros**: 청첩장 의도 가장 명확, 섹션 단위 코드 정리.
- **Cons**: 기존 6개 폐기 + 테스트 5개 폐기. 검증된 정산 계산 로직(`viewerPerHeadPenalty`·달성 판정) 재구현 → 회귀 위험. POC 대비 코드 증가폭 큼.
- **Why not**: 본인 정산 카드 영역은 청첩장 톤에 어울리지 않아 어차피 with-key 톤 유지 — 기존 컴포넌트 흡수가 더 자연스러움.

### 접근법 C — 하이브리드 (채택)

- 청첩장 본문은 신규 컴포넌트로 명확히 살리고, 본인 정산 카드는 기존 컴포넌트 흡수.
- `fetchRecap` 그대로 → 데이터 contract 안정성.

### Story 형식 (인스타·릴스) — 사용자 검토 후 제외

- POC 범위 초과(자동재생 타이머·일시정지·세로 스와이프 라이브러리). 사용자 합의로 제외.

### 외부 공유: 공개 URL(토큰 기반) vs PNG 카드

- 공개 URL 방식은 RLS 우회 + 공유 토큰 수명·소멸 정책·외부 인덱싱 위험을 동반.
- PNG 카드는 그룹 멤버가 자기 권한 내에서 카드 1장만 외부로 내보내는 흐름 — 데이터 노출 최소.

## Risks

- 청첩장 톤이 **미달성자 다수**(예: 4명 중 3명 미달성)인 챌린지에서 정서적으로 어색할 수 있음. 검증 — Week 2 dogfood 시 미달성 다수 케이스 수동 확인.
- `ImageResponse` 한글 폰트 등록 누락 시 PNG 카드 텍스트 사각형 깨짐. **방지**: Pretendard ttf 서버 로드 + 단위 테스트로 응답 헤더 + size 검증.
- 사진 100장 초과 시 단일 페이지 lazy 이미지로 초기 paint·메모리 부담. **방지**: 후속 이슈 — 사용자 평균 사진 수 모니터링 후 페이지네이션.
- 시간이 지난 청첩장에서 "₩X 정산하세요"가 계속 노출 → 정산 완료된 사용자에게 노이즈. **방지**: 후속 이슈로 정산 완료 상태 추적.

## Open Questions

- Web Share API에서 `files` 배열이 미지원되는 브라우저 비율(특히 모바일 Safari iOS 15 이전). 측정 후 폴백 동선 강화 여부.
- 사진 lazy load 임계값(현재 브라우저 기본). 데이터 수집 후 튜닝.

## Validation

```bash
pnpm typecheck
pnpm lint
pnpm test
```

- Vitest unit: `fetchChallengePhotos` 정렬·null photo_path 제외·signed URL 매핑.
- Vitest component: `PhotoGallery`(0장 → null, N장 그리드), `MemberRoster`(MVP 왕관·줄 정렬), `SettlementAccount`(null 가드), `MyPenaltyCard`(달성·미달성 분기), `share-card-action`(PNG fetch · Web Share 폴백).
- Vitest integration: `/api/og/recap-card`(미인증 401, 멤버 아닌 사용자 차단, 정상 PNG `Content-Type: image/png` 응답).
- 수동(모바일 viewport, DevTools 또는 실기): closed 챌린지 진입 → 사진 탭 → 라이트박스 → 공유 카드 저장 → 한글 폰트 정상.

## Rollback

- 신규 6 컴포넌트 + 1 라우트 + 1 fetcher 삭제, 폐기된 5 컴포넌트 git revert, `recap/page.tsx`만 이전 커밋으로 복원. 데이터 변경이 없으므로 마이그레이션 롤백 X. UI 가이드 §11-C/D는 별도 commit으로 분리해 독립 롤백 가능.
