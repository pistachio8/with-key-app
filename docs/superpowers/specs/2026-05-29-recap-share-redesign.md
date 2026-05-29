---
spec: 2026-05-29-recap-share-redesign
title: 정산(recap) 페이지 공유하기 재설계 — 루틴 흔적 영상·카드(4:5)
author: pistachio8
date: 2026-05-29
status: in-progress
---

> **진행 상태 (2026-05-29 기준 · 코드 커밋 `e2c459d`)**
>
> 이 스펙은 재설계 전체(영상 + 정적 카드 2종)의 SoT 다. 구현은 단계적이며 현재 상태는:
>
> - **✅ Phase 1a 완료(`e2c459d`)** — 정적 카드 2종(사진형·티켓형 토글) · 계좌/예금주/멤버 실명/벌금 제거 · 게이팅 정합 · 4:5(1080×1350) · `shareMessage` 톤 정리.
> - **⏳ Phase 1b 예정** — 영상 클립(2~3초 MP4). 상세 계획 [`../plans/2026-05-29-recap-share-clip-video.md`](../plans/2026-05-29-recap-share-clip-video.md). **spike 통과를 빌드 전제로 함.**
> - **🔮 Phase 1c 예정** — `recap_shared` 계측 · SNS opt-in · 멤버 사진 opt-out.
>
> 아래 §Why 의 프라이버시·게이팅·톤 문제는 **Phase 1a 에서 이미 해소**되었다(원래 동기로서 역사적 맥락 보존). 본문에 ✅/⏳/🔮 마커로 단계별 구현 상태를 표기한다.

## Summary

정산 페이지(`/challenge/[id]/recap`)의 "공유하기"를 **성과·벌금 증명에서 "루틴의 흔적"을 담는 공유물로** 재설계한다. 목적은 **친구들끼리 공유가 1차**, SNS(Social Network Service) 게시는 **opt-in(사용자 명시 동의)** 이다.

공유 산출물은 **3종**이며 공유 직전 선택한다 (현재 **사진형·티켓형 2종 구현 완료**, 영상은 Phase 1b):

1. **▶ 영상(클립)** ⏳ — 2~3초 MP4. 그룹 인증 사진이 Day 순으로 흐르는 몽타주 + 오버레이(그룹명·기간·인원). **마지막 정지 프레임 = 사진형 정적 카드**(영상 미지원 환경의 썸네일/poster로 재사용).
2. **🖼 사진형 카드** ✅ — 사진 메인, 텍스트 최소. 정적 이미지.
3. **🎟 티켓형 카드** ✅ — 구조화 필드 + 절취선 스텁. 정적 이미지.

**전부 4:5(1080×1350)** 한 비율로 통일한다. 카드·영상 모두 **벌금·계좌·멤버 실명을 제거**하고, 그룹 사진은 담되 **실명은 표시하지 않으며**, 외부(특히 SNS) 경로엔 **멤버별 사진 포함 opt-out**을 적용한다(opt-out 영속화는 Phase 1c).

영상은 **외부 영상 API를 쓰지 않고 자체 호스팅**한다 — 1차로 **Vercel 함수 + `ffmpeg-static`** 으로 프레임(우리 카드 렌더)을 MP4로 인코딩한다. Vercel 함수 크기(≈250MB)·타임아웃 한도가 빠듯하므로 **착수 전 spike(프로토타입) 필수**, 한도를 못 맞추면 작은 워커(컨테이너)로 폴백한다. 새 렌더 인프라이므로 **ADR을 동반**한다(다음 번호 **ADR-0025**).

> 시각 방향·스토리보드는 2026-05-29 brainstorming 세션에서 확정. 목업은 `.superpowers/brainstorm/<session>/content/`(gitignore, 임시)에 보존.

## Why

> 아래는 재설계의 **원래 동기**다. 프라이버시·게이팅·톤 항목은 Phase 1a(`e2c459d`)에서 해소되었고, 측정·영상 항목은 후속 단계의 동기로 남는다.

