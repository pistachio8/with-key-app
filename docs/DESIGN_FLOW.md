# 🗺 with-key · Design Flow (v1)

> **문서 상태**: v1.0 · **업데이트**: 2026-05-01
> **대상 독자**: Claude Design (Primary) · FE 개발자 · PO
> **Pre-read**: [DESIGN_BRIEF.md](./DESIGN_BRIEF.md) — §0 Output Rules · §2 화면 인벤토리 · §6 화면별 상세
>
> **이 문서의 역할**: Claude Design이 화면 전환·상태 분기를 읽고 바로 디자인할 수 있는 **Mermaid 플로우 팩**. DESIGN_BRIEF §2의 9개 화면 + §7 상태 변이 체크리스트를 다이어그램으로 직렬화한다.
>
> **읽는 규칙**:
> - 노드 ID는 `S{번호}` (DESIGN_BRIEF §2 화면 번호와 1:1)
> - 서브그래프는 라우트 그룹 `(auth)` / `(app)` 분리
> - 엣지 라벨 = **트리거 + 결과** (탭/제출/타임아웃 등)
> - 다이아몬드 = 조건 분기 · 대문자 suffix = 상태 (`L`=loading, `E`=error, `EM`=empty, `LT`=limited)

---

## 1. 전체 네비게이션 (auth → app · BottomNav 3탭)

```mermaid
flowchart TD
  Start([/ 진입]) --> RootQ{세션 user?}
  RootQ -->|No| S1a
  RootQ -->|Yes| S4

  subgraph Auth["(auth) · BottomNav 없음"]
    S1a["화면1a · 로그인<br/>/login"]
    S1b["화면1b · 초대 랜딩<br/>/invite/[token]"]
    CB["/auth/callback<br/>(route handler)"]
  end

  S1a -- "카카오 or 이메일 매직링크" --> MAIL[📧 Magic Link 발송]
  MAIL -- "링크 클릭" --> CB
  CB -- "세션 생성 OK" --> S4
  CB -- "만료/오류" --> S1aE[화면1a · error toast]

  S1b -- "로그인 필요" --> S1a
  S1b -- "72h 만료" --> S1bE[화면1b · limited copy]

  subgraph App["(app) · BottomNav 3탭: 홈·인증·서약서"]
    S4["화면4 · 홈<br/>/home<br/>그룹 스트립(0~N) + '새 그룹 만들기'"]
    SN["그룹 생성<br/>/group/new<br/>이름 + (선택) 은행·예금주·계좌번호"]
    S5["화면5 · 인증<br/>/action"]
    S3["화면3 · 서약서 서명<br/>/pledge"]
    S6["화면6 · 피드<br/>/feed"]
    S2["화면2 · 서약서 생성<br/>/challenge/new"]
    ChD["챌린지 상세<br/>/challenge/[id]"]
    S7["화면7 · 일기 편집<br/>/challenge/[id]/diary/[actionId]"]
    S8["화면8 · 주간 정산<br/>/recap"]
    S9["화면9 · 설정<br/>/settings"]
  end

  S4 -. "BottomNav · 인증 탭" .-> S5
  S4 -. "BottomNav · 서약서 탭" .-> S3
  S4 -- "'새 그룹 만들기' CTA" --> SN
  SN -- "생성 성공" --> S2
  S4 -- "'새 서약서 만들기' CTA" --> S2
  S4 -- "최근 피드 3건 탭" --> S6
  S4 -- "상단 '설정' 링크" --> S9
  S4 -- "'현황 보기' CTA" --> ChD

  S5 -- "제출 성공" --> S6
  S6 -- "피드 카드 '일기 편집'" --> S7
  ChD -- "정산 시트" --> S8
  S2 -- "초대링크 복사 완료" --> S3
  S3 -- "전원 서명 · active 전이" --> S4
```

---

## 2. 화면별 상태 플로우 (default / loading / empty / error / limited)

> DESIGN_BRIEF §7 상태 변이 체크리스트를 각 화면에 매핑. Claude Design이 **동일 파일에 조건부 렌더**로 출력할 상태들.

### 2.1 화면 5 — 인증 `/action` ★ 코어

