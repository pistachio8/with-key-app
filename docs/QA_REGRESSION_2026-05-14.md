# QA 회귀 매트릭스 — 2026-05-14 UI 리비전

> **이 문서의 목적**: 2026-05-14 UI 리비전(PR0~PR8 총 9개 PR)이 누적 머지된 develop 상태에서 릴리즈 직전 한 번 전 영역을 훑는 회귀 테스트 시트. 매트릭스를 따라가며 셀 단위로 Pass/Fail을 직접 체크합니다.
>
> **기준 SoT**: [`docs/mockups/2026-05-14-ui-revision.html`](./mockups/2026-05-14-ui-revision.html)이 시각·정보구조(IA)·플로우의 단일 진리원. 이 매트릭스는 모킹업 §1~§13과 1:1로 매핑되어 있습니다. 모킹업과 코드가 충돌하면 모킹업이 우선이고, PRD/BE_SCHEMA는 PR8 cleanup에서 후행 갱신됩니다.

---

## 0. 사용법

1. **언제 쓰나** — develop에 PR5·PR6·PR7이 머지된 직후, 또는 dogfood 시작 직전 1회.
2. **누가 쓰나** — 1차 PO/디자이너/QA 1명이 시트의 ⏳ 마커가 다 ✅로 바뀐 후 처음부터 끝까지 한 번.
3. **어디서 쓰나** — 기기 360px(Galaxy S 계열)·390px(iPhone 14)·414px(iPhone 14 Plus). 실기 우선, DevTools 모바일 에뮬레이션 보조.
4. **기록 방법** — 셀의 `[ ]`를 `[x]` 또는 `[FAIL: 이슈번호]`로 마킹. 이슈는 GitHub Issues에 `qa-regression-2026-05-14` 라벨로 등록.
5. **⏳ 마커** — 해당 § 화면이 아직 develop에 머지되지 않았다는 뜻. 머지 후 ✅로 바꾸고 빈 셀을 채웁니다.

### 검증 환경 (공통)

- 브라우저: iOS Safari 16+ · Chrome on Android 10+. Desktop Chrome은 보조용.
- 로컬: `pnpm dev` (`http://localhost:3000`) · Supabase 로컬(`pnpm supabase start`) 또는 staging.
- 계정 2개 필요: owner(그룹장)·non-owner(참가자). 솔로 모드 검증은 1번째 계정만.
- a11y: 키보드 Tab/Shift+Tab 순회·라벨 음독·color-contrast(axe-core PR1 기준).

---

## 1. 화면 인벤토리 (라우트 ↔ 모킹업 § ↔ 구현 PR)