Phase 1a 이전 구현(`share-card-action.tsx` + `/api/og/recap-card`)을 분석한 결과:

- **프라이버시 충돌** ✅ _(Phase 1a 해소)_: 공유 OG(Open Graph) 카드에 **예금주 실명 + 계좌 뒤 4자리 + 멤버 전원 실명**이 박혀 있었다. 카드는 사용자가 외부에 게시하는 산출물이라 PRD §10 "사진/메모는 그룹 내부만 · 외부 링크 공유 불가" 원칙과 충돌. → **현재 `templates.tsx`(`renderPhotoCard`·`renderTicketCard`)는 계좌·실명을 렌더하지 않는다.**
- **게이팅 버그** ✅ _(Phase 1a 해소)_: `fetchRecap`은 `status='active' + 만기 지남` 챌린지도 정산으로 띄우는데, 과거 `/api/og/recap-card`는 `status !== 'closed'` 면 404였다. → **현재 라우트는 `fetchRecap`(closed OR active+만기 게이팅 내장)만 사용하고 status 재검사를 하지 않는다.**
- **톤 불일치** ✅ _(Phase 1a 해소)_: 공유 텍스트가 `"종료! 최종 벌금 N원"` 이었다. → **현재 `page.tsx` 의 `shareMessage` 는 `${groupName} · ${recap.title}의 기록 · with-key`**(벌금 단정 제거).
- **측정 공백** 🔮 _(Phase 1c)_: `AnalyticsEvent`에 공유 이벤트가 없다(현재도 `recap_shared` 부재). 친구 공유는 Week 2 GO/NO-GO 핵심 신호인데 계측이 0이다.
- **정적 PNG의 한계** ⏳ _(Phase 1b 동기)_: 현재 `next/og`는 정적 PNG만 만든다. "루틴이 흐르는 과정"을 보여주려면 움직임이 필요하고, SNS에서 실제로 움직이는 건 GIF가 아니라 **MP4**다(GIF는 용량·화질·정적 변환 문제로 제외).
- **목적 재정의**: PO 결정으로 공유의 의미를 "성과 자랑"이 아니라 **"루틴의 흔적 · 친구들과의 참여감 · 과정"** 으로 바꾼다(셋로그 레퍼런스, "덜 자랑스러운" 톤).

## Impact Scope

> ✅ = Phase 1a 완료(`e2c459d`) · ⏳ = Phase 1b · 🔮 = Phase 1c

### 변경 경로

- ✅ **Phase 1a 완료(이미 적용)**:
  - `src/app/api/og/recap-card/route.tsx` — `?template=photo|ticket` 분기, 인증(`getUser`)·`fetchRecap` 게이팅·`fetchChallengePhotos` 사진, 계좌·실명 제거, 4:5(1080×1350), 폰트 로드, `ImageResponse`
  - `src/app/api/og/recap-card/templates.tsx` _(신규)_ — `CardData` 타입 + `renderPhotoCard` + `renderTicketCard`(Satori JSX, 팔레트 상수)
  - `src/app/(app)/challenge/[id]/recap/_components/share-card-action.tsx` — **사진형/티켓형 2종 토글** + `navigator.share({files})`(미지원 시 다운로드) + 로딩·에러(AbortError 무시). _(영상 3번째 선택지는 Phase 1b 에서 추가)_
  - `src/app/(app)/challenge/[id]/recap/page.tsx` — `shareMessage` 문구 재정의(벌금 단정 제거), `ShareCardAction` 배선
  - `src/lib/share/period.ts` _(신규)_ — `formatSharePeriod(startIso, endIso)`(KST, 같은 해/해 넘김)
  - `src/lib/share/hero-image.ts` _(신규)_ — `duotoneDataUrl(signedUrl)`(`sharp` 네이비 듀오톤 → data URI, 티켓 사진)
  - `public/fonts/Anton-Regular.ttf` _(신규 asset, OFL)_ — 티켓 빅타이포 숫자