```mermaid
flowchart TD
  S5[화면5 · default<br/>사진 슬롯 · 종류 세그먼트 · 키워드 칩]
  S5 -- "사진 슬롯 탭" --> P[카메라/라이브러리 picker]
  P -- "사진 선택" --> S5P[화면5 · 사진 있음]
  S5 -. "사진 없음" .-> S5EM[화면5 · empty<br/>사진 슬롯 dim · 제출 CTA disabled]

  S5P -- "운동 종류 탭 🏃🏋️🧘✨" --> S5K[키워드 풀 페이드 전환<br/>6~9개 노출]
  S5K -- "칩 1~3개 선택" --> S5R[제출 CTA active]
  S5K -- "4번째 칩 탭" --> S5K2["first-in 자동 해제 후 선택"]
  S5K -- "🎲 다시 뽑기 (≤5회)" --> S5K
  S5K -. "남은 횟수 0/5" .-> S5LT[화면5 · limited<br/>다시 뽑기 disabled · 안내 copy]

  S5R -- "'✏️ 직접 쓰고 싶어요'" --> S5M[textarea 펼침<br/>0~100자]
  S5R -- "제출" --> S5L[화면5 · loading<br/>'AI가 일기를 쓰는 중...']

  S5L -->|성공 or 폴백| S6go[→ /feed]
  S5L -->|4.5s 타임아웃| S5L2["템플릿 폴백 (사용자 체감 성공)"]
  S5L -->|네트워크/서버 오류| S5E[화면5 · error<br/>Dialog · 재시도 버튼]
  S5L -->|키워드 커버리지 <1| S5L2
  S5L2 --> S6go
  S5E -- "재시도" --> S5L
  S5E -- "닫기" --> S5R
```

### 2.2 화면 4 — 홈 `/home`

```mermaid
flowchart TD
  S4[화면4 · default<br/>ProgressCard · 그룹 스트립 · 오늘 CTA · 피드 미리보기 3건]
  S4L[화면4 · loading<br/>스켈레톤]
  S4EM[화면4 · empty<br/>'첫 서약서 만들어볼까요?' · CTA]
  S4E[화면4 · error<br/>재시도 배너]

  Entry([RSC 진입]) --> S4L
  S4L -->|fetchActiveChallenge OK| S4Q{active 챌린지?}
  S4L -->|read 실패| S4E
  S4Q -->|있음| S4
  S4Q -->|없음| S4EM

  S4 -- "'오늘 인증하기' CTA" --> goS5[→ /action]
  S4 -. "오늘 이미 인증 완료" .-> S4LT[화면4 · limited<br/>CTA → '오늘 인증 완료 ✓' disabled]
  S4EM -- "'새 서약서 만들기'" --> goS2[→ /challenge/new]
  S4E -- "재시도" --> S4L
```

### 2.3 화면 8 — 주간 정산 `/recap`

```mermaid
flowchart TD
  S8[화면8 · default<br/>RecapHero · StatsRow · MembersList · MVP · 사진 콜라주]
  S8L[화면8 · loading<br/>스켈레톤]
  S8EM[화면8 · empty<br/>'아직 정산할 주가 없어요']
  S8LT[화면8 · limited<br/>미달 톤 · '이번 주는 아쉬웠어요']
  S8W[화면8 · default-win<br/>'이번 주 🎉 해냈어요!']

  Entry([RSC 진입]) --> S8L
  S8L -->|fetchRecap OK| S8Q{주간 데이터?}
  S8L -->|오류| S8E[화면8 · error]
  S8Q -->|없음| S8EM
  S8Q -->|달성| S8W
  S8Q -->|미달| S8LT

  S8W -- "'다음 주 시작' (그룹장만)" --> goS2[→ /challenge/new]
  S8LT -- "AccountInfoSheet · 마스킹 + 복사" --> Copy[📋 계좌번호 클립보드 복사]
  S8 -- "사진 콜라주 탭" --> S6go[→ /feed]
```

### 2.4 화면 2 — 서약서 생성 `/challenge/new`

