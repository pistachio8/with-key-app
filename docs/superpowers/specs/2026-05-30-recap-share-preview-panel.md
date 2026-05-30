---
spec: 2026-05-30-recap-share-preview-panel
title: 정산 공유 선택 UI 재디자인 — 미리보기 패널 + 아이콘 카드
author: pistachio8
date: 2026-05-30
status: proposed
---

> **부모 SoT**: [`2026-05-29-recap-share-redesign.md`](./2026-05-29-recap-share-redesign.md) §D2(공유 산출물 선택 UI).
> 이 스펙은 그 **선택 UI의 시각 표현을 교체**하고 **미리보기 패널을 추가**한다. 하단 액션은 **단일 `공유하기` 버튼을 유지**한다(현행 동작). 콘텐츠 철학(D1)·게이팅(D6)·산출물 종류(영상/사진/티켓)·공유 메커니즘(`navigator.share`/다운로드 폴백)은 **불변**이다.

## Summary

정산 페이지(`/challenge/[id]/recap`)의 `ShareCardAction` 형식 선택 UI를 바꾼다.

- **현재**: `bg-muted` 연결 트랙 + 칸막이 pill 세그먼트(영상·사진형·티켓형) → 세그먼트 탭/버튼그룹 인상.
- **변경 후**: **가로 3칸 아이콘 카드**(개별 둥근 카드, 골드 선택 강조) + 그 위에 **선택 형식의 실제 출력물 4:5 미리보기 패널**.

형식 선택은 2단계로 유지하되(형식 선택 → `공유하기`), 하단은 **단일 `공유하기` 버튼**(`Share2` 아이콘)으로 둔다. 아이콘 카드 선택 강조는 **챌린지 생성 "진행 기간" 버튼과 동일한 골드(secondary)** 로, 미리보기 패널은 **실제 출력물 컬러**(`templates.tsx` 기준)로 보여준다.

> **단일 버튼인 이유**: 모바일에서 `navigator.share({files})` 가 여는 시스템 공유 시트는 "이미지/비디오 저장(→ 사진첩)"과 "카카오톡·인스타 공유"를 **한 시트에 함께** 담는다. 따라서 "다운로드"와 "공유"를 두 버튼으로 나눠도 모바일에선 **둘 다 같은 시트**를 열어 중복·혼란이 된다(상세 D4·데이터 정합). 버튼 1개가 UX상 명확하다.

## Why

- **시각 정합**: 현재 선택 UI는 연결된 트랙 + 칸막이라 "세그먼트 탭/버튼그룹"으로 읽힌다. 디자인 SoT(`docs/mockups/2026-05-14-ui-revision.html`)의 개별 카드 톤과 결이 다르다. 사용자 요청은 "탭/버튼그룹 말고 revision-ui 톤".
- **공유 전 확신**: 형식을 골라도 무엇이 공유될지 미리 볼 수 없다. 출력물 미리보기를 붙여 "내가 내보낼 카드/영상"을 공유 전에 확인하게 한다.

## Design

### D1. 레이아웃 (선정안 = B)

정산 시트 하단 `ShareCardAction` 내부 순서:

```text
[ 미리보기 패널 (4:5) ]        ← 선택된 형식의 실제 출력물 1장
        ↕ (여백 약간 확대)
[ 영상 ] [ 사진 ] [ 티켓 ]     ← 아이콘 카드 3개 (radiogroup)
[       ⌣ 공유하기       ]     ← 단일 full-width 버튼 (Share2 + 라벨)
```