- ⏳ **Phase 1b (영상)**:
  - `src/app/api/share/recap-clip/route.ts` _(신규)_ — 2~3초 MP4 렌더(인증·`fetchRecap` 게이팅·프레임 생성 + `ffmpeg-static` 인코딩)
  - `src/app/api/share/recap-clip/{storyboard.ts,frames.tsx,encode.ts}` _(신규)_ — 비트 타이밍·인트로/몽타주 프레임·ffmpeg concat (엔드카드는 `renderPhotoCard` 재사용)
  - `src/lib/share/og-fonts.ts` _(신규)_ — `loadCardFonts()`(route.tsx 의 폰트 로딩 추출, OG·클립 공용)
  - `package.json` / `next.config.ts` — `ffmpeg-static`(dependencies) + `serverExternalPackages`·`outputFileTracingIncludes`
  - `share-card-action.tsx` — 토글 3종(영상/사진형/티켓형)으로 확장
  - **ADR-0025**: 영상 렌더 인프라 결정(자체 호스팅 ffmpeg-static, 외부 API 미사용, Vercel 한도/워커 폴백)
- 🔮 **Phase 1c**:
  - `src/lib/analytics/track.ts` **+ `src/lib/analytics/schema.ts`** — `recap_shared` 이벤트(유니온 + Zod 스키마 **둘 다**, PRD §9.1 + PO 승인 전제 — spec-required)
  - 멤버별 "공유물에 내 사진 포함" opt-out 저장소 → Supabase 컬럼 **migration + ADR**

### 데이터 출처 (정정)

- 카드/영상 텍스트 데이터: `fetchRecap(viewerId, { challengeId })` → `RecapView`(그룹명 `group.name` · 기간 `startAt`/`endAt` · `viewerDoneCount` · `members.length` · `members[].achieved`). **`RecapView` 에는 사진·키워드가 없다.**
- 사진: **`fetchChallengePhotos(challengeId, { client })`**(`src/lib/db/reads/challenge-photos.ts`) → `RecapPhotoView[]`(`signedUrl`, created_at **ASC = Day 순**). 대표/엔드카드 사진 = 마지막 1장. _(스펙 초안의 "recap.ts 에 사진 목록·키워드 집계 보강"은 오기 — recap.ts 가 아니라 별도 read 가 담당하고, 키워드는 노출되지 않는다.)_

### src/ 영향

`recap`/`og`/`share` 경로 + (Phase 1c) `analytics/*`. 쓰기 경로(Server Action) 신설 없음 — 공유는 클라이언트 + GET 렌더 라우트.

### Supabase / RLS / migration 영향

- 기본 설계는 **읽기만** — 사진 signed URL은 기존 Pre-signed URL 정책 준수(`fetchChallengePhotos` → `getPhotoSignedUrls`, Public 버킷 금지).
- **멤버 사진 opt-out** 영속화(🔮 Phase 1c) 시 `challenge_participants`(또는 `users`)에 boolean 컬럼 1개 → **별도 ADR + migration**(POC 단방향). SNS opt-in과 함께 분리.

### 외부 서비스

- **외부 영상 API 미사용**(Shotstack/Creatomate 등) — 렌더당 과금 + 멤버 사진이 제3자로 유출되는 것을 피하기 위함.
- 영상은 자체 `ffmpeg-static`(서버 바이너리). OpenAI·Web Push 무관. _(주의: `sharp` 가 현재 devDependencies 인데 서버에서 import 됨 — `ffmpeg-static` 은 반드시 dependencies 로 추가.)_

## Design

### D1. 콘텐츠 철학 (불변 규칙) ✅

- **담는다**: 그룹명 · 기간(시작–끝) · 인증 일수 · 참여 인원수 · 그룹 인증 사진 · 전원 달성 여부.
- **뺀다**: 벌금 금액 · 계좌(은행·예금주·번호) · **멤버 실명**. **왜**: 외부 게시물에 타인 PII·금융정보가 나가면 안 됨(PRD §10).
- 톤: 성과 증명 ❌ → 과정·흔적·참여감. "축하/최종 벌금" 단정 카피 금지.