```mermaid
flowchart TD
  S2_1[화면2 · Step 1<br/>제목 1~30자 · 주 목표 1~7회 · 벌금 세그먼트]
  S2_2[화면2 · Step 2<br/>초대 링크 + 카톡 공유 + 복사]
  S2_1L[화면2 · loading<br/>생성 중]
  S2_1E[화면2 · error<br/>validation / server]

  S2_1 -- "'다음' 탭" --> S2Q{zod 검증}
  S2Q -->|invalid| S2_1E
  S2Q -->|valid| S2_1L
  S2_1L -->|Server Action OK| S2_2
  S2_1L -->|서버 오류| S2_1E

  S2_2 -- "링크 복사" --> Tst1[sonner toast · 복사됨]
  S2_2 -- "카톡 공유 (share API)" --> Tst2[공유 sheet]
  S2_2 -- "완료" --> goS3[→ /pledge]
  S2_1E -- "재시도" --> S2_1
```

### 2.5 화면 3 — 서약서 서명 `/pledge`

```mermaid
flowchart TD
  S3[화면3 · default<br/>PledgeSheet · 멤버 상태 ⏳/✓ · 체크박스 서명]
  S3L[화면3 · loading]
  S3EM[화면3 · empty<br/>'서명할 서약서가 없어요']
  S3W[화면3 · default-all-signed<br/>풀스크린 컨페티 2초]
  S3LT[화면3 · limited<br/>이미 서명 완료 · read-only]

  Entry([RSC 진입]) --> S3L
  S3L -->|fetchPledge OK| S3Q{pending 서약서?}
  S3L -->|오류| S3E[화면3 · error]
  S3Q -->|없음| S3EM
  S3Q -->|있음 · 나 미서명| S3
  S3Q -->|있음 · 나 서명 완료| S3LT

  S3 -- "체크박스 + '서명하기' CTA" --> S3R[sign_and_maybe_activate RPC]
  S3R -->|전원 서명 → active| S3W
  S3R -->|일부 미서명 pending| S3LT
  S3R -->|RPC 오류| S3E
  S3W -- "2초 후" --> goS4[→ /home]
```

### 2.6 화면 6 — 피드 `/feed`

```mermaid
flowchart TD
  S6[화면6 · default<br/>인증 카드 리스트 · 사진 풀블리드 · AI 일기 3~5줄]
  S6L[화면6 · loading · 스켈레톤 카드 3개]
  S6EM[화면6 · empty<br/>'첫 인증을 올려볼까요?' · CTA]

  Entry([진입]) --> S6L
  S6L -->|fetchChallengeFeed OK| S6Q{items.length?}
  S6L -->|오류| S6E[화면6 · error]
  S6Q -->|0| S6EM
  S6Q -->|>0| S6

  S6 -- "카드 이모지 탭 🔥💪👏" --> Kudos[Kudos 배지 카운트 +1]
  S6 -- "카드 '일기 편집'" --> goS7[→ /challenge/[id]/diary/[actionId]]
  S6 -. "편집 시간 경과 후" .-> S6LT[화면6 · limited<br/>'일기 편집' disabled]
  S6EM -- "'인증하러 가기'" --> goS5[→ /action]
```

### 2.7 화면 7 — 일기 상세/편집 `/challenge/[id]/diary/[actionId]`

> **라우트 신설 제안** (DESIGN_BRIEF §6.7). 현재 미존재.

```mermaid
flowchart TD
  S7[화면7 · default<br/>사진 · 키워드 read-only 배지 · textarea · 재생성 1회]
  S7L[화면7 · loading · 재생성 중]
  S7W[화면7 · success · 저장됨 toast]
  S7LT[화면7 · limited<br/>편집 시간 만료 · read-only]

  Entry([진입]) --> S7Q{편집 가능 시간?}
  S7Q -->|만료| S7LT
  S7Q -->|가능| S7

  S7 -- "textarea 수정 + '저장'" --> S7R[Server Action]
  S7R -->|OK| S7W
  S7R -->|오류| S7E[화면7 · error]
  S7 -- "'🎲 다시 생성' (1회 남음)" --> S7L
  S7L -->|성공| S7
  S7L -->|0회 남음 후 탭| S7LT2[limited · 재생성 disabled]
  S7W -- "2초 후" --> goS6[→ /feed]
```

### 2.8 화면 1 — 로그인 `/login` · 초대 `/invite/[token]`