- 아이콘 카드를 탭하면 위 미리보기가 그 형식 출력물로 **즉시 갱신**된다.
- **여백**: 미리보기 패널 ↔ 아이콘 카드 사이 간격을 **아주 조금 넓힌다**(카드 행 `mt-1` + 시트 `gap` 한 단계 ↑). **왜**: 미리보기·카드·버튼이 붙어 답답해 보이지 않도록.
- **기본 선택**: 현행 그대로 **`clip`(영상)** 유지 — 초기 미리보기는 영상 poster. **왜**: 기존 "영상 우선 공유물" 전략을 유지하고, 기본값 변경은 별개 결정이라 surgical 하게 둔다.
- 아이콘 카드: `grid-cols-3 gap-2`, 각 카드 `rounded-xl border-[1.5px]`, 세로 정렬 lucide 아이콘 + 라벨.
  - 아이콘: 영상 `Clapperboard` · 사진 `Image`(`ImageIcon`) · 티켓 `Ticket`. `<svg>`는 `aria-hidden`.
  - 라벨: `영상` · `사진` · `티켓`. **왜 단축**: 아이콘이 형식을 전달하므로 `사진형/티켓형`의 "형"을 떼어 간결화.
- **하단 버튼**: 단일 `공유하기`(full-width, `Share2` 아이콘 + 라벨). **왜 1개**: 위 Summary 참조 — 모바일 공유 시트가 저장·공유를 통합하므로 2버튼 분리는 중복.
- **검토했던 대안**: A(아이콘 카드, 미리보기 없음) · C(썸네일 타일 = 버튼이 곧 미리보기) · D(리스트 행 + 썸네일). B를 택한 이유: 깔끔한 카드 행을 유지하면서 미리보기 요구를 한 패널로 충족, 세로 점유 최소.

### D2. 색