### D2. 공유 산출물 3종 (공유 직전 선택)

공유 액션에 선택 UI. **현재 `share-card-action.tsx` 는 `[ 🖼 사진형 · 🎟 티켓형 ]` 2종 토글**(`role="tablist"`)이며, Phase 1b 에서 **`[ ▶ 영상 · 🖼 사진형 · 🎟 티켓형 ]`** 3종으로 확장한다. **왜 3종**: 영상이 부담스러운 사용자를 위한 정적 카드 2종 + 움직이는 영상. 선택한 1개만 공유(캐러셀 아님 — 1차 채널 카톡/스토리는 보통 1장만 노출).

- **사진형(photo)** ✅: 풀블리드 대표 사진 1장(= 영상 엔드프레임) + 상단 `from.with`(좌상단 pill) + 우상단 `전원 달성` 배지(전원 달성 시) + 좌하단 `ROUTINE TRACE` / `{N} DAYS` 오버레이 + 하단 데이터바(`그룹명` / `기간`(테라코타 강조) / `N일 인증 · M명 함께`). _(초안의 "도장 스트릭"은 1a 에 미반영 — 채택 시 후속.)_
- **티켓형(ticket)** ✅: 좌측 듀오톤(네이비 2색) 사진 1장 + 우측 필드 `ROUTINE`(그룹명)·`PERIOD`(기간, 테라코타)·`CREW`(M명 함께)·`RESULT`(전원 달성, 전원 달성 시에만) + 절취선 스텁(`인증 N일` 빅타이포(Anton) · 바코드 · `from.with`). **"2 WEEKS" 미표기**. _(초안의 `TAG`(키워드) 필드는 미채택 — 키워드 데이터 미노출이며 `RESULT`(전원 달성)로 대체.)_
- **사진 장수**: 영상은 **여러 장 몽타주**(Day 순, 상한 6장), 정적 사진형은 **대표 1장**. 정적 카드도 콜라주로 늘릴 수 있으나 외부로 나가는 멤버 사진 수가 늘어 SNS 동의 표면이 커진다(트레이드오프).

공통: 4:5(1080×1350) · 따뜻한 팔레트(크림 `#FAF6EF`·테라코타 `#C2683D`·잉크 `#2A221C`·서브텍스트 `#8E8579`·절취선 `#C9C0B0`) · 빅타이포·모노. _(Satori 제약상 필름 그레인·CSS filter 는 미사용 — 티켓 듀오톤은 `sharp` 서버 전처리.)_

### D3. 영상 클립 (2~3초 MP4) ⏳

스토리보드 3비트:

1. **인트로 ~0.4s**: 크림 배경에 `from.with` + 그룹명.
2. **사진 몽타주 ~1.8s**: 그룹 인증 사진 Day 순(상한 6장) + 오버레이(`from.with`) + 하단 그라데이션.
3. **엔드카드 ~0.8s**: 사진형 정적 카드로 정착. **이 프레임 = `renderPhotoCard`(사진형 카드와 동일)** → 영상 미지원 환경의 poster/thumbnail 로 재사용(= 기존 `/api/og/recap-card?template=photo`).

렌더 파이프라인(자체 호스팅):

- 프레임 생성: 정적 카드와 **동일한 렌더 코드 재사용** — `templates.tsx` 의 `renderPhotoCard`(엔드카드) + 신규 인트로/몽타주 프레임 → `new ImageResponse(el,{width:1080,height:1350,fonts}).arrayBuffer()` 로 PNG 키프레임 N장.
- 인코딩: **`ffmpeg-static`** 로 H.264 MP4(concat demuxer, hold). 4:5 1080×1350. 카톡 인앱 호환 위해 `baseline/level 3.0 + yuv420p + faststart`.
- 실행 위치: **1차 Vercel Node 함수**(`runtime` 미선언=nodejs, `maxDuration` 상향). **왜 외부 API 아님**: 렌더당 과금 + 멤버 사진 제3자 유출 회피.
- **spike 필수**: Vercel 함수 unzip ≈250MB 한도에 `ffmpeg-static`(~70MB)+frames 적재 가능 여부, 타임아웃(2~3초 영상 인코딩) 실측. **폴백**: 한도 초과 시 컨테이너 워커(Railway/Fly 등)로 렌더 분리.
- 대안 Remotion은 headless Chromium 필요로 Vercel 함수에서 못 돌고 Lambda/워커 + 상용 라이선스 확인이 필요해 1차 후보에서 제외(폴백 후보로 보존).