```mermaid
flowchart TD
  S1a[화면1a · default<br/>로고 · 카카오 CTA · 이메일 매직링크 secondary]
  S1aL[화면1a · loading · 링크 발송 중]
  S1aW[화면1a · success<br/>'이메일을 확인해주세요']
  S1aE[화면1a · error · 재시도 toast]

  S1a -- "이메일 입력 + '링크 받기'" --> S1aL
  S1aL -->|OTP 발송 OK| S1aW
  S1aL -->|오류| S1aE
  S1a -- "카카오 로그인" --> OAuth[카카오 OAuth]
  OAuth --> CB["/auth/callback"]

  S1b[화면1b · default<br/>그룹 정보 미리보기 · 로그인 유도]
  S1bLT[화면1b · limited<br/>72h 만료 · '새 초대를 요청해주세요']
  S1bEM[화면1b · empty<br/>유효하지 않은 토큰]

  S1b -- "로그인하고 합류" --> S1a
```

### 2.9 화면 9 — 설정 `/settings`

```mermaid
flowchart TD
  S9[화면9 · default<br/>알림 토글 2종 · Quiet Hours 안내 · 푸시 권한 · 로그아웃]
  S9L[화면9 · loading · 토글 반영 중]
  S9LT[화면9 · limited<br/>푸시 권한 차단 · 브라우저 설정 안내]

  Entry([진입]) --> S9Q{Notification.permission?}
  S9Q -->|granted/default| S9
  S9Q -->|denied| S9LT

  S9 -- "토글 변경" --> S9L
  S9L -->|Server Action OK| S9
  S9L -->|오류| S9E[화면9 · error toast]
  S9 -- "'로그아웃'" --> LO[signOut → /login]
```

---

## 3. 전역 가드 & 라우팅 시퀀스

```mermaid
sequenceDiagram
  participant U as User
  participant MW as middleware.ts
  participant L as (app)/layout.tsx
  participant P as page.tsx (RSC)
  participant SB as Supabase

  U->>MW: HTTPS request (any path)
  MW->>SB: auth.getUser() · 쿠키 refresh
  alt 미인증 & 비-예외 경로
    MW-->>U: 302 → /login
  else 인증 or 예외 경로
    MW->>L: next()
    L->>SB: getUser() 재확인
    alt 미인증
      L-->>U: redirect(/login)
    else 인증
      L->>P: render
      P->>SB: fetchXxx() (BFF reads)
      SB-->>P: data or RLS 차단
      P-->>U: HTML + RSC payload
    end
  end
```

---

## 4. 상태 적용 체크리스트 (per screen)

Claude Design이 각 화면 `.tsx` 출력 시 **동일 파일에 조건부로 포함**해야 할 상태:

| 화면 | default | loading | empty | error | limited |
|---|:---:|:---:|:---:|:---:|:---:|
| S5 인증 | ✅ | ✅ AI 쓰는 중 | ✅ 사진 없음 | ✅ Dialog | ✅ 다시 뽑기 0/5 |
| S4 홈 | ✅ | ✅ 스켈레톤 | ✅ 첫 서약서 | ✅ 재시도 | ✅ 오늘 인증 완료 |
| S8 Recap | ✅ 달성/미달 | ✅ | ✅ 주 없음 | ✅ | ✅ 미달 톤 |
| S2 생성 | ✅ 2-step | ✅ 생성 중 | — | ✅ validation | — |
| S3 서명 | ✅ | ✅ | ✅ 서약서 없음 | ✅ | ✅ 이미 서명 |
| S6 피드 | ✅ | ✅ 스켈레톤 | ✅ 첫 인증 | ✅ | ✅ 편집 시간 만료 |
| S7 일기편집 | ✅ | ✅ 재생성 | — | ✅ | ✅ 재생성 0/1, 시간 만료 |
| S1 로그인/초대 | ✅ | ✅ 발송 중 | ✅ 무효 토큰 | ✅ | ✅ 72h 만료 |
| S9 설정 | ✅ | ✅ 토글 반영 | — | ✅ | ✅ 푸시 차단 |

---

## 5. Changelog

- **v1.0** (2026-05-01) — 초판. DESIGN_BRIEF §2 화면 9개 × §7 상태 5종을 Mermaid로 직렬화. Claude Design 첨부용 단일 플로우 팩.