- **아이콘 카드 — 선택 강조색 = 챌린지 생성 "진행 기간" 버튼과 동일**(`src/app/(flow)/challenge/new/_components/end-date-picker.tsx` 스킴):
  - 비선택: `border-border/60` · `bg-card` · `text-foreground/85`.
  - 선택: `border-secondary` · `bg-secondary`(골드 #FFD46B) · `text-secondary-foreground`(잉크 #22262E). 우상단 체크 배지는 잉크 원 + 흰 체크(골드 위 가독성).
  - **왜**: 직전 primary(파란) 선택색이 하단 파란 버튼과 겹쳐 보였다. 골드(secondary)로 바꿔 선택 카드와 버튼을 시각 분리하고, 진행 기간 버튼과 **동일 토큰**이라 앱 내 "단일 선택" 패턴이 일관된다.
- **공유하기 버튼**: `bg-primary`(파란) + 흰 텍스트, full-width, lucide `Share2` 아이콘 + 라벨 "공유하기", `rounded-xl`(mockup `.btn` 계열).
- **미리보기 패널 — 실제 출력물 컬러 그대로**(`src/app/api/og/recap-card/templates.tsx` 상수):
  - 크림 `#FAF6EF` · 티켓 배경 `#FBF7EF` · 잉크 `#2A221C` · 테라코타 `#C2683D` · 서브텍스트 `#8E8579` · 절취선 `#C9C0B0` · 티켓 좌측 네이비 듀오톤.
  - **왜**: 사용자 명시 — "미리보기는 실제 아웃풋 컬러 그대로".

### D3. 미리보기 렌더 방식 (결정)

- **실제 OG 라우트 이미지를 그대로 표시**한다 — `<img src="/api/og/recap-card?challengeId={id}&template=photo|ticket">`.
  - **영상**: 별도 영상 프레임 대신 **poster = 사진형(`template=photo`) 이미지 + 재생 아이콘 오버레이**. 패널에서 MP4를 재생하지 않는다(무겁다). 부모 spec D3 — "엔드카드 = 사진형 카드 = 영상 poster" 재사용 원칙과 일치.
    - **주의(오인 방지)**: poster 는 영상의 **엔드프레임(대표 정지컷)**일 뿐, 실제 공유 영상(MP4 = 인트로 + 사진 몽타주 + 엔드카드)의 전체 움직임을 보여주지 않는다. `MP4`/`영상` 배지 + 재생 글리프로 "이 형식은 영상"임을 표시하고, 미리보기 영역은 `cursor-default`(D5).
  - **왜 실제 이미지**: "실제 아웃풋 그대로"를 글자 그대로 충족하고, `templates.tsx`를 클라이언트에서 다시 그리지 않아 **드리프트(중복 정의 불일치)가 0**.
- **비용 통제 / 캐싱 (버튼 전환 시 무재렌더)**:
  - OG 라우트는 이미 `Cache-Control: private, max-age=300`(`route.tsx:47`)을 내린다 → 같은 형식 재선택 시 5분간 브라우저 캐시(memory/disk) hit. 단, 브라우저가 조건부 재검증 요청(304)을 보낼 수 있으므로 **"네트워크 요청 0"을 절대 조건으로 두지 않고** "서버 재렌더 0 + 캐시 hit"으로 본다.
  - 구현은 **형식별 `<img>`를 한 번 선택되면 unmount 하지 않고 visibility만 토글**한다(lazy mount, 이후 유지) → 형식당 fetch 1회, 전환 즉시.
  - **영상 poster = `template=photo` 이미지 재사용**이라 영상↔사진은 URL 동일 → 추가 렌더 없음. 실제 distinct 렌더는 **사진·티켓 2종, 각 1회**뿐.
  - `loading="lazy"`: 미리보기가 시트 하단이라 미스크롤 시 0 렌더.
  - (후속·선택) ended 챌린지는 데이터가 고정이므로 `max-age` 상향 여지 — 본 변경에선 현행 300s 유지.
- **대안(비채택)**: 클라이언트 경량 재현(CSS/React 미니 카드). 저비용·즉시 렌더지만 `templates.tsx` 레이아웃·색을 2곳에 중복 → 드리프트 위험.
- **리스크**: 기존엔 OG 라우트가 `공유하기` 클릭 시에만 호출됐는데, 미리보기 도입으로 **조회 경로에서도 호출**된다(스크롤 시). 완화: lazy 로드 + (후속) preview 전용 축소 size 파라미터. 게이팅·인증은 기존 라우트가 `getUser` + `fetchRecap`로 이미 처리하므로 추가 보안 표면 없음.

### D4. 동작 (단일 공유하기 — 현행 유지)

하단 `공유하기` 한 버튼이 형식에 맞는 파일을 만들어 **공유 또는 저장**을 사용자에게 맡긴다. 이는 **현행 `share-card-action.tsx` 동작과 동일**하다(다운로드/공유 2버튼 분리는 비채택).

- **파일 생성**: 선택 형식 파일을 fetch → `File`. 영상=`/api/share/recap-clip`(MP4), 사진·티켓=`/api/og/recap-card?template=...`(PNG).
- **분기(클릭 시)**: `navigator.canShare?.({ files: [file] })` 가 true 이고 `navigator.share` 가 있으면 **`navigator.share({ files, text })`** (모바일 → 시스템 시트: "이미지/비디오 저장" + "공유" 한 곳). 아니면 **`a[download]`** blob 다운로드(데스크톱/미지원).
  - **왜 단일 시트에 위임**: 모바일에서 "사진첩 저장"은 시트의 "이미지/비디오 저장"을 **사용자가 탭**해야 일어난다. JS가 특정 대상을 강제할 수 없고, 별도 "다운로드" 버튼을 둬도 같은 시트를 또 여는 중복이 된다.
  - **사진첩 직접 저장 불가**: 웹은 iOS Photos/Android MediaStore 에 직접 쓰는 범용 API가 없다(데이터 정합·Web platform 근거 참조). 카피는 "사진첩에 저장"으로 과보장하지 않는다.
- **공통**: 진행 중 버튼 `disabled`(중복요청 가드), 로딩 카피("영상 만드는 중..." / "카드 만드는 중..."), 실패 시 에러 토스트, `AbortError`(시트 취소) 무시.
- **접근성**: 형식 선택은 **`role="radiogroup"` / `role="radio"` / `aria-checked`** 로 둔다. **왜**: 이 UI는 "공유 형식 하나 선택"이라 라디오 의미가 자연스럽고, 색을 빌려온 진행 기간 버튼(`end-date-picker.tsx`)도 `radiogroup` 이다. (직전 `tablist` 는 `tabpanel` 부재 anti-pattern 회피 겸 변경.) 카드 `<svg>`는 `aria-hidden`, 공유 버튼은 아이콘 + 텍스트 "공유하기"(아이콘 `aria-hidden`).

### D5. 미리보기 상태 · 접근성 (UX 보강)

미리보기 `<img>`는 비동기 OG 렌더라 상태 처리가 필요하다. 빠진 상태는 그대로 빈 화면·레이아웃 점프·접근성 공백이 된다.

- **로딩 상태**: OG 렌더(특히 티켓 = `sharp` 듀오톤 + Satori)는 수백 ms~수 초가 걸릴 수 있다. `<img>` 자리에 **4:5 스켈레톤(은은한 shimmer)**을 깔고 `onLoad` 시 이미지로 교체. **왜**: 빈 사각형·깜빡임 방지.
- **에러 fallback**: `<img onError>` 시 **중립 placeholder**(크림 톤 박스 + "미리보기를 불러오지 못했어요")로 대체하고, 아이콘 카드·`공유하기`는 정상 동작 유지. **왜**: 미리보기 실패가 공유 자체를 막으면 안 됨.
- **CLS 방지**: 미리보기는 **`aspect-ratio: 4/5` 고정 박스 + 명시 너비**로 영역을 예약. **왜**: 이미지 로드 전후 레이아웃 점프 0(web/performance 규칙 — 이미지 명시 치수).
- **사이징**: 모바일 320px 에서도 `미리보기 + 카드 3개 + 공유하기`가 한 화면에 들어오도록 미리보기 **폭을 캡(중앙 정렬·과대 금지)**. **왜**: 시트가 길어져 `공유하기`가 폴드 아래로 밀리면 전환율 손해.
- **접근성**: 미리보기 `<img>`에 짧은 `alt`(예: "사진형 공유 카드 미리보기"). raw `<img>`(인증 쿠키 필요한 same-origin OG 이미지)이므로 구현 시 `@next/next/no-img-element` 예외 주석 + 사유를 남긴다. 선택 컨트롤은 **아이콘 카드(radio)**이며, 미리보기와 영상 재생 글리프는 **비상호작용 표식**.
- **영상 poster 표식**: 재생 삼각형만 두면 실제 재생 버튼으로 오인될 수 있다. `MP4`/`영상` 배지를 함께 두고 preview 영역은 `cursor-default` 로 유지한다. **왜**: 미리보기를 눌러 재생/공유될 것이라는 오해 방지.
- **전환 모션(선택)**: 형식 전환 시 가벼운 크로스페이드. `prefers-reduced-motion` 존중, 과한 모션 금지.

### 데이터 정합 점검 (검토 결과)

실제 코드(`route.tsx` · `fetchRecap` · `share-card-action.spec.tsx`)와 대조한 결과:

- ✅ OG 라우트는 `challengeId` 만으로 그룹명·기간·인증수·인원·전원달성·사진을 서버에서 모두 조회한다(`route.tsx`) → 미리보기에 추가 prop 불필요(컴포넌트는 이미 `challengeId` 보유). **모순 없음.**
- ⚠️ **영상 미리보기 ≠ 실제 영상**: 위 D3 주의 참조 — poster(정지)와 MP4(움직임)의 차이를 배지로 분명히 한다.
- ⚠️ **부모 spec phase 마커 drift**: `2026-05-29-recap-share-redesign.md`는 영상(Phase 1b)을 "예정(⏳)"으로 표기하나, **현재 코드엔 영상/사진/티켓 3종이 이미 live**다(`share-card-action.tsx` 기본값 `clip` + `/api/share/recap-clip` 라우트 + 영상 공유 테스트 존재). 본 스펙은 **코드 현실(3종 live)** 기준이며, 부모 spec 마커 갱신은 후속.
- ⚠️ **모바일 사진첩 직접 저장 불가/불안정**: 웹 앱이 사용자 사진첩에 무조건 직접 쓰는 범용 API는 없다. `a[download]` 는 주로 다운로드/파일 앱 경로이고(iOS는 Files, Android는 다운로드 폴더), `navigator.share({ files })` 는 OS 시트를 열어 사용자가 "이미지/비디오 저장"을 고를 수 있다. **네이티브(React Native / Capacitor 등) 래퍼로 전환하면** `PHPhotoLibrary`(iOS) · `MediaStore`(Android)로 권한 1회 후 사진첩 직접 저장이 가능하다 — 이는 웹 플랫폼 제약이며 향후 네이티브 전환 시 해소 가능(Out of scope).
- ✅ **솔로(1명)**: OG 카드는 `crew = members.length`(=1), `전원 달성 = members.every(achieved)`로 기존과 동일 렌더(본 변경 무관). "1명 함께" 카피 변경은 범위 밖.
- ✅ **사진 0장**: `heroUrl=null` → OG가 TERRA 단색 배경으로 fallback. 미리보기도 동일하게 표시.

### Web platform 근거

- MDN [`HTMLAnchorElement.download`](https://developer.mozilla.org/en-US/docs/Web/API/HTMLAnchorElement/download): `download` 값은 다운로드 의도를 나타내지만 실제 다운로드 여부·저장 위치를 판단하는 보장이 아니다.
- MDN [Web Share API](https://developer.mozilla.org/docs/Web/API/Web_Share_API) · web.dev [Web Share API](https://web.dev/web-share): `navigator.share()` 는 OS 공유 UI를 열고 대상은 사용자가 고른다. 파일 공유는 `navigator.canShare({ files })` feature detection 후 `navigator.share({ files })` 패턴 권장.
- MDN [File System API](https://developer.mozilla.org/en-US/docs/Web/API/File_System_API): 웹에서 다루는 것은 사용자 기기 파일/디렉터리 또는 origin private file system 이며, iOS Photos/Android MediaStore 같은 사진첩 DB에 직접 쓰는 범용 웹 API가 아니다.

## Impact Scope

### 변경 경로

- `src/app/(app)/challenge/[id]/recap/_components/share-card-action.tsx`
  - 선택 UI 마크업·스타일 교체(pill 세그먼트 → 아이콘 카드, **골드 선택 스킴 = 진행 기간 버튼**, `role="tablist"` → `role="radiogroup"`/`radio`/`aria-checked`).
  - 미리보기 패널 추가(선택 `template` 상태에 연동된 `<img>`) + 상태 처리(D5: 4:5 스켈레톤 로딩 · `onError` placeholder · `aspect-ratio` CLS 예약 · `loading="lazy"` · 영상 poster `MP4` 배지).
  - 하단 **단일 `공유하기` 버튼 유지** + `Share2` 아이콘 추가. **다운로드 버튼 신설/분리는 하지 않는다**(현행 `canShare→navigator.share` / else `a[download]` 동작 유지).
  - 미리보기 ↔ 카드 여백 소폭 확대.
  - lucide 아이콘 import(`Clapperboard` · `Image`(`ImageIcon`) · `Ticket` · `Share2`).
  - 라벨 카피 `사진형/티켓형` → `사진/티켓`.
- `src/app/(app)/challenge/[id]/recap/_components/share-card-action.spec.tsx`
  - 셀렉터 `getByRole("tab", { name: "사진형" })` → `getByRole("radio", { name: "사진" })`, `티켓형` → `티켓` (role 변경 + 라벨 단축).
  - `공유하기` 버튼(`name: "공유하기"`) 클릭 → `navigator.share` 지원 시 share, 미지원 시 `a[download]` + `revokeObjectURL` — **현행 검증 구조 유지**(다운로드/공유 분리 테스트 신설 불필요). 각 형식 fetch URL(`recap-clip` / `og-card?template=`)·`AbortError` 무토스트 검증 유지.
- `docs/superpowers/specs/2026-05-29-recap-share-redesign.md` _(후속·선택)_
  - §D2 "토글(`role=tablist`)" 묘사를 "아이콘 카드(`radiogroup`) + 미리보기"로, 영상 Phase 1b 상태 배너를 코드 현실로 갱신 — 본 PR 또는 후속 문서 PR.

### API / 데이터 / RLS / migration

- **없음**. 미리보기는 기존 `GET /api/og/recap-card`(읽기·이미지 렌더) 재사용. 쓰기 경로(Server Action) 신설 없음. Supabase 스키마·RLS·migration 무변경.

### 외부 서비스

- 없음. 미리보기는 자체 OG 렌더만 사용.

## Verification

```bash
pnpm typecheck
pnpm lint
pnpm test          # share-card-action.spec.tsx — radio 셀렉터/라벨 갱신 후 통과
pnpm build         # raw <img> lint · Next 16 client boundary 회귀 확인
```

수동(모바일 뷰포트):

- 아이콘 카드 영상/사진/티켓 전환 → 미리보기 패널이 해당 출력물로 갱신(사진형 하단 크림 데이터바 · 티켓형 테라 빅넘버 · 영상 poster + `MP4` 배지). **선택 카드 = 골드 강조 · 미리보기↔카드 여백 확대** 확인.
- **공유하기**: 모바일(공유 지원) → 시스템 시트(이미지/비디오 저장 + 공유 대상). 데스크톱/미지원 → `a[download]` blob 다운로드 + `revokeObjectURL`. 시트 취소(AbortError) 무토스트.
- **모바일 사진첩 검증**: iOS Safari/PWA · Android Chrome · 카카오 인앱에서 PNG·MP4 각각. 성공 기준 = "사진첩 직접 저장 보장"이 아니라 (a) 시트에서 사진/비디오 저장 선택지 노출, 또는 (b) 파일 앱/다운로드 폴더 저장.
- 엣지: 사진 0장(OG fallback TERRA), 솔로(1명), 긴 그룹명 → 미리보기·카드 깨짐 없음.
- 미리보기 `<img>` 200 응답 · `loading="lazy"` 로 하단 도달 시 로드.
- **로딩 상태**: 느린 네트워크(DevTools throttling)에서 4:5 스켈레톤 노출 → 로드 후 이미지 교체. **CLS 없음**(로드 전후 레이아웃 점프 0).
- **에러 상태**: OG 라우트 차단(네트워크 오프 또는 일시 500) 시 중립 placeholder 표시 + 카드/`공유하기` 정상 동작.
- **캐싱**: 영상↔사진 전환은 동일 URL 재사용, 같은 형식 재선택 시 5분 내 캐시 hit 또는 서버 재렌더 0(DevTools Network — 조건부 304 가능, "요청 0"은 절대 조건 아님).

## Alternatives Considered

- **A. 아이콘 카드(미리보기 없음)**: 가장 단순하나 "선택 시 미리보기" 요구 미충족.
- **C. 썸네일 타일(버튼=미리보기)**: 세 결과를 동시에 비교 가능하나 세로 길이 증가·미니라 디테일 작음.
- **D. 리스트 행 + 썸네일**: 한 줄 설명으로 형식 차이를 글로 안내하나 세로 공간이 가장 큼.
- **미리보기 경량 재현(클라이언트 CSS)**: 저비용이나 `templates.tsx` 중복·드리프트로 비채택.
- **저장 + 공유 2버튼 분리(비채택)**: 탐색했으나, 모바일에선 두 버튼 모두 `navigator.share` 시트(저장+공유 통합)를 열어 **중복·혼란**. 단일 `공유하기`로 통합하고 데스크톱만 `a[download]` 폴백.
- **사진첩 직접 저장 API(불가)**: 웹 표준에 iOS Photos/Android MediaStore 직접 쓰기 API 없음. 사용자의 시트 선택/다운로드로 다룬다(네이티브 전환 시 해소).
- **선택 후 제출 2단계 → 1탭 직접 공유**: 동작 변경이라 보류(사용자 2단계 유지 선택).

## Rollout / Rollback

- 단일 컴포넌트(+테스트) 변경 → `feat/recap-share-preview-panel` 브랜치, base `develop`.
- 롤백: commit revert. 미리보기 비용 문제 발생 시 미리보기 패널만 제거(아이콘 카드는 유지)하는 부분 롤백 가능.

## Out of scope

- 영상 MP4의 패널 인라인 재생(poster + 배지만).
- 미리보기 전용 축소 size 파라미터 등 OG 라우트 최적화(후속).
- **모바일 OS 사진첩에 무선택으로 직접 저장** — 웹 플랫폼 미지원. **네이티브(React Native / Capacitor) 래퍼 전환 시 가능**(별도 결정).
- 실제 송금, 부모 spec Phase 1b(영상 렌더 인프라)·1c(opt-in/계측) 범위.
- 사진형/티켓형/영상 **출력물 자체의 레이아웃·색 변경** — `templates.tsx`·clip 프레임은 불변이고, 미리보기는 그 출력을 그대로 표시할 뿐이다.
- `recap_shared` 등 공유 계측(부모 spec Phase 1c, PO 승인 전제).

## 용어집

- **OG (Open Graph)**: 공유용 이미지 규격. 여기선 `next/og`로 4:5 정산 카드를 렌더하는 `/api/og/recap-card` 라우트를 가리킴.
- **4:5**: 1080×1350 세로 비율. 인스타 스토리·피드 친화 공유물 비율.
- **poster**: 영상 재생 전·미지원 환경에서 보여주는 대표 정지 이미지. 여기선 사진형 카드 재사용.
- **role=radiogroup / role=radio**: 단일 선택 옵션 묶음을 스크린리더에 알리는 ARIA 역할. 이 UI는 "공유 형식 하나 선택"이라 탭보다 라디오 의미가 자연스럽다.
- **Web Share API / `navigator.share`**: OS 공유 시트를 여는 웹 API. 파일 공유 가능 여부는 `navigator.canShare({ files })`로 먼저 검출.
- **듀오톤(duotone)**: 사진을 2색(여기선 네이비)으로 환원한 인쇄풍 처리. 티켓형 좌측 사진.
- **드리프트(drift)**: 같은 정의를 두 곳에 두어 시간이 지나며 어긋나는 현상. 여기선 출력물 레이아웃을 OG와 클라이언트 양쪽에 두면 생길 위험.
- **WCAG AA**: 웹 접근성 대비 기준. 일반 텍스트 명도 대비 4.5:1.
- **lazy 로드**: 요소가 화면에 들어올 때 비로소 리소스를 받는 방식(`loading="lazy"`).
- **CLS (Cumulative Layout Shift)**: 콘텐츠 로드 중 레이아웃이 밀려 생기는 시각 점프 지표. 낮을수록 안정적.
- **스켈레톤(skeleton)**: 콘텐츠 로드 전 자리만 잡아 보여주는 회색 골격 UI. 빈 화면·점프 체감을 줄임.
- **사진첩 저장**: 여기서는 OS 공유 시트 또는 브라우저 다운로드 이후 사용자가 Photos/갤러리에 저장하는 경로. 웹 앱이 사진첩 DB에 직접 쓰는 것을 뜻하지 않음(네이티브 전환 시 가능).