### D4. 날짜 포맷 ✅

- 같은 해: `YYYY.M.D – M.D` → 예 `2026.5.16 – 5.28`(en-dash 양쪽 공백, 0 패딩 없음). 해 넘김: `YYYY.M.D – YYYY.M.D`.
- 구현: `src/lib/share/period.ts` 의 `formatSharePeriod(recap.startAt, recap.endAt)`(KST `Asia/Seoul`).

### D5. 공유 플로우 / 프라이버시 경계

- **친구 공유(기본)** ✅: 그룹 사진 그대로(실명 숨김). `navigator.share({files})`(이미지/영상 파일) → 미지원 시 다운로드 폴백. _(현재 사진형/티켓형 PNG 에 적용. 영상 MP4 는 Phase 1b 에서 동일 플로우.)_
- **SNS 공유(opt-in)** 🔮: 사용자 명시 선택. **opt-out 한 멤버 사진은 제외**한 풀에서 사진/몽타주 구성. _(클립 라우트는 `channel=sns` 파라미터로 경계를 선반영하되, opt-out 컬럼은 Phase 1c.)_
- 대표/몽타주 사진 선정: 1차 자동(최신/Day 순). 사용자 직접 선택은 후속.
- 에러: `navigator.share` 취소(AbortError) 무시, 실제 실패만 토스트. 영상 생성 중 로딩·중복요청 가드.

### D6. 게이팅 정합 ✅ (버그 수정 완료)

`/api/og/recap-card` 는 `fetchRecap`(`status='closed' OR (active AND end_at<=now)`)만 사용하므로 정합 완료. ⏳ `/api/share/recap-clip` 도 동일하게 `fetchRecap` 를 재사용해 게이팅을 자동 상속한다. **왜**: 페이지는 띄우는데 산출물만 404 나는 불일치 제거.

### D7. 측정 🔮

- 신규 이벤트 `recap_shared { challengeId, kind: 'clip'|'photo'|'ticket', channel: 'friend'|'sns' }` 제안.
- **선행 조건**: PRD §9.1 추가 + PO 승인(가드레일 — 임의 이벤트 금지). 승인 후 **`src/lib/analytics/track.ts` 의 `AnalyticsEvent` 유니온과 `src/lib/analytics/schema.ts` 의 Zod 스키마를 둘 다** 갱신해야 함(`track` 이 `safeParse` 로 검증 → 한쪽만 추가하면 silently drop). 승인 전 코드 미추가.

## Alternatives Considered

- **이미지 캐러셀(2장 세트)**: 인스타 피드 한정, 카톡/스토리는 1장만 → 보류.
- **GIF / animated WebP 공유물**: 용량·화질·SNS 정적 변환 → 제외(움직임은 MP4).
- **외부 영상 API(Shotstack/Creatomate/Cloudinary)**: 인프라 0이나 렌더당 과금 + 멤버 사진 제3자 유출 → POC 비채택.
- **Remotion(Lambda/워커)**: React 카드 재사용 매력적이나 Chromium 필요(Vercel 함수 불가)·AWS/워커·상용 라이선스 → 1차 제외, 폴백 후보.
- **클라이언트 WebCodecs / MediaRecorder**: 서버비용 0이나 iOS Safari·카톡 인앱 호환성 위험 → 비채택.
- **키워드 TAG 카드 필드**: 키워드가 recap 데이터에 집계되지 않고 분석 일관성 우려 → 미채택, `RESULT`(전원 달성)로 대체(Phase 1a 결정).