| 모킹업 § | 화면 | 라우트 | 구현 PR | develop 상태 |
|---|---|---|---|---|
| §1 진입 / 온보딩 | 로그인 + 온보딩 슬라이드 | `/login` | PR3 | ✅ 머지 (#43) |
| §2 홈 | 인사·invited 배너·stats·진행 리스트·FAB | `/home` | PR4 | ✅ 머지 (#44) |
| §3 챌린지 생성 | FrequencyStepper · EndDatePicker · PenaltyPicker · 2-step wizard + 완료 시트 | `/challenge/new` | PR5 | ✅ 머지 (#45) |
| §4 외부 공유 카드 | KakaoTalk OG | `/share/[challengeId]/opengraph-image` | PR5 후속(별도) | ⏳ |
| §5 초대 참여 | progress 애니메이션 + 그룹 미리보기 + 참여 CTA | `/invite/[token]` | PR3 | ✅ 머지 (#43) |
| §6 챌린지 상세 + 서약서 | 3-탭 셸(인증 피드·현황판·정보) · StatusCard · JustJoinedBanner | `/challenge/[id]` + `/challenge/[id]/pledge` | PR5 | ✅ 머지 (#45) |
| §7 챌린지 참여 완료 | `signPledge` 성공 후 `?just_joined=1[&activated=1]` redirect + 배너 | `/challenge/[id]?just_joined=1` | PR5 | ✅ 머지 (#45) |
| §8 피드 · 현황판 | 챌린지 상세 안 2개 탭 · 카메라 FAB · 오늘 배너 | `/challenge/[id]?tab=feed\|dashboard` | PR6 | ⏳ |
| §9 초대 · 정보 | 챌린지 상세 정보 탭 + 초대 링크 시트 | `/challenge/[id]?tab=info` | PR7 | ⏳ |
| §10 인증 액션 모달 | 사진→키워드→메모→AI 일기 4-상태 슬라이드 | `/challenge/[id]/action` | PR6 | ⏳ |
| §11 종료 / 정산 | recap (성공/실패·MVP·예상 벌금) | `/challenge/[id]/recap` | PR7 | ⏳ |
| §12 관리 / 제한 | 챌린지 관리 (수정 버튼 제거 · 종료/해산만) | `/me/challenges` | PR7 | ⏳ |
| §13 알림 | 알림 목록 + 잠금화면 미리보기 + IDB 캐시 | `/notifications` | PR7 | ⏳ |

폐기된 옛 라우트 (404 또는 적절한 redirect 검증):

| 옛 라우트 | 처리 | 검증 시 확인 |
|---|---|---|
| `/feed` | 폐기 — 챌린지 상세 안 피드 탭으로 이동 | 404 또는 `/home` redirect |
| `/group/new` | 폐기 — 자동 그룹 생성 | 404 |
| `/pledge` | `/challenge/[id]/pledge` sub-route로 이동 | 옛 URL은 404 |
| `/recap` | `/challenge/[id]/recap` sub-route로 이동 | 옛 URL은 404 |
| `/action` | `/challenge/[id]/action` sub-route로 이동 | 옛 URL은 404 |
| `/settings` | `/me` redirect | 200 + `/me` 도착 |

---

## 2. 회귀 매트릭스 (모킹업 §1~§13)

**열 정의** — 6열 공통:

1. **기능 expected** — 그 화면에서 사용자가 보고 할 수 있어야 하는 핵심 결과.
2. **LES 상태** — Loading skeleton · Empty state · Error state 3가지 표시가 모두 디자인 시스템 컴포넌트(`<Skeleton>`·`<EmptyState>`·`<ErrorState>`)로 일관.
3. **반응형 360/390/414** — 세 viewport에서 잘림·겹침·터치 영역 44×44 미달 없음.
4. **권한** — owner와 non-owner(또는 anon)가 보는 화면 차이. "동일"이면 권한 분기 없음.
5. **a11y** — 키보드 Tab 도달·visible focus ring·라벨·색 대비 AA(`axe-core` 0 violations).
6. **확인자 / 스크린샷** — 검증자 이름 + 스크린샷 파일명. PR이 아직 안 머지된 § 화면은 `⏳ pending <PR번호>`.

> 셀 안의 `[ ]`는 검증자 본인이 마킹하는 체크박스. 긴 expected는 각 § 아래 "세부 계약"으로 분리되어 있습니다.

### §1 진입 / 온보딩 (`/login`, PR3 ✅)

| 차원 | 결과 |
|---|---|
| ① 기능 | `[ ]` 카카오 로그인 + 이메일 매직링크 + 온보딩 3-슬라이드 swipe |
| ② LES | `[ ]` Loading: 버튼 disabled state · `[ ]` Empty: 미적용(첫 화면) · `[ ]` Error: 매직링크 429 안내(`docs/superpowers/specs/2026-05-12-magiclink-rate-limit-resolution-design.md`) |
| ③ 360/390/414 | `[ ]` 슬라이드 인디케이터·로그인 버튼 잘림 없음 |
| ④ 권한 | anon만 접근. 로그인된 상태에서 `/login` 진입 시 `/home` redirect |
| ⑤ a11y | `[ ]` 슬라이드 키보드 좌우 화살표 이동 · `[ ]` 이메일 input `aria-label` |
| ⑥ 확인자 | `qa: ___ / shot: §1-login.png` |

#### §1 세부 계약

- 첫 진입 시 온보딩 슬라이드 3장이 자동 또는 swipe로 순환. 각 슬라이드 헤딩·일러스트·CTA 위치 모킹업과 동일.
- 카카오 로그인 CTA가 위, 이메일 매직링크가 아래. 매직링크 입력 후 "보냈어요" 토스트.
- 매직링크 클릭으로 들어온 사용자는 `/auth/callback` → `/home`. 이미 그룹/챌린지 있으면 가장 최근 active 챌린지로 redirect 안 함(홈이 SoT).
- 매직링크 rate limit(429) 시 "잠시 후 다시 시도" 안내 + Resend SMTP 폴백 메시지.

### §2 홈 (`/home`, PR4 ✅)

| 차원 | 결과 |
|---|---|
| ① 기능 | `[ ]` 인사("OOO님, 안녕하세요") · `[ ]` invited 배너(미수락 초대 시) · `[ ]` stats 4컬럼 · `[ ]` 진행 챌린지 리스트 · `[ ]` 중앙 FAB + → `/challenge/new` |
| ② LES | `[ ]` Skeleton: stats/list `<Skeleton>` · `[ ]` Empty: "아직 챌린지가 없어요" + CTA · `[ ]` Error: `<ErrorState>` "다시 불러오기" |
| ③ 360/390/414 | `[ ]` stats 4컬럼 360px에서 줄바꿈 없음 · `[ ]` FAB 60×60 안전 영역 |
| ④ 권한 | authenticated만. anon이면 `/login` redirect |
| ⑤ a11y | `[ ]` FAB `aria-label="새 챌린지 만들기"` · `[ ]` invited 배너 announce(`role="status"`) |
| ⑥ 확인자 | `qa: ___ / shot: §2-home.png` |

#### §2 세부 계약

- AppHeader 좌: 알림 아이콘(unread badge), 우: 마이 아이콘. BottomNav 없음(PR2 폐기).
- stats 4컬럼: 활성 챌린지 수 · 진행 중 인증 누적 · 응원 받은 수 · 누적 벌금. 0일 때도 0으로 표시(Empty 아님).
- invited 배너는 `challenge_participants.signed_at IS NULL`인 챌린지가 있을 때만 노출. 탭 시 해당 챌린지 `/challenge/[id]/pledge`로.
- FAB 클릭 시 솔로 사용자도 그룹 생성 없이 바로 `/challenge/new` (ADR-0003 자동 그룹).
- 진행 리스트 카드는 챌린지 상태(D-1, 인증 대기, 종료 임박)와 진행률 표시.

### §3 챌린지 생성 (`/challenge/new`, PR5 ✅ #45)

| 차원 | 결과 |
|---|---|
| ① 기능 | `[ ]` 제목(1~30자) · `[ ]` FrequencyStepper(주 1~7회, 기본 3) · `[ ]` EndDatePicker(7~90일, 기본 7일) · `[ ]` PenaltyPicker(0~10,000원, 1,000원 단위, **0원 허용**) · `[ ]` 서약서 미리보기 · `[ ]` 생성 → `/challenge/[id]/pledge` |
| ② LES | `[ ]` Loading: 제출 중 버튼 spinner · `[ ]` Empty: 미적용 · `[ ]` Error: zod 메시지 inline + 서버 5xx 시 토스트 |
| ③ 360/390/414 | `[ ]` PenaltyPicker stepper 터치 44×44 · `[ ]` EndDatePicker 캘린더 셀 잘림 없음 |
| ④ 권한 | authenticated. anon이면 `/login` |
| ⑤ a11y | `[ ]` 각 input `<label>` 연결 · `[ ]` 캘린더 키보드 좌우/Enter · `[ ]` 에러 메시지 `aria-live` |
| ⑥ 확인자 | `qa: ___ / shot: §3-new.png` |

#### §3 세부 계약

- **PR5(#45) 구현 형태**: 2-step wizard (기본 정보 → 서약 미리보기 + PledgeSigningCanvas) + CreationCompleteSheet (clipboard + Web Share API).
- **벌금 0원 허용** (D-007 + #58): PenaltyPicker 4-pill(없음/3천/5천/만원). zod validator(`min(0)`)와 DB CHECK(`BETWEEN 0 AND 10000`) 모두 정합 — `supabase/migrations/0025_penalty_allow_zero.sql`이 PR #45와 함께 머지되어 0원 입력 시 23514 에러 없음.
- **기간** (ADR-0004): EndDatePicker 3-preset pill + `react-day-picker` 캘린더. 최소 7일·최대 90일.
- **그룹 자동 생성** (ADR-0003): `createChallenge` Server Action이 `groupId` 미제공 시 `create_group_with_owner` RPC로 "{displayName}님과 친구들" 그룹 자동 생성. 솔로(1인)도 동일 화면에서 동일하게 생성.
- **`/group/new` 폐기**: 옛 라우트는 `/challenge/new`로 redirect.
- 생성 직후 owner 본인 자가 서명 → `sign_and_maybe_activate` RPC. 그룹이면 wizard step 3에서 invite URL 단일 round-trip.

### §4 외부 공유 카드 (`/share/[challengeId]/opengraph-image`, PR5 후속 ⏳)

| 차원 | 결과 |
|---|---|
| ① 기능 | `[ ]` Next.js OG 이미지 생성: 그룹명·챌린지 제목·기간·주N회·벌금·"참여하기" 버튼 |
| ② LES | `[ ]` Loading: KakaoTalk 큐레이션 중 placeholder · `[ ]` Empty: 미적용 · `[ ]` Error: 만료/없는 challengeId 시 404 + 안내 |
| ③ 360/390/414 | KakaoTalk 미리보기는 420×220 OG 카드 자체가 고정 비율. 카드 외부 가독성만 확인 |
| ④ 권한 | invite 토큰 + signedAt 모두 검증. 만료(72h)면 만료 카드로 |
| ⑤ a11y | OG 카드는 이미지. share 페이지 자체는 alt 텍스트 제공 |
| ⑥ 확인자 | `qa: ___ / shot: §4-share-og.png` — ⏳ pending PR5 후속(별도 PR — #45 본문 "후속" 항목) |

#### §4 세부 계약

- `src/app/share/[challengeId]/opengraph-image.tsx`로 동적 OG. font는 Pretendard subset.
- 카카오톡에서 링크 입력 → 미리보기 카드 노출까지 평균 1~3초(KakaoTalk 크롤러 캐시).
- 미리보기 클릭 시 `/invite/[token]` (별도 토큰)으로 안전 이동 — challenge id 자체에는 토큰 없음.

### §5 초대 참여 (`/invite/[token]`, PR3 ✅)

| 차원 | 결과 |
|---|---|
| ① 기능 | `[ ]` 로딩 progress 애니메이션 · `[ ]` 그룹·챌린지 미리보기 · `[ ]` 참여 CTA → 로그인 또는 직접 참여 |
| ② LES | `[ ]` Loading: progress · `[ ]` Empty: 미적용 · `[ ]` Error: 만료/중복/존재 안 함 각각 안내 |
| ③ 360/390/414 | `[ ]` progress 정렬 · `[ ]` 카드 잘림 없음 |
| ④ 권한 | anon이면 카카오 로그인 → 토큰 보존 후 자동 참여. authenticated면 즉시 참여 |
| ⑤ a11y | `[ ]` 로딩 `role="status"` · `[ ]` CTA `aria-label` |
| ⑥ 확인자 | `qa: ___ / shot: §5-invite.png` |

#### §5 세부 계약

- 토큰 만료(72h): `ERR_INVITE_EXPIRED` 카드 + "그룹장에게 새 링크 요청" 버튼.
- 같은 사용자가 두 번 수락: idempotent. "이미 참여 중인 챌린지예요" 토스트 후 `/challenge/[id]` redirect.
- 5명째 시도: `ERR_CHALLENGE_FULL` 카드 + "차단" 안내.
- 챌린지가 이미 `active`로 전이된 후 진입: `ERR_SIGN_AFTER_ACTIVE` — "이미 시작된 챌린지예요" 안내(AC-6 freeze).

### §6 챌린지 상세 + 서약서 (`/challenge/[id]` + `/challenge/[id]/pledge`, PR5 ✅ #45)

| 차원 | 결과 |
|---|---|
| ① 기능 | `[ ]` 3-탭 셸(현황판/피드/정보) · `[ ]` 미서명 시 서약서 진입 카드 · `[ ]` 도장 스탬프 IntersectionObserver 1회 · `[ ]` owner ⋯ 메뉴(해산·종료) |
| ② LES | `[ ]` Skeleton: 탭 컨텐츠 별 · `[ ]` Empty: 인증 0건 시 피드 탭 EmptyState · `[ ]` Error: 챌린지 없음 404 |
| ③ 360/390/414 | `[ ]` 탭 헤더 sticky · `[ ]` 도장 스탬프 위치 일치 |
| ④ **권한** | **owner**: ⋯ 메뉴 노출(해산·종료·수정 논의) · **non-owner**: ⋯ 메뉴 없음 · 둘 다 서명 전엔 동일 진입 |
| ⑤ a11y | `[ ]` 탭 `role="tablist"` · `[ ]` 스탬프는 `prefers-reduced-motion` 존중 |
| ⑥ 확인자 | `qa: ___ / shot: §6-detail.png · §6-pledge.png` — ⋯ 메뉴(운영자)는 PR5 후속(PR7 영역) |

#### §6 세부 계약

- 첫 진입 + 미서명 상태: 서약서 본문 + "동의하고 서명하기" CTA. 서명 시 `signed_at` 타임스탬프.
- 모든 멤버 서명 완료 → `challenges.status = 'active'` 전이 + 시작 푸시 전송(AC-5).
- 솔로 모드: 본인 1명 서명 = 즉시 `active` (ADR-0003).
- owner ⋯ 메뉴(G1 — #42·#68 구체화):
  - 챌린지 종료(`closed`로 강제 전이, 진행 데이터 보존)
  - 그룹 해산(POC 정책)
  - "수정 논의" — 정식 수정 미지원(AC-7 pending에서만), discord/카톡 안내 텍스트만
- non-owner는 ⋯ 메뉴 자체가 렌더링되지 않음(시각적 확인 + RLS 시뮬레이션).

### §7 챌린지 참여 완료 (`/challenge/[id]?just_joined=1` 배너, PR5 ✅ #45)

| 차원 | 결과 |
|---|---|
| ① 기능 | `[ ]` 서명 후 `?just_joined=1[&activated=1]` query로 `/challenge/[id]` redirect · `[ ]` JustJoinedBanner(도장 + 카피) 노출 |
| ② LES | `[ ]` Loading: 미적용(redirect 즉시) · `[ ]` Empty: 미적용 · `[ ]` Error: 서명 실패 시 폼으로 복귀 |
| ③ 360/390/414 | `[ ]` 배너·도장 카피 잘림 없음 |
| ④ 권한 | non-owner도 동일 표시. solo·activated 케이스는 `?activated=1` 추가 분기 |
| ⑤ a11y | `[ ]` JustJoinedBanner `role="status"` |
| ⑥ 확인자 | `qa: ___ / shot: §7-just-joined.png` |

#### §7 세부 계약

- 모킹업 §7은 별도 라우트 없음 — PR5(#45)에서 옛 `/pledge`(별도 인터스티셜) 폐기, `signPledge` 성공 후 `/challenge/[id]?just_joined=1[&activated=1]`로 redirect되는 형태로 통합.
- `JustJoinedBanner` 컴포넌트가 query param에 따라 카피 분기:
  - 그룹 챌린지 대기 중: "전원이 서명하면 시작됩니다"
  - solo 또는 마지막 서명자(`activated=1`): "지금부터 인증할 수 있어요"

### §8 챌린지 상세 — 피드 · 현황판 (`/challenge/[id]?tab=feed|dashboard`, PR6 ⏳)

| 차원 | 결과 |
|---|---|
| ① 기능 | `[ ]` 피드 탭: 인증 카드 리스트 · Kudos 토글(3 이모지) · 카메라 lucide FAB → `/challenge/[id]/action` · `[ ]` 현황판 탭: 멤버별 진행률 · 키워드 도넛 |
| ② LES | `[ ]` Skeleton: 카드 별 · `[ ]` Empty: 피드 0건 "첫 인증을 남겨주세요" · `[ ]` Error: 새로고침 안내 |
| ③ 360/390/414 | `[ ]` 피드 카드 padding · `[ ]` 도넛 차트 비율 유지 |
| ④ 권한 | 동일 (멤버 전원 같은 피드 조회) — RLS: non-member는 진입 자체 차단 |
| ⑤ a11y | `[ ]` Kudos 버튼 toggle state · `[ ]` 도넛 차트 텍스트 대체 |
| ⑥ 확인자 | `qa: ___ / shot: §8-feed.png · §8-dashboard.png` — ⏳ pending PR6 |

#### §8 세부 계약

- 옛 `/feed` 라우트는 폐기 — 챌린지 상세 안 피드 탭으로 흡수.
- 카메라 FAB은 화면 중앙 하단(BottomNav가 폐기되어 노치 회피 + 안전 영역).
- 오늘 배너: "오늘 인증 안 했어요" — 사용자가 미인증이고 active 챌린지인 경우 피드 상단.
- Kudos 3 이모지(🔥💪👏) — 셋 다 toggle. 같은 emoji 두 번 누르면 해제.
- RLS: 비-멤버가 challenge id 추측해 진입 시 RPC 단에서 차단 → 404 또는 "권한 없음".

### §9 챌린지 상세 — 초대 · 정보 (`/challenge/[id]?tab=info`, PR7 ⏳)

| 차원 | 결과 |
|---|---|
| ① 기능 | `[ ]` 인증 빈도 라벨(주 N회) · `[ ]` 기간 · `[ ]` 멤버 목록 + 서명 상태 · `[ ]` 초대 링크 시트(owner만 새 링크 생성) |
| ② LES | `[ ]` Skeleton: 멤버 리스트 · `[ ]` Empty: 미적용 · `[ ]` Error: 토큰 발급 실패 안내 |
| ③ 360/390/414 | `[ ]` 초대 시트 bottom-sheet 높이 |
| ④ **권한** | **owner**: "새 초대 링크" 버튼 노출 + 그룹 미적 정보 수정 진입(POC는 미지원이지만 placeholder) · **non-owner**: 링크 복사만 |
| ⑤ a11y | `[ ]` 시트 focus trap · `[ ]` 복사 버튼 announce |
| ⑥ 확인자 | `qa: ___ / shot: §9-info.png` — ⏳ pending PR7 |

#### §9 세부 계약

- 초대 링크 시트의 카메라 FAB은 §8에 비해 제거됨(모킹업 §9 헤더 "카메라 FAB 제거").
- 멤버 목록 각 행: 표시명·아바타·서명 상태(✓ or 대기). 본인 강조.
- challenge가 `closed`면 새 초대 링크 발급 차단.

### §10 인증 액션 모달 (`/challenge/[id]/action`, PR6 ⏳)

| 차원 | 결과 |
|---|---|
| ① 기능 | `[ ]` 4-상태 슬라이드: ①사진 ②운동 종류+키워드 ③메모(선택) ④AI 일기 결과 · `[ ]` 슬라이드 카운터 · `[ ]` 풀-width 등록 버튼 |
| ② LES | `[ ]` Loading: AI 일기 생성 4.5s 타임아웃 spinner · `[ ]` Empty: 풀 9개 미만 시 "다시 뽑기" 숨김 · `[ ]` Error: 사진 10MB 초과·키워드 0개·기간 외 각각 안내 |
| ③ 360/390/414 | `[ ]` 슬라이드 swipe 안정 · `[ ]` 키워드 칩 wrap |
| ④ 권한 | participant만 (`active` 챌린지 & 참여자 본인). non-member는 RLS 차단 |
| ⑤ a11y | `[ ]` 슬라이드 키보드 좌우 · `[ ]` 키워드 칩 button + `aria-pressed` · `[ ]` "다시 뽑기" 5회 한도 안내 announce |
| ⑥ 확인자 | `qa: ___ / shot: §10-action-1~4.png` — ⏳ pending PR6 |

#### §10 세부 계약

- 옛 `/action`은 `/challenge/[id]/action`으로 이동(challenge-scoped). 옛 URL은 404.
- 키워드 칩 자동 랜덤 6~9개 노출(`keywords_shown`). "다시 뽑기" 5회 한도(`keywords_reroll`).
- 키워드 4번째 탭: 첫 칩 자동 해제 + 흔들림.
- "직접 쓰고 싶어요" escape hatch — 메모만 입력 + 키워드 0이면 제출 차단(AC-2 유지).
- AI 일기 4.5s 타임아웃 + 키워드 커버리지 < 1이면 `templateFallback()` (PRD §5.3 AC-4).
- 제출 5분 이내 키워드/메모 편집(AC-7). 사진은 freeze.
- 4번째 슬라이드(AI 일기 결과) 헤더에 "다시 생성" 버튼 — 5분 이내 1회.

### §11 종료 / 정산 (`/challenge/[id]/recap`, PR7 ⏳)

| 차원 | 결과 |
|---|---|
| ① 기능 | `[ ]` 결과 카드(성공/실패·달성률) · `[ ]` MVP(최다 인증 멤버) · `[ ]` 예상 벌금(표시만) · `[ ]` 썸네일 격자 · `[ ]` "회고 공유" 카카오톡 |
| ② LES | `[ ]` Skeleton: 결과 카드 별 · `[ ]` Empty: 인증 0건이어도 카드 자체는 노출 · `[ ]` Error: 챌린지 없음 404 |
| ③ 360/390/414 | `[ ]` 썸네일 격자 3컬럼 정렬 · `[ ]` 정산 카드 메인컬러 |
| ④ 권한 | 멤버 전원 동일 표시. 외부 공유 후 비-멤버 접근 시 — `closed`이면 read-only로 보여줄지/차단할지 결정(POC: 차단) |
| ⑤ a11y | `[ ]` 결과 영역 heading 구조 · `[ ]` 썸네일 alt 텍스트 |
| ⑥ 확인자 | `qa: ___ / shot: §11-recap.png` — ⏳ pending PR7 |

#### §11 세부 계약

- 옛 `/recap`은 `/challenge/[id]/recap`로 이동.
- 챌린지 상태가 `closed`여야 진입 가능. `active`면 "아직 진행 중이에요" 안내 후 redirect.
- 예상 벌금은 표시만 — 결제 연동 없음(POC 정책).
- 카카오톡 공유는 결과 카드 OG 별도 — 또는 §4와 같은 OG image 재사용 가능(PR7에서 결정).
- 안내 문구 정리(모킹업 §11 헤더): "수고했어요·다시 도전" 메시지 톤 모킹업과 동일.

### §12 관리 / 제한 (`/me/challenges`, PR7 ⏳)

| 차원 | 결과 |
|---|---|
| ① 기능 | `[ ]` 내 챌린지 목록(진행/종료/대기 필터) · `[ ]` 각 행에서 상세로 이동 · `[ ]` **서약서 수정 버튼 제거 확인** · `[ ]` owner는 종료/해산 가능 |
| ② LES | `[ ]` Skeleton: 카드 별 · `[ ]` Empty: 0건 시 "아직 챌린지가 없어요" + 홈 CTA · `[ ]` Error: 새로고침 안내 |
| ③ 360/390/414 | `[ ]` 카드 메타 정보 줄바꿈 |
| ④ **권한** | **owner**: 종료/해산 CTA · **non-owner**: 탈퇴 CTA(POC는 grayed out도 가능) |
| ⑤ a11y | `[ ]` 필터 라디오 그룹 |
| ⑥ 확인자 | `qa: ___ / shot: §12-my-challenges.png` — ⏳ pending PR7 |

#### §12 세부 계약

- **서약서 수정 버튼 제거**(모킹업 §12 헤더): AC-7(`pending`에서만 owner 수정)은 정책상 유지하지만 UI 자체에서 진입 동선 제거. "수정 논의"는 §6의 owner ⋯ 메뉴에만.
- 진행/종료/대기 3개 필터. 기본 "진행 중".

### §13 알림 (`/notifications`, PR7 ⏳)

| 차원 | 결과 |
|---|---|
| ① 기능 | `[ ]` 알림 목록(읽음/안 읽음 구분) · `[ ]` 잠금화면 알림 미리보기 카드 · `[ ]` IDB 캐시(#1·#15) · `[ ]` 모두 읽음 처리 |
| ② LES | `[ ]` Skeleton: 행 별 · `[ ]` Empty: 0건 "아직 알림이 없어요" · `[ ]` Error: 캐시 폴백 |
| ③ 360/390/414 | `[ ]` 알림 행 카드 padding · `[ ]` 잠금화면 카드 비율 |
| ④ 권한 | authenticated 본인 알림만 (RLS) |
| ⑤ a11y | `[ ]` 안 읽음 카운트 announce · `[ ]` "모두 읽음" 버튼 confirm 패턴 |
| ⑥ 확인자 | `qa: ___ / shot: §13-notifications.png` — ⏳ pending PR7 |

#### §13 세부 계약

- IDB 캐시(#1·#15): 알림 목록은 IndexedDB로 즉시 표시 후 서버 동기화. 오프라인에서도 마지막 캐시 노출.
- Web Push 권한 요청은 §13에서 처리 — 권한 미허용 시 배너 "알림 켜기" CTA.
- Quiet Hours: 사용자 설정(`/me`의 PushSettings A10)에 따라 푸시 전송 자체가 안 됨. 시각적 검증은 어렵고 백엔드 로그로 확인.

---

## 3. 가로 검증 (모든 § 공통)

### 3.1 디자인 토큰·폰트·primitive 회귀 (PR1 기반)

- `[ ]` Pretendard Variable 폰트가 `next/font/local`로 로드되어 FOIT/FOUT 없음.
- `[ ]` `globals.css` brand 토큰·모션 토큰이 모든 화면에 적용. 임의 hex 색·임의 transition-duration 없음.
- `[ ]` `<Card>`·`<Chip>`·`<Fab>`·`<IconButton>`·`<Skeleton>`·`<EmptyState>`·`<ErrorState>`·`<ShareCard>`·`<KeywordDonut>`·`<Stamp>` 모든 primitive 사용처에서 일관.
- `[ ]` `tests/unit/tokens.spec.ts` green.

### 3.2 App-shell (PR2)

- `[ ]` BottomNav 완전히 제거됨 — `src/components/app-shell/bottom-nav.tsx` 파일 부재 확인.
- `[ ]` AppHeader 모든 `(app)` 라우트에 일관 적용. 좌 알림·우 마이.
- `[ ]` `(auth)` 라우트에는 AppHeader 없음(로그인 화면 미니멀).

### 3.3 접근성 게이트 (axe-core)

- `[ ]` `tests/a11y/foundation.spec.ts` 0 violations.
- `[ ]` PR2~7 각 새 라우트에서 axe 자동 검사 추가(또는 수동 1회).
- `[ ]` `prefers-reduced-motion` ON: 도장 스탬프·슬라이드 transition 즉시 표시(애니메이션 없이).
- `[ ]` 키보드 only로 로그인 → 홈 → 챌린지 생성 → 서명 → 인증까지 전체 핸들링 가능.

### 3.4 데이터·RLS·migration

- `[x]` `supabase/migrations/0025_penalty_allow_zero.sql` 추가 + 적용 — PR5(#45)와 함께 머지 완료. `penalty_amount BETWEEN 0 AND 10000`으로 완화, 1000원 단위 유지.
- `[ ]` anon 역할: `/login`·`/invite/[token]` 외 모든 라우트 차단 시뮬레이션.
- `[ ]` authenticated 역할: 본인이 멤버인 챌린지만 조회. 비-멤버 challenge id 추측 진입 → 차단.
- `[ ]` owner-only RPC(예: `dissolve_group`)는 non-owner가 호출 시 거부.

### 3.5 분석 이벤트 (PRD §9.1 — emit만 확인, 본 회귀는 dogfood용 보조)

| 이벤트 | 발생 §  | 확인 방법 |
|---|---|---|
| `user_signed_up` | §1·§5 | events 테이블 1행 신규 |
| `challenge_created` | §3 | events 테이블 + `penaltyAmount=0` 케이스도 포함 |
| `challenge_signed` | §6·§7 | 본인 서명 시 1건 |
| `challenge_activated` | §7 | 전원 서명 후 시작 푸시 trigger 시 |
| `action_logged` | §10 | 인증 제출 시 |
| `ai_generated` | §10 | `latencyMs < 5000` · `keywordCoverage` 포함 |
| `kudos_given` | §8 | 토글 시 |

---

## 4. 운영 체크리스트 (릴리즈 직전)

- `[ ]` `pnpm typecheck` green
- `[ ]` `pnpm lint` green
- `[ ]` `pnpm test` green
- `[ ]` `pnpm validate:docs` green
- `[ ]` `pnpm build` green (Vercel preview에서도)
- `[ ]` Supabase migration 적용 (0024 포함) — staging/prod 모두
- `[ ]` `.env.example`와 Vercel Environment Variables 동기화 확인
- `[ ]` 모킹업 ↔ 구현 시각 diff: 최소 3개 §에서 디자이너 sign-off
- `[ ]` 폐기 라우트 redirect/404 모두 확인 (§1 표 하단)

---

## 5. 참조

- 모킹업(SoT): [`docs/mockups/2026-05-14-ui-revision.html`](./mockups/2026-05-14-ui-revision.html)
- 실행 계획: [`docs/superpowers/plans/2026-05-14-ui-revision.md`](./superpowers/plans/2026-05-14-ui-revision.md)
- ADR:
  - [`docs/adr/0002-2026-05-14-ui-revision-as-sot.md`](./adr/0002-2026-05-14-ui-revision-as-sot.md) — 모킹업이 SoT
  - [`docs/adr/0003-2026-05-14-group-ux-implicit-auto-creation.md`](./adr/0003-2026-05-14-group-ux-implicit-auto-creation.md) — 그룹 자동 생성 + 솔로 정식
  - [`docs/adr/0004-2026-05-14-end-date-picker-min-week.md`](./adr/0004-2026-05-14-end-date-picker-min-week.md) — 종료일 picker + 최소 1주
- PRD: [`docs/PRD.md`](./PRD.md) (§3·§4·§5·§10) — 2026-05-15 §3.3 AC-1·AC-4 정정 반영
- BE_SCHEMA: [`docs/BE_SCHEMA.md`](./BE_SCHEMA.md) (§1 D-007·§5.5·§9 정합성·§11 Follow-up) — 2026-05-15 갱신
- 상시 동작 설명서(PR8에서 갱신 예정): [`docs/USER_SCENARIO_QA.md`](./USER_SCENARIO_QA.md)

---

## 6. 용어집

- **a11y**: accessibility — 접근성. 키보드 탐색·스크린리더·색 대비 등.
- **AC**: Acceptance Criteria — 인수 기준. PRD §3.3·§4.3·§5.3에 화면 단위로 명시.
- **ADR**: Architecture Decision Record — 되돌리기 비용이 큰 결정을 보존하는 짧은 기록.
- **AppHeader**: 화면 상단 공통 헤더. 좌 알림 아이콘·우 마이 아이콘. 2026-05-14 UI 리비전 PR2에서 BottomNav 폐기와 함께 신설.
- **axe-core**: Deque 사의 a11y 자동 검사 라이브러리. PR1에서 devDependency 추가.
- **dogfood**: 출시 전 자체 사용 테스트. with-key는 Week 2 dogfood 후 GO/NO-GO 결정.
- **FAB**: Floating Action Button — 화면 위에 떠 있는 버튼. 모킹업 §2 중앙 +.
- **IDB / IndexedDB**: 브라우저 클라이언트의 키-값 저장소. §13 알림 캐시에 사용.
- **LES**: Loading·Empty·Error 3가지 화면 상태. 디자인 시스템에 통일된 컴포넌트(`<Skeleton>`·`<EmptyState>`·`<ErrorState>`)로 표현.
- **OG / OpenGraph**: 외부 공유 시 미리보기 카드 메타데이터. `/share/[challengeId]/opengraph-image.tsx`가 동적 생성.
- **owner**: 그룹·챌린지를 생성한 사용자. `group_members.role = 'owner'`.
- **PWA**: Progressive Web App — 브라우저로 설치 가능한 웹 앱. with-key는 PWA POC.
- **Pretendard**: 한글·영문 가독성 높은 가변 폰트. 2026-05-14 UI 리비전 기본 폰트.
- **RLS**: Row Level Security — Postgres 행 단위 접근 제어. Supabase에서 활성화.
- **RSC**: React Server Component — 서버에서 렌더되는 React 컴포넌트.
- **SoT**: Single Source of Truth — 중복 정의 없이 한 곳을 기준으로 삼는 원본. UI 리비전에서는 모킹업이 SoT.
- **viewport**: 브라우저 표시 영역의 가로 폭. 본 매트릭스는 360/390/414 px 기준.

---

## 7. Google Sheets용 TSV 부록

> 본문 §2 매트릭스를 행 단위(`§ × 차원`)로 정규화한 TSV(탭 구분) 블록입니다. 아래 코드 펜스를 **통째로** 복사해 Google Sheets의 빈 셀(예: `A1`)에 paste하면 자동으로 열이 분리됩니다. 헤더 포함 81행.
>
> 사용법: GitHub 우상단 copy 버튼(또는 펜스 안 텍스트 선택) → Google Sheets → A1 클릭 → `⌘V`(Mac) / `Ctrl+V`(Windows). `Pass/Fail` 열에 `OK` / `FAIL: #이슈번호` / `N/A` 기입.
>
> 본문 §2가 갱신될 때 본 TSV도 손으로 동기화해야 합니다(drift 위험). POC 회귀 1회용이라 자동화는 보류.

```tsv
§	화면	라우트	구현 PR	차원	검증 항목 (Expected)	Pass/Fail	확인자	스크린샷	비고
§1	진입/온보딩	/login	PR3 #43	기능	카카오 로그인 + 이메일 매직링크 + 온보딩 3-슬라이드 swipe				
§1	진입/온보딩	/login	PR3 #43	LES Loading	로그인 버튼 disabled state				
§1	진입/온보딩	/login	PR3 #43	LES Error	매직링크 429 안내 + Resend SMTP fallback 메시지				
§1	진입/온보딩	/login	PR3 #43	반응형 360/390/414	슬라이드 인디케이터·로그인 버튼 잘림 없음				
§1	진입/온보딩	/login	PR3 #43	권한	anon만 접근. 로그인된 상태에서 /login 진입 시 /home redirect				
§1	진입/온보딩	/login	PR3 #43	a11y	슬라이드 키보드 좌우 화살표 이동 + 이메일 input aria-label				
§2	홈	/home	PR4 #44	기능	인사 + invited 배너 + stats 4컬럼 + 진행 리스트 + 중앙 FAB → /challenge/new				
§2	홈	/home	PR4 #44	LES Loading	stats/list Skeleton 컴포넌트				
§2	홈	/home	PR4 #44	LES Empty	"아직 챌린지가 없어요" + CTA				
§2	홈	/home	PR4 #44	LES Error	ErrorState "다시 불러오기"				
§2	홈	/home	PR4 #44	반응형 360/390/414	stats 4컬럼 360px 줄바꿈 없음 + FAB 60×60 안전 영역				
§2	홈	/home	PR4 #44	권한	authenticated만. anon이면 /login redirect				
§2	홈	/home	PR4 #44	a11y	FAB aria-label="새 챌린지 만들기" + invited 배너 role="status"				
§3	챌린지 생성	/challenge/new	PR5 #45	기능	제목(1~30자) + FrequencyStepper(주 1~7) + EndDatePicker(7~90일) + PenaltyPicker(0~10000, 0원 허용) + 서약서 미리보기 + 생성 → /challenge/[id]/pledge				
§3	챌린지 생성	/challenge/new	PR5 #45	LES Loading	제출 중 버튼 spinner				
§3	챌린지 생성	/challenge/new	PR5 #45	LES Error	zod inline + 서버 5xx 토스트 + 0원 입력 23514 미발생(0025)				
§3	챌린지 생성	/challenge/new	PR5 #45	반응형 360/390/414	PenaltyPicker stepper 터치 44×44 + EndDatePicker 캘린더 셀 잘림 없음				
§3	챌린지 생성	/challenge/new	PR5 #45	권한	authenticated. anon이면 /login				
§3	챌린지 생성	/challenge/new	PR5 #45	a11y	각 input label 연결 + 캘린더 키보드 좌우/Enter + 에러 aria-live				
§4	외부 공유 OG	/share/[challengeId]/opengraph-image	PR5 후속(별도)	기능	Next.js OG 동적 이미지: 그룹명·제목·기간·주N회·벌금·참여하기 버튼				⏳ pending
§4	외부 공유 OG	/share/[challengeId]/opengraph-image	PR5 후속(별도)	LES Error	만료/없는 challengeId 시 404 + 안내				⏳ pending
§4	외부 공유 OG	/share/[challengeId]/opengraph-image	PR5 후속(별도)	권한	invite 토큰 + signedAt 검증, 만료(72h) 카드				⏳ pending
§5	초대 참여	/invite/[token]	PR3 #43	기능	로딩 progress + 그룹·챌린지 미리보기 + 참여 CTA				
§5	초대 참여	/invite/[token]	PR3 #43	LES Loading	progress 애니메이션 role="status"				
§5	초대 참여	/invite/[token]	PR3 #43	LES Error	만료/중복/존재 안 함 각각 안내				
§5	초대 참여	/invite/[token]	PR3 #43	반응형 360/390/414	progress 정렬 + 카드 잘림 없음				
§5	초대 참여	/invite/[token]	PR3 #43	권한	anon이면 카카오 로그인 → 토큰 보존 자동 참여. authenticated 즉시 참여				
§5	초대 참여	/invite/[token]	PR3 #43	a11y	로딩 role="status" + CTA aria-label				
§6	챌린지 상세 + 서약서	/challenge/[id]	PR5 #45	기능	3-탭 셸(인증 피드/현황판/정보) + StatusCard + 미서명 시 서약서 진입 + 도장 스탬프				
§6	챌린지 상세 + 서약서	/challenge/[id]	PR5 #45	LES Loading	탭 컨텐츠별 Skeleton				
§6	챌린지 상세 + 서약서	/challenge/[id]	PR5 #45	LES Empty	피드 탭 인증 0건 EmptyState				
§6	챌린지 상세 + 서약서	/challenge/[id]	PR5 #45	LES Error	챌린지 없음 404				
§6	챌린지 상세 + 서약서	/challenge/[id]	PR5 #45	반응형 360/390/414	탭 헤더 sticky + 도장 스탬프 위치 일치				
§6	챌린지 상세 + 서약서	/challenge/[id]	PR5 #45	권한 owner	⋯ 메뉴 노출 (해산·종료·수정 논의)				PR5 후속(PR7 영역)
§6	챌린지 상세 + 서약서	/challenge/[id]	PR5 #45	권한 non-owner	⋯ 메뉴 미렌더링				
§6	챌린지 상세 + 서약서	/challenge/[id]	PR5 #45	a11y	탭 role="tablist" + 도장 prefers-reduced-motion 존중				
§7	참여 완료 배너	/challenge/[id]?just_joined=1	PR5 #45	기능	signPledge 후 ?just_joined=1[&activated=1] redirect + JustJoinedBanner				
§7	참여 완료 배너	/challenge/[id]?just_joined=1	PR5 #45	LES Error	서명 실패 시 폼으로 복귀				
§7	참여 완료 배너	/challenge/[id]?just_joined=1	PR5 #45	반응형 360/390/414	배너·도장 카피 잘림 없음				
§7	참여 완료 배너	/challenge/[id]?just_joined=1	PR5 #45	권한	non-owner 동일. solo·activated 케이스는 ?activated=1 분기				
§7	참여 완료 배너	/challenge/[id]?just_joined=1	PR5 #45	a11y	JustJoinedBanner role="status"				
§8	피드·현황판	/challenge/[id]?tab=feed|dashboard	PR6	기능	피드: 인증 카드 + Kudos 3 이모지 토글 + 카메라 FAB → /action. 현황판: 멤버별 진행률 + 키워드 도넛				⏳ pending
§8	피드·현황판	/challenge/[id]?tab=feed|dashboard	PR6	LES Empty	피드 0건 "첫 인증을 남겨주세요"				⏳ pending
§8	피드·현황판	/challenge/[id]?tab=feed|dashboard	PR6	반응형 360/390/414	피드 카드 padding + 도넛 차트 비율 유지				⏳ pending
§8	피드·현황판	/challenge/[id]?tab=feed|dashboard	PR6	권한	멤버 동일. RLS: non-member 진입 차단				⏳ pending
§8	피드·현황판	/challenge/[id]?tab=feed|dashboard	PR6	a11y	Kudos 버튼 toggle state + 도넛 차트 텍스트 대체				⏳ pending
§9	초대·정보 탭	/challenge/[id]?tab=info	PR7	기능	인증 빈도 라벨 + 기간 + 멤버 목록(서명 상태) + 초대 링크 시트				⏳ pending
§9	초대·정보 탭	/challenge/[id]?tab=info	PR7	LES Loading	멤버 리스트 Skeleton				⏳ pending
§9	초대·정보 탭	/challenge/[id]?tab=info	PR7	LES Error	토큰 발급 실패 안내				⏳ pending
§9	초대·정보 탭	/challenge/[id]?tab=info	PR7	반응형 360/390/414	초대 시트 bottom-sheet 높이				⏳ pending
§9	초대·정보 탭	/challenge/[id]?tab=info	PR7	권한 owner	"새 초대 링크" 버튼 노출				⏳ pending
§9	초대·정보 탭	/challenge/[id]?tab=info	PR7	권한 non-owner	링크 복사만 노출				⏳ pending
§9	초대·정보 탭	/challenge/[id]?tab=info	PR7	a11y	시트 focus trap + 복사 버튼 announce				⏳ pending
§10	인증 액션 모달	/challenge/[id]/action	PR6	기능	4-상태 슬라이드: 사진 → 운동 종류+키워드 → 메모 → AI 일기. 슬라이드 카운터 + 풀-width 등록 버튼				⏳ pending
§10	인증 액션 모달	/challenge/[id]/action	PR6	LES Loading	AI 일기 4.5s 타임아웃 spinner				⏳ pending
§10	인증 액션 모달	/challenge/[id]/action	PR6	LES Error	사진 10MB 초과·키워드 0개·기간 외 각각 안내				⏳ pending
§10	인증 액션 모달	/challenge/[id]/action	PR6	반응형 360/390/414	슬라이드 swipe 안정 + 키워드 칩 wrap				⏳ pending
§10	인증 액션 모달	/challenge/[id]/action	PR6	권한	participant만 (active 챌린지). non-member RLS 차단				⏳ pending
§10	인증 액션 모달	/challenge/[id]/action	PR6	a11y	슬라이드 키보드 좌우 + 키워드 칩 aria-pressed + 다시 뽑기 5회 한도 announce				⏳ pending
§11	종료/정산 recap	/challenge/[id]/recap	PR7	기능	결과 카드(성공/실패·달성률) + MVP + 예상 벌금 표시만 + 썸네일 격자 + 카카오 공유				⏳ pending
§11	종료/정산 recap	/challenge/[id]/recap	PR7	LES Empty	인증 0건이어도 카드 노출				⏳ pending
§11	종료/정산 recap	/challenge/[id]/recap	PR7	LES Error	챌린지 없음 404				⏳ pending
§11	종료/정산 recap	/challenge/[id]/recap	PR7	반응형 360/390/414	썸네일 격자 3컬럼 + 정산 카드 메인컬러				⏳ pending
§11	종료/정산 recap	/challenge/[id]/recap	PR7	권한	멤버 동일. closed 상태에서만 진입				⏳ pending
§11	종료/정산 recap	/challenge/[id]/recap	PR7	a11y	결과 heading 구조 + 썸네일 alt 텍스트				⏳ pending
§12	챌린지 관리	/me/challenges	PR7	기능	내 챌린지 목록(진행/종료/대기 필터) + 상세 진입 + 서약서 수정 버튼 제거 확인 + owner 종료/해산				⏳ pending
§12	챌린지 관리	/me/challenges	PR7	LES Empty	0건 "아직 챌린지가 없어요" + 홈 CTA				⏳ pending
§12	챌린지 관리	/me/challenges	PR7	반응형 360/390/414	카드 메타 정보 줄바꿈				⏳ pending
§12	챌린지 관리	/me/challenges	PR7	권한 owner	종료/해산 CTA 노출				⏳ pending
§12	챌린지 관리	/me/challenges	PR7	권한 non-owner	탈퇴 CTA (POC는 grayed out 허용)				⏳ pending
§12	챌린지 관리	/me/challenges	PR7	a11y	필터 라디오 그룹				⏳ pending
§13	알림	/notifications	PR7	기능	알림 목록(읽음/안 읽음) + 잠금화면 미리보기 + IDB 캐시(#1·#15) + 모두 읽음				⏳ pending
§13	알림	/notifications	PR7	LES Empty	0건 "아직 알림이 없어요"				⏳ pending
§13	알림	/notifications	PR7	LES Error	캐시 폴백				⏳ pending
§13	알림	/notifications	PR7	반응형 360/390/414	알림 행 카드 padding + 잠금화면 카드 비율				⏳ pending
§13	알림	/notifications	PR7	권한	authenticated 본인 알림만 (RLS)				⏳ pending
§13	알림	/notifications	PR7	a11y	안 읽음 카운트 announce + "모두 읽음" confirm 패턴				⏳ pending
가로	디자인 토큰·primitive	-	PR1 #38	기능	Pretendard 폰트 FOIT/FOUT 없음 + brand 토큰 일관 + 모든 primitive 사용처 일관 + tokens.spec green				
가로	App-shell	-	PR2 #39	기능	BottomNav 제거 + AppHeader 모든 (app) 라우트 일관 + (auth) 라우트엔 미적용				
가로	접근성 게이트	-	PR1+	a11y	axe-core 0 violations + prefers-reduced-motion 존중 + 키보드 only 전체 플로우				
가로	RLS·migration	-	-	권한	0025_penalty_allow_zero 적용 + anon/authenticated/owner 차단 검증				
```