## Verification

### 명령

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

### 시나리오

- ✅ 정적 카드: `?template=photo|ticket` 각각 200 + 4:5 레이아웃(모바일 뷰포트 실측). _(테스트 `route.spec.ts`·`share-card-action.spec.ts`·`period.spec.ts` 통과.)_
- ✅ 게이팅: `status='active'+만기` 챌린지에서 카드 생성 성공(404 회귀 없음).
- ✅ 프라이버시: 산출물에 계좌·예금주·멤버 실명 미노출(스냅샷/수동).
- ⏳ **영상 spike**: Vercel 함수에 `ffmpeg-static` 적재(≤250MB) + 2~3초 인코딩이 타임아웃 내 완료. 산출 MP4가 **iOS Safari·카카오톡 인앱·인스타 스토리**에서 재생/공유되는지 실기기 확인.
- ⏳ 엣지: 사진 0~1장, 솔로(1명), 긴 그룹명 → 깨짐 없음(영상은 사진 부족 시 인트로+엔드카드 폴백 비트).
- ✅/⏳ 공유: `navigator.share` 지원/미지원, 취소(AbortError) 무토스트, 실패 토스트.

## Rollout

- **✅ Phase 1a (정적 카드) — 완료(`e2c459d`)**: 사진형·티켓형 2종 + 게이팅·문구·프라이버시 정리. 인프라 리스크 없음 → 머지됨.
- **⏳ Phase 1b (영상)**: `ffmpeg-static` spike → 통과 시 `recap-clip` 라우트 + 영상 선택 UI. 미통과 시 워커 폴백. **ADR-0025 동반.** 계획: [`../plans/2026-05-29-recap-share-clip-video.md`](../plans/2026-05-29-recap-share-clip-video.md).
- **🔮 Phase 1c (조건부)**: SNS opt-in + 멤버 사진 opt-out(컬럼 → ADR+migration) + `recap_shared` 계측(track.ts + schema.ts, PO 승인 후).
- dogfood(Week 2)에서 공유 발생·반응 관찰.

### 롤백

라우트·컴포넌트 수정은 commit revert로 복구. 영상 라우트/선택지는 feature flag(토글 배열에서 `clip` 제거)로 숨김 가능. migration이 들어간 경우 단방향(POC) — 사용처만 비활성화.

## Out of scope

- 비로그인 수신자용 public 랜딩(`/share/[id]`) 및 링크백 획득 루프 — 친구 공유 1차 모델에선 불필요.
- 실제 정산(송금) — v1 이후.
- 사용자 히어로/몽타주 사진 직접 선택, 정적 사진형의 다중 콜라주 — 후속 개인화.
- 외부 영상 API · Remotion(폴백 후보로만 보존).

## 용어집

- **ffmpeg-static**: ffmpeg 실행 바이너리를 npm 패키지로 제공하는 것. 서버에서 영상 인코딩에 사용.
- **OG (Open Graph)**: 공유용 이미지/메타 규격. 여기선 `next/og`로 정적 카드 렌더.
- **opt-in / opt-out**: 명시적으로 켜야 적용(opt-in) / 기본 적용이며 끌 수 있음(opt-out).
- **PII (Personally Identifiable Information)**: 개인 식별 정보(실명·계좌 등).
- **poster / thumbnail**: 영상 재생 전·미지원 환경에서 보이는 대표 정지 이미지.
- **PRD §9.1 / §10 / §11.2**: 제품 요구 문서 — 이벤트 표(9.1) · 화면/프라이버시(10) · "예상 벌금 표시만"(11.2).
- **SNS (Social Network Service)**: 인스타그램·X 등 공개 소셜 플랫폼.
- **spike**: 불확실 기술을 검증하는 짧은 프로토타입.
- **duotone(듀오톤)**: 사진을 2색으로 환원한 인쇄풍 처리.
