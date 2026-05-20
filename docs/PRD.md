# 📐 [Codename: with-key] — POC PRD (Product Requirements Document)

> **문서 상태**: Draft v0.1 · **작성자**: Ian (Product Owner) · **작성일**: 2026-04-24
> **대상 독자**: 개발자 (FE / BE) · 디자이너 · QA
> **Pre-read**:
>
> - [IDEATION.md](./IDEATION.md) v1.0 — **왜 만드는가**
> - [TEAM_SHARE_KICKOFF_AGENDA.md](../.claude/drafts/TEAM_SHARE_KICKOFF_AGENDA.md) v0.2 — **무엇을 합의했는가** (로컬 전용)
> - [TEAM_SHARE_DESIGN_BRIEF.md](../.claude/drafts/TEAM_SHARE_DESIGN_BRIEF.md) v0.1 — **어떻게 보일 것인가** (로컬 전용)
> - [ONBOARDING.md](./ONBOARDING.md) v0.1 — **어떻게 개발할 것인가**
> - [VALIDATION.md](./VALIDATION.md) v0.1 — **무엇이 성공인가** (Week 2 검증)
>
> **이 문서의 역할**: **정확히 무엇을 만드는가** — 유저 스토리 · Acceptance Criteria · Edge Case · 측정 계획.

---

## 0. 이 문서를 읽는 법

- **개발자**: §3~§7 유저 스토리 · §8 데이터 모델 · §9 측정 이벤트 중심으로.
- **디자이너**: §3~§7의 UX 흐름 · §10 화면 인벤토리 중심으로.
- **QA**: §3~§7의 Acceptance Criteria · Edge Case · §11 성공 시나리오 중심으로.

> 이 문서의 모든 기능은 **POC 2주 안에 완성 가능해야 함**. 불가능하면 범위를 줄인다 (기능 삭제 ≠ 일정 연장).

---

## 1. 문서 범위 & 전제

### 1.1 이 PRD가 다루는 것

- MVP 5개 기능 (IDEATION §3의 #1~#5)
- 데이터 모델 / API 시그니처 / 이벤트 스키마
- 각 기능의 Acceptance Criteria · Edge Case · Error State
- POC 한정 Non-Functional Requirements

### 1.2 이 PRD가 다루지 않는 것

- 외부 데이터 연동 (MVP #6) — POC 이후
- 실제 벌금 정산 로직 — **"예정 금액 표시"만**
- 결제 / 환급 / 모임통장 — v1 이후
- 정교한 디자인 / 브랜드 시스템 — 킥오프 이후 별도 Design Brief
- 보안·감사 레벨 인증 — POC는 그룹 내부 공개만

### 1.3 전제 (킥오프에서 확정됨을 가정)

이 PRD는 아래가 이미 결정된 상태를 전제한다. 미결 시 Day 1 시작 금지.

- [ ] 기술 스택 6개 영역 (§9 IDEATION)
- [ ] 코드명 확정
- [ ] AI 월 예산 상한
- [ ] 테스트 그룹 모집 담당자
- [ ] **키워드 풀 v1** 작성 (운동 4종 × 각 12~18개) — Day 1 시작 전 하드코딩

---

## 2. 용어 사전 (Glossary)

| 용어                         | 정의                                                                                                 |
| ---------------------------- | ---------------------------------------------------------------------------------------------------- |
| **챌린지 (Challenge)**       | 그룹이 함께 수행하는 주간 단위 목표. 내부적으로는 범용 액션, UI는 "운동 챌린지".                     |
| **서약서 (Pledge)**          | 챌린지 참여 의사를 기록하는 서명 절차. `pending` 동안 초대·서명·멤버 확정을 진행한다.                |
| **인증 (ActionLog)**         | 개별 운동 수행 기록. **사진 + 운동 종류 + 키워드 칩(1~3개)** 이 핵심. 자유 메모는 선택 escape hatch. |
| **키워드 칩 (Keyword Chip)** | 운동 종류별로 랜덤 노출되는 6~9개의 태그 버튼. 1~3개까지 다중 선택. AI 일기 프롬프트의 주 입력.      |
| **🎲 다시 뽑기 (Reroll)**    | 키워드 칩을 새 랜덤 셋으로 교체. 풀에서 비복원 추출.                                                 |
| **Kudos**                    | 다른 멤버의 인증에 보내는 원탭 이모지 반응.                                                          |
| **예정 벌금**                | POC에서는 **표시만**. 실제 정산은 v1 이후.                                                           |
| **그룹장**                   | 챌린지 생성자. 조건 제안 권한. (POC 한정)                                                            |

---

## 3. 기능 #1 — 그룹 서약서

> IDEATION §3.1 대응. 핵심 기능 1호.

### 3.1 유저 스토리

**As-a** 그룹장 (민지),
**I want** 친구 3명에게 주간 운동 챌린지를 제안하고 서약서 서명을 받을 수 있다,
**So that** 전원 동의 하에 "되돌릴 수 없는" 챌린지를 시작할 수 있다.

### 3.2 UX 흐름

> 2026-05-14 UI 리비전 반영: 그룹 명시 생성 UI 폐기, 챌린지 생성 시 자동 그룹 (ADR-0003).
> 2026-05-20 초대 플로우 보정: `pending` 은 초대/서명/멤버 확정 창, `active` 는 코호트 고정 상태 (ADR-0009).

```text
[그룹장]                                [멤버]
  │                                      │
  ├─ 챌린지 조건 입력 (제목·빈도·종료일·벌금)
  │  └─ 첫 챌린지면 자동 그룹 생성       │
  │     ("{displayName}님과 친구들", 계좌 없이)
  ├─ 운영자 자가 서명                    │
  ├─ 초대 링크 생성 ──────────────────────▶ 링크 수신 (카톡 공유)
  │                                      ├─ 참여 (`/challenge/[id]/pledge`)
  │                                      ├─ 서약서 내용 확인
  │                                      └─ 서명
  ◀──── 서명 응답 확인 ──────────────────┤
  ├─ "혼자 시작하기" 또는
  │  "서명한 멤버로 시작하기"
  ├─ `active` 전이 (서명한 멤버만 코호트 고정)
  └─ 챌린지 시작!                         │
```

- 그룹 계좌는 **lazy 입력**: 정산 시점(§11 "정산 요청" 클릭 시) 또는 `/me` → 그룹 카드에서 설정. 근거: [ADR-0003](./adr/0003-2026-05-14-group-ux-implicit-auto-creation.md)

### 3.3 Acceptance Criteria

- **AC-1** 그룹장은 아래 필드로 챌린지를 생성할 수 있다:
  - 제목 (1~30자)
  - 타입 (POC 고정: `fitness`)
  - 목표 횟수 (주 1~7회, 기본 3회)
  - 기간 (7~90일, 사용자가 종료일 picker로 선택 — 최소 1주). 근거: [ADR-0004](./adr/0004-2026-05-14-end-date-picker-min-week.md)
  - 예정 벌금 (0~10,000원, 1,000원 단위 — 0원 허용). 근거: D-007 (#58 결정)
- **AC-2** 그룹장은 초대 링크를 생성할 수 있다. 링크는 토큰 기반, **72시간 만료**.
- **AC-3** 초대 링크를 연 사용자는 **카카오 로그인(1차) 또는 이메일 매직링크(비상 fallback, `NEXT_PUBLIC_ENABLE_MAGIC_LINK` env 토글)**로 가입/로그인 후 그룹에 참여할 수 있다. 카카오톡 등 SNS 인앱브라우저 진입 시 외부 브라우저 전환 가드 노출. 근거: [ADR-0008](./adr/0008-kakao-oauth-introduction.md).
- **AC-4** 그룹 멤버는 **1~4명** (그룹장 포함). 솔로(1인) 모드도 정식 — 자세한 동작은 §3.4. 5명째 참여 시 **차단** 안내. 근거: [ADR-0003](./adr/0003-2026-05-14-group-ux-implicit-auto-creation.md)
- **AC-5** 그룹장이 "혼자 시작하기" 또는 "서명한 멤버로 시작하기"를 명시적으로 누르면 `Challenge.status`가 `active`로 전이하고, **전원에게 "시작" 푸시** 전송.
- **AC-6** 챌린지가 `active` 된 후에는 현재 챌린지의 **참가자 추가/제거 불가** (freeze). 이후 초대 수락자는 그룹 멤버로만 합류하고 다음 챌린지부터 참가한다.
- **AC-7** 그룹장은 `pending` 상태에서만 조건 수정 가능.

### 3.4 Edge Cases

**솔로 챌린지 (1인 그룹) — POC 정식 모드.** 그룹장이 그룹에 혼자인 상태에서도 챌린지 생성·서명·진행 가능. 다만 생성 중 자가 서명만으로 자동 시작하지 않고, 그룹장이 "혼자 시작하기"를 눌러야 `active` 로 전이한다. 친구 합류는 챌린지가 `pending` 상태일 때 현재 챌린지 참가자로 편입되고, `active` 이후에는 그룹 멤버로만 합류해 다음 챌린지부터 함께한다. 코호트 분리는 `participant_count` 로 분석 단계에서 수행.

| 상황                                      | 동작                                                                                                                                                   |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 초대 링크 72시간 경과 후 접근             | "만료된 링크" 페이지 + 그룹장에게 "새 링크 요청" 버튼                                                                                                  |
| 서명 거부/미응답 멤버 발생 (그룹)         | `pending` 유지 · 그룹장이 서명한 멤버만으로 시작하면 미서명자는 현재 챌린지에서 제외되고 다음 챌린지부터 함께함                                        |
| 솔로 의도로 초대 중 친구가 합류 (Edge #2) | 친구가 `pending` 중 서명하면 "서명한 멤버로 시작하기"로 함께 시작 가능. 친구가 미응답이면 "혼자 시작하기" 가능                                         |
| 그룹장이 그룹을 이탈                      | POC는 **그룹 해산**. 다른 멤버 승격은 v1 이후.                                                                                                         |
| 같은 사용자가 2번 초대 수락               | idempotent 처리. 참여 중복 방지.                                                                                                                       |
| 시작 전 미서명자가 남아 있음              | 자동 기한 연장/자동 시작 없음. 그룹장이 기다리거나 서명한 멤버로 명시 시작.                                                                            |
| `groups.name` 빈 값                       | UI 에서 "이름 없는 그룹" 공통 fallback (home/group-strip, invite/accept-form 양쪽 일관).                                                               |
| 그룹 없이 챌린지 생성 시도 (첫 챌린지)    | `createChallenge` Server Action 이 그룹을 자동 생성 (`{displayName}님과 친구들`, 계좌 없이). 사용자에게는 그룹 생성 단계가 보이지 않음. 근거: ADR-0003 |
| 챌린지 삭제 시 자동 생성된 그룹           | 챌린지만 CASCADE 삭제, 그룹은 빈 채 유지. 그룹 자체 해산은 POC 후 (PR8 백로그 #108 G3).                                                                |

### 3.5 Error States

- `ERR_CHALLENGE_FULL` — 멤버 4명 초과
- `ERR_INVITE_EXPIRED` — 링크 72시간 경과
- `ERR_ALREADY_JOINED` — 중복 참여
- `ERR_SIGN_AFTER_ACTIVE` — `active` 후 서명 시도

---

## 4. 기능 #2 — 운동 인증 (ActionLog)

> IDEATION §3.2 대응. 핵심 기능 2호.

### 4.1 유저 스토리

**As-a** 챌린지 참가자,
**I want** 운동 완료 후 **사진 + 운동 종류 + 키워드 칩 1~3개 탭**만으로 인증할 수 있다,
**So that** 주간 목표에 카운트되고, **타이핑 없이도** 그룹 피드에 자연스러운 일기가 올라간다.

### 4.2 UX 흐름

> 2026-05-14 UI 리비전 반영: BottomNav 폐기 → 챌린지 상세 안 FAB(📷)로 진입 (ADR-0002). `/action` 라우트 폐기 → `/challenge/[id]/action` sub-route.

```text
[/challenge/[id] — 인증 피드 탭]
  │
  └─ FAB 📷 클릭 ([action_started] · §9.1)
       │
       ▼
  [/challenge/[id]/action]
       ├─ 사진 입력 (필수) — Fab 카메라 + 라이브러리 텍스트 링크 (dual entry)
       ├─ 운동 종류 세그먼트 (러닝/헬스/요가/기타 중 택1, 기본 "기타")
       │     └─ 선택 즉시 아래 키워드 칩이 해당 종류 풀에서 랜덤 6~9개로 갱신
       ├─ 키워드 칩 그룹 (필수, 1~3개 탭)
       │     ├─ "🎲 다시 뽑기" 버튼 → 풀에서 비복원 랜덤 재추출
       │     └─ "✏️ 직접 쓰고 싶어요" 링크 (접힘, 선택 escape hatch → 자유 메모 0~100자)
       └─ 제출
            │
            ├─ AI 일기 자동 생성 (§5) — 프롬프트 = 사진 caption + 운동 종류 + 선택 키워드[] + (있으면) 자유 메모
            ├─ 결과 모달 4상태 (10-A 성공 / 10-B 누적 / 10-C 신기록 / 10-D 실패) — §5.2
            ├─ 피드에 사진 카드로 노출 (challenge 상세 인증 피드 탭)
            └─ 그룹원에게 "완료" 푸시 (선택 — §6.4)
```

### 4.3 Acceptance Criteria

- **AC-1** 인증은 **`active` 상태의 챌린지**에서만 가능.
- **AC-2** 1회 인증 = **사진 1장 필수** + **운동 종류 필수** + **키워드 1~3개 필수**. 자유 메모는 선택(0~100자).
- **AC-3** 사진 용량 **최대 5MB**, 업로드 시 **1920px long-edge clamp + JPEG quality 0.85** 로 정규화 후 저장 (HEIC 자동 변환 포함). 구현: [`src/lib/image/prepare-upload.ts`](../src/lib/image/prepare-upload.ts).
- **AC-4** 같은 날 **2회 이상 인증** 시 **1회만 카운트** (중복 제출은 허용하되 카운트 무효).
  - 근거: 일부 사용자가 "아침/저녁 2번" 운동할 수 있으나 POC는 심플하게 1일 1회로 집계.
- **AC-5** 인증 시각(`createdAt`)은 **서버 타임** 기준. 클라이언트 조작 방지.
- **AC-6** 인증은 **삭제 불가** (챌린저스 선례 — 중도 취소 불가 원칙).
- **AC-7** 키워드/메모 수정은 **제출 후 5분 이내** 가능. 이후 freeze. (선택한 키워드만 편집 가능, 키워드 풀 자체는 변경 불가.)
- **AC-8** 운동 종류 변경 시 **현재 선택된 키워드가 새 풀에 없으면 자동 해제** 하고, 키워드 칩이 새 운동 종류의 풀에서 재추첨된다.
- **AC-9** **"다시 뽑기"는 인증 1건당 최대 5회**. 초과 시 버튼 비활성화 + 안내 (비용·남용 가드). 기본 노출 랜덤 1회는 카운트 제외.
- **AC-10** 키워드 풀은 **운동 종류 × 풀 = 하드코딩**. POC 기간 중 수정 금지 (분석 편향 방지).

### 4.4 Edge Cases

| 상황                                                      | 동작                                                                     |
| --------------------------------------------------------- | ------------------------------------------------------------------------ |
| 챌린지 종료일 이후 인증 시도                              | "챌린지 종료" 안내 · 제출 차단                                           |
| 사진 업로드 중 네트워크 끊김                              | 재시도 버튼. 로컬 draft 1시간 보관.                                      |
| 챌린지 시작일 이전 인증 시도                              | "시작 전" 안내 · 제출 차단                                               |
| 카메라 권한 거부                                          | "사진 선택"만 허용 (갤러리)                                              |
| 사진에 민감한 콘텐츠                                      | POC는 **자동 검열 없음**. 그룹 내부 공개이므로 사용자 책임. v1에서 검토. |
| 오프라인 상태에서 인증 시도                               | "네트워크 필요" 안내. POC는 오프라인 큐 미지원.                          |
| 같은 사진을 여러 챌린지에 재사용                          | POC는 **그룹 1개 한정** 이므로 자연히 방지됨.                            |
| 키워드 0개로 제출 시도                                    | CTA 비활성화 · "키워드 1개 이상 선택" 툴팁                               |
| 키워드 4개째 탭                                           | 먼저 선택된 칩 1개 **자동 해제 + 흔들림 애니메이션** (3개 한도 시각화)   |
| "직접 쓰고 싶어요" 열었다 접은 후 메모만 입력, 키워드 0개 | 키워드 필수 검증 유지 (AC-2). 키워드 1개+ 선택 유도.                     |
| "다시 뽑기" 5회 초과                                      | 버튼 회색 + 캡션 "너무 많이 뽑았어요 😅 지금 뜬 것 중에 골라보세요"      |
| 키워드 풀이 9개 미만(드물게)                              | 풀 크기만큼 노출 · "다시 뽑기" 숨김                                      |

### 4.5 Error States

- `ERR_NOT_ACTIVE` — 챌린지가 `active` 아님
- `ERR_PHOTO_REQUIRED` — 사진 없음
- `ERR_PHOTO_TOO_LARGE` — 5MB 초과 (AC-3 갱신, 2026-05-14)
- `ERR_OUT_OF_PERIOD` — 챌린지 기간 외
- `ERR_EDIT_LOCKED` — 5분 이후 수정 시도
- `ERR_KEYWORDS_REQUIRED` — 키워드 0개로 제출 시도
- `ERR_KEYWORDS_LIMIT` — 키워드 4개 이상 시도 (UI에서 자동 해제되므로 실사용 경로에서는 미발생)
- `ERR_REROLL_LIMIT` — 다시 뽑기 5회 초과

### 4.6 키워드 풀 (POC v1 — Day 1 하드코딩)

> 운동 종류당 12~18개. **감정 · 강도 · 환경 · 결과**의 4축 믹스로 구성. POC 중 변경 금지.
> 아래는 초안. 킥오프 이후 디자이너+PO 2인이 Day 1 첫 2시간 내 확정.

| 종류    | 풀(초안, 확정 필요)                                                                                                            |
| ------- | ------------------------------------------------------------------------------------------------------------------------------ |
| 🏃 러닝 | 상쾌한 · 땀범벅 · 숨참 · 느긋한 · 페이스업 · 새벽공기 · 음악과함께 · 혼자만의시간 · 비맞음 · 더위사냥 · 강변뷰 · PR갱신        |
| 🏋️ 헬스 | 가슴데이 · 등데이 · 하체데이 · 스쿼트 · 데드리프트 · 펌핑 · PR도전 · 무거운날 · 가벼운날 · 거울앞 · 폼체크 · 트레이너칭찬      |
| 🧘 요가 | 명상 · 스트레칭 · 유연성 · 버전업 · 고요함 · 밸런스 · 호흡집중 · 새벽요가 · 피곤한날 · 회복중 · 하타 · 인요가                  |
| ✨ 기타 | 땀나는 · 기분좋은 · 가벼운 · 힘들었던 · 동기부여 · 재밌는 · 루틴유지 · 오늘만! · 새로운시도 · 무리안함 · 짧게집중 · 친구와함께 |

**선정 기준**:

- 2~6자 한국어 (길면 칩 줄바꿈 발생)
- 민지 페르소나 톤 (전문용어 · 하드코어 어휘 배제)
- **중립/긍정 70% + 고통/실패 뉘앙스 30%** (Design Brief §1.4 "실패에도 따뜻하게")
- 이모지 2개까지 허용 (예: "🔥불태움")

---

## 5. 기능 #3 — 원탭 키워드 → AI 운동일기

> IDEATION §3.3 대응. 핵심 기능 3호. **기록 부담을 줄이는 결정적 기능**.
> **설계 철학**: 사용자는 **타이핑 없이 키워드 1~3개만 탭** 하면 된다. AI는 그 키워드를 "재료"로 받아 3~5줄 일기를 짠다. 키워드를 사용자가 직접 골랐기 때문에 **"AI가 써준 게 아니라 내가 고른 걸 AI가 다듬은 것"** 이라는 자기 귀인 효과를 유도해 수용률을 높인다.

### 5.1 유저 스토리

**As-a** 챌린지 참가자 (민지),
**I want** 인증 직후, **내가 탭한 키워드**를 바탕으로 AI가 운동일기를 자동 생성한다,
**So that** 매번 메모 타이핑 없이도 **"내 말 같은"** 기록이 쌓인다.

### 5.2 UX 흐름

```text
[인증 화면 — 키워드 탭 상태]
  │  사용자: 🏋️ 헬스 + [하체데이][펌핑] 선택
  ↓
[제출]
  │
  ├─ 서버: ActionLog 생성 (selected_keywords 저장)
  ├─ 서버: AI 호출
  │    입력: {activityType: "gym", keywords: ["하체데이","펌핑"], photoCaption?: ..., memo?: ""}
  │    출력: 3~5줄 한국어 일기 (선택 키워드를 반드시 1회 이상 자연스럽게 포함)
  ├─ AI 응답 <= 5초
  │  ├─ 성공 → action_log 갱신 + 피드 노출
  │  └─ 실패 → **키워드 활용 템플릿 폴백**
  │         e.g. "{name}님이 오늘 {activityType}에서 {kw1}, {kw2}한 시간을 보냈어요 💪"
  ├─ 결과 모달 (`ActionResultDialog`, variant prop 으로 4 분기)
  │  ├─ 10-A AI 일기 결과 — AI 또는 폴백 텍스트 + 다시 생성 + 편집
  │  ├─ 10-B 누적 인증 카운터 — 연속 N일째 (Day Slider)
  │  ├─ 10-C 신기록 달성 — 개인 PR 갱신
  │  └─ 10-D 인증 실패 — 마감 놓침 + 벌금 누적
  └─ 사용자:
       ├─ 일기 편집 (5분 이내)
       └─ 재생성 요청 (1회 추가, 비용 가드)
```

### 5.3 Acceptance Criteria

- **AC-1** AI는 **OpenAI 4o-mini** (또는 킥오프 결정 모델) 호출. 사용자 개인정보 미포함 프롬프트.
- **AC-2** **프롬프트 입력 = (a) 운동 종류 + (b) 선택 키워드 배열 [1~3] + (c) 자유 메모(선택, 있으면 포함) + (d) 사진 caption(선택)**. (b)는 **필수 입력**.
- **AC-3** 출력: **3~5줄 한국어 일기** (존댓말 고정). 150자 이하.
  - 출력에는 **선택 키워드 각각을 최소 1회 자연스럽게 포함**해야 한다 (프롬프트 제약). 포함 누락 시 프롬프트가 1회 self-retry.
- **AC-4** 응답 시간 **P95 < 5초**. 초과 시 타임아웃 → **키워드 활용 템플릿 폴백** (AC-8).
- **AC-5** 재생성 버튼 = **1회 추가 호출만** 허용 (총 2회 소비). 이후 템플릿 고정.
- **AC-6** 사용자 편집 기록은 `FeedItem.editedAt`으로 저장. 편집 vs 원본 둘 다 조회 가능 (internal만).
- **AC-7** 월 AI 비용이 **사전 설정 한도 (예: 월 50,000원)** 초과 시 자동 **템플릿 모드**로 전환 · 운영 알림.
- **AC-8** **템플릿 폴백은 키워드를 활용**해야 한다. 예: `"{name}님, 오늘 {activityType}에서 {kw1} · {kw2} 🔥 수고하셨어요!"` — 사용자 체감상 AI 실패가 드러나지 않을 것.
- **AC-9** 토큰 사용량은 **평균 프롬프트 ≤ 250 tokens · 응답 ≤ 200 tokens** 를 목표로 설계. 키워드 기반 정규화 입력으로 자유 메모 대비 **예측 편차 < ±20%**.

### 5.4 Edge Cases

| 상황                                    | 동작                                                                                    |
| --------------------------------------- | --------------------------------------------------------------------------------------- |
| AI API 타임아웃                         | **키워드 활용 템플릿 폴백** (AC-8) — 사용자에게는 성공처럼 노출                         |
| AI 응답에 키워드 누락                   | 1회 self-retry(instructed). 재실패 시 템플릿 폴백.                                      |
| AI 응답에 부적절 단어 포함              | POC는 **필터링 미적용** (월 호출 수 적음 가정, 키워드 통제로 리스크 낮음). v1에서 검토. |
| 키워드만 있고 메모·caption 0            | AC-2의 필수 입력(a)+(b) 만으로 생성. 정상 동작.                                         |
| "직접 쓰고 싶어요"로 메모 입력한 케이스 | 프롬프트에 memo 포함. 키워드와 메모가 상충하면 **메모를 우선** 하도록 프롬프트에 명시.  |
| 사용자가 재생성 2회 초과 시도           | "AI 생성 한도 초과" 안내 · 편집으로 유도                                                |
| 비용 한도 초과                          | 사용자 UI에는 **자연스러운 키워드 템플릿** 만 노출. 운영 Slack에 알림.                  |
| 한국어 외 언어 입력 (메모 경로)         | 프롬프트에 "한국어 출력" 강제.                                                          |

### 5.5 Error States

- `AI_TIMEOUT` — 5초 초과 (사용자에게는 노출 없이 키워드 폴백)
- `AI_KEYWORD_MISSING` — 응답에 선택 키워드 누락 (1회 retry → 폴백)
- `AI_BUDGET_EXCEEDED` — 월 한도 초과 (운영 알림 only)
- `AI_REGENERATE_LIMIT` — 재생성 2회 초과

### 5.6 프롬프트 시스템 설계 (요약)

```text
[System]
너는 2030 직장인의 운동 일기를 3~5줄, 150자 이하, 존댓말로 써준다.
반드시 아래 '필수 키워드'를 각각 1회 이상 자연스럽게 포함한다.
과장·훈계·영어 금지. 이모지는 최대 1개.

[User]
운동 종류: {activityType}
필수 키워드: {kw1}, {kw2}, {kw3?}
메모: {memo?}        // 있을 때만
사진 설명: {caption?} // 있을 때만

[출력 형식] 3~5줄 일기만. 인사말/헤더 금지.
```

> 상세 프롬프트 버저닝은 `lib/ai/prompts.ts` 1파일로 관리 (엔지니어링 온보딩 §6.2).

---

## 6. 기능 #4 — 시작 & 리마인드 알림

> IDEATION §3.4 대응. **알림 없이 서비스 성공 불가능** (IDEATION §4.4).

### 6.1 유저 스토리

**As-a** 챌린지 참가자,
**I want** 그룹원의 시작 / 마감 임박을 **실시간** 받는다,
**So that** "쟤 했네, 나도 해야지" 의 사회적 압박으로 움직이게 된다.

### 6.2 알림 카테고리 (2026-05-14 UI 리비전 — 4 카테고리)

> 2026-05-14 모킹업 §13 반영: 카테고리 탭 4개 (전체 / 리마인더 / 친구 인증 / 벌금). `notifications` 테이블은 신설하지 않고 **클라이언트 IndexedDB(IDB) 캐시** 채택 — Service Worker `push` 핸들러가 payload 의 `type`/`category`/`targetUrl`/`challengeId` 를 IDB 에 적재. 라우트: `/notifications`.

| 카테고리 (UI 탭) | type               | 트리거                                        | 수신자              | 메시지 예시                                         |
| ---------------- | ------------------ | --------------------------------------------- | ------------------- | --------------------------------------------------- |
| **전체**         | — (집계)           | —                                             | —                   | —                                                   |
| **리마인더**     | `start`            | 사용자가 챌린지 상세에서 FAB 카메라 클릭      | 그룹원 중 본인 제외 | "JJ님이 운동을 시작했어요!"                         |
| **리마인더**     | `deadline`         | 당일 미인증 사용자에게 **챌린지 종료 24h 전** | 해당 개인           | "오늘 인증 안 하면 이번 주 실패! 예상 벌금 9,000원" |
| **리마인더**     | `missed_yesterday` | 어제 인증 실패 자정 갱신                      | 해당 개인           | "어제 인증을 놓쳤어요. 오늘 다시 시작해보세요"      |
| **친구 인증**    | `friend_action`    | 그룹원이 인증 완료 (선택 — §6.4)              | 그룹원 중 본인 제외 | "JJ님이 오늘 인증했어요 💪"                         |
| **벌금**         | `penalty_added`    | 인증 실패로 벌금 추가                         | 해당 개인           | "벌금이 추가됐어요 (+5,000원, 누적 5,000원)"        |

### 6.3 Acceptance Criteria

- **AC-1** 알림 채널 = **Web Push (PWA)** 우선. 카카오 알림톡은 **별도 옵트인** (POC는 Web Push만으로 시작, 킥오프에서 알림톡 추가 결정 시 병행).
- **AC-2** 시작 알림은 **1일 최대 1회** 발송 (동일 사용자 중복 탭 시 첫 탭만).
- **AC-3** 마감 임박 알림은 **챌린지 종료 24h 전 단 1회** 발송.
- **AC-4** 알림 본문에 **구체적 정보** 포함 (Setlog 교훈: "답장했습니다"만 표시 금지).
- **AC-5** **새벽 2시~7시 발송 금지** (Quiet Hours).
- **AC-6** 사용자는 그룹 설정에서 **알림 종류별 on/off** 가능.
- **AC-7** 푸시 권한 미허용 상태에서 챌린지 상세 FAB 카메라 첫 클릭 시 **1회 권한 요청 모달** 노출 (BottomNav 폐기 후 진입점 변경, ADR-0002). 디자인 디테일은 모킹업 명시 없음 — 표준 OS 권한 시트 사용.

### 6.4 Edge Cases

| 상황                                  | 동작                                   |
| ------------------------------------- | -------------------------------------- |
| 알림 권한 거부 후 재허용              | 기존 구독 삭제 후 신규 구독 등록       |
| 그룹원이 1명뿐 (그룹장만)             | 시작 알림 수신자 0명 → 서버 레벨 스킵  |
| 이미 인증 완료한 사용자에게 마감 알림 | 필터링하여 미발송                      |
| Quiet Hours 중 트리거                 | 다음 허용 시각까지 큐잉. 만료 시 폐기. |
| 같은 사용자가 시작 탭을 1일 여러 번   | 첫 탭만 알림 발송, 이후는 서버 no-op   |

### 6.5 Error States

- `ERR_PUSH_NOT_SUBSCRIBED` — 구독 없음 (조용히 무시)
- `ERR_PUSH_EXPIRED` — 토큰 만료 (재구독 유도)

---

## 7. 기능 #5 — 원탭 응원 (Kudos)

> IDEATION §3.5 대응. **Strava 2025 데이터 근거**: kudos 140억 개 · 댓글 대비 허들 압도적 낮음 · 사진 있으면 3.1배.

### 7.1 유저 스토리

**As-a** 그룹원,
**I want** 친구의 인증에 **1탭으로** 응원을 보낸다,
**So that** 긴 댓글 없이도 "봤어, 잘했어" 를 가볍게 전달할 수 있다.

### 7.2 UX 흐름

```text
[피드 화면 — 인증 카드]
  │
  ├─ 사진
  ├─ 운동 종류 · AI 일기
  └─ 하단 바: [🔥] [💪] [👏]   <3개 고정 이모지>
       │
       └─ 탭 → +1 · 즉시 애니메이션 · 카운트 업데이트
            │
            └─ (선택) 인증 작성자에게 "{name}님이 🔥 응원!" 알림
```

### 7.3 Acceptance Criteria

- **AC-1** 이모지는 **POC 한정 3개 고정** — `🔥` `💪` `👏`. 2026-05-14 모킹업 §8-A 의 라벨/카운트는 시각만 매핑하고 enum 자체는 유지 (B11 결정 — 옵션 a). `kudos.emoji` enum 변경 시 BE_SCHEMA §5.8 + spec-required PR 동반 필요.
- **AC-2** 동일 사용자가 동일 인증에 같은 이모지 **최대 1회**.
- **AC-3** 다른 이모지는 각각 1회씩 허용 (한 인증에 사용자당 최대 3개 kudos).
- **AC-4** 본인 인증에 **kudos 불가** (Strava도 self-kudos 금지).
- **AC-5** kudos 카운트는 **실시간 반영** (POC는 polling 3초 간격 or Supabase Realtime).
- **AC-6** kudos 발생 시 작성자에게 **푸시 알림은 미발송** (알림 피로도 경감). 피드 방문 시 "새 응원 N건" 배지만 표시.

### 7.4 Edge Cases

| 상황                   | 동작                                        |
| ---------------------- | ------------------------------------------- |
| 같은 이모지 중복 탭    | **토글** 로 동작 (두 번째 탭 = 취소)        |
| 네트워크 끊김 중 탭    | 낙관적 UI (즉시 +1) · 재연결 시 서버 동기화 |
| 서버 오류로 kudos 실패 | 낙관적 UI 롤백 + Toast "응원 실패"          |
| 작성자가 그룹 이탈     | 과거 kudos 유지 (조회만 가능)               |

### 7.5 Error States

- `ERR_KUDOS_SELF` — 본인 인증에 시도
- `ERR_KUDOS_DUPLICATE` — 같은 이모지 중복

---

## 8. 데이터 모델 — POC 스키마

> IDEATION §5 기반 구체화. Day 1 DB 스키마에 직접 투입 가능.

### 8.1 테이블 요약

```text
users
groups
group_members
challenges
challenge_participants
action_logs
feed_items
kudos
push_subscriptions
```

### 8.2 주요 컬럼

**users**

| 컬럼          | 타입        | 비고               |
| ------------- | ----------- | ------------------ |
| id            | uuid        | PK                 |
| display_name  | text        | 표시 이름 (1~20자) |
| avatar_url    | text        | nullable           |
| auth_provider | text        | `kakao` \| `email` |
| created_at    | timestamptz |                    |

**groups**

| 컬럼                     | 타입        | 비고                                                    |
| ------------------------ | ----------- | ------------------------------------------------------- |
| id                       | uuid        | PK                                                      |
| owner_id                 | uuid        | FK users                                                |
| name                     | text        | 1~30자, nullable                                        |
| status                   | text        | `active` \| `disbanded`                                 |
| bank_code                | text        | D-020, nullable. 금융결제원 3자리 코드.                 |
| account_holder           | text        | D-020, nullable. 1~30자.                                |
| account_number_encrypted | bytea       | D-020, nullable. AES-256-GCM `iv \|\| cipher \|\| tag`. |
| account_number_last4     | text        | D-020, nullable. 마스킹 표시용.                         |
| disbanded_at             | timestamptz | nullable                                                |
| created_at               | timestamptz |                                                         |

> **D-020 묶음 CHECK**: `bank_code` / `account_holder` / `account_number_encrypted` / `account_number_last4` 4개는 모두 NULL 이거나 모두 NOT NULL 이어야 한다. "last4 만 채워지는" 부분 상태 불가능.

**challenges**

| 컬럼           | 타입        | 비고                                                        |
| -------------- | ----------- | ----------------------------------------------------------- |
| id             | uuid        | PK                                                          |
| group_id       | uuid        | FK                                                          |
| title          | text        | 1~30자                                                      |
| type           | text        | POC 고정: `fitness`                                         |
| goal_count     | int         | 1~7 (주 단위)                                               |
| duration_days  | int         | 7~90 (사용자 종료일 picker 선택, 최소 1주 — ADR-0004)       |
| penalty_amount | int         | KRW, 0~10,000 / 1천 단위 (0원 허용 — D-007, migration 0025) |
| status         | text        | `pending` \| `accepted` \| `active` \| `closed`             |
| start_at       | timestamptz | 그룹장이 명시적으로 시작한 시각                             |
| end_at         | timestamptz | start_at + duration_days                                    |

**action_logs**

| 컬럼              | 타입        | 비고                                                              |
| ----------------- | ----------- | ----------------------------------------------------------------- |
| id                | uuid        | PK                                                                |
| challenge_id      | uuid        | FK                                                                |
| user_id           | uuid        | FK                                                                |
| activity_type     | text        | `running` \| `gym` \| `yoga` \| `other`                           |
| photo_url         | text        | 필수                                                              |
| selected_keywords | text[]      | 1~3개, `activity_type`의 풀에 속한 값만 허용 (CHECK or app-level) |
| shown_keywords    | text[]      | 사용자에게 노출된 칩 스냅샷 (재현/분석용)                         |
| reroll_count      | int         | 0~5                                                               |
| memo              | text        | 0~100자, 선택 escape hatch                                        |
| counted           | bool        | 1일 1회 집계 플래그                                               |
| created_at        | timestamptz | 서버 타임                                                         |
| edited_at         | timestamptz | nullable                                                          |

**feed_items**

| 컬럼              | 타입 | 비고            |
| ----------------- | ---- | --------------- |
| id                | uuid | PK              |
| action_log_id     | uuid | FK              |
| ai_summary        | text | AI 생성 3~5줄   |
| template_fallback | bool | AI 실패 시 true |
| regenerate_count  | int  | 0~2             |

**kudos**

| 컬럼                                 | 타입 | 비고                 |
| ------------------------------------ | ---- | -------------------- |
| id                                   | uuid | PK                   |
| feed_item_id                         | uuid | FK                   |
| user_id                              | uuid | FK                   |
| emoji                                | text | `🔥` \| `💪` \| `👏` |
| unique(feed_item_id, user_id, emoji) |      | 토글 제약            |

### 8.3 인덱스 최소 세트

- `challenges(group_id, status)`
- `action_logs(challenge_id, user_id, created_at DESC)`
- `action_logs(user_id, created_at DESC)` — "오늘 인증 여부" 조회
- `kudos(feed_item_id)`
- `action_logs USING GIN (selected_keywords)` — Week 2 키워드 분포 분석용

---

## 9. 측정 계획 (Event Tracking)

> IDEATION §6 Week 2 Day 9~10에 필요. **Day 1부터** 이벤트 로깅 켜 두어야 Week 2에 분석 가능.

### 9.1 이벤트 스키마

> 2026-05-14 UI 리비전: `action_started` · `feed_view` 의 **발사 위치**가 sub-route 로 변경됐으나 schema(이벤트 이름·속성) 자체는 무변경. `src/lib/analytics/schema.ts` 는 PR0~PR7 동안 손대지 않음. SoT 는 `analyticsEventSchema` 유니온.

| 이벤트                 | 발생 시점                                                     | 주요 속성                                                                                    |
| ---------------------- | ------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `user_signed_up`       | 가입 완료                                                     | provider, invitedBy                                                                          |
| `group_created`        | 그룹 생성                                                     | groupId, memberTarget                                                                        |
| `invite_sent`          | 초대 링크 생성                                                | groupId                                                                                      |
| `invite_opened`        | 링크 열림                                                     | groupId, fromOrganicUser                                                                     |
| `challenge_created`    | 챌린지 생성                                                   | challengeId, penaltyAmount, goalCount                                                        |
| `challenge_signed`     | 서명 완료                                                     | challengeId, userId                                                                          |
| `challenge_activated`  | 그룹장 명시 시작 → active                                     | challengeId, signToActiveMs, participantCount                                                |
| `action_started`       | 챌린지 상세 FAB 카메라 클릭 (challenge action sub-route 진입) | challengeId                                                                                  |
| `keywords_shown`       | 키워드 칩 랜덤 노출                                           | activityType, shownKeywords[], source(`initial` \| `reroll`)                                 |
| `keywords_reroll`      | "다시 뽑기" 탭                                                | activityType, rerollCount                                                                    |
| `keyword_selected`     | 칩 탭 (선택/해제)                                             | keyword, selectedCount, activityType, action(`add` \| `remove`)                              |
| `memo_fallback_opened` | "직접 쓰고 싶어요" 링크 열림                                  | -                                                                                            |
| `action_logged`        | 인증 제출                                                     | challengeId, activityType, selectedKeywords[], keywordCount, hasMemo, rerollCount, photoSize |
| `ai_generated`         | AI 일기 성공                                                  | actionLogId, latencyMs, fallback, keywordCoverage (포함된 키워드 수/선택 수)                 |
| `feed_view`            | 챌린지 상세 인증 피드 탭 활성화 (`/challenge/[id]`)           | unreadCount                                                                                  |
| `kudos_given`          | 응원 발송                                                     | emoji, feedItemId                                                                            |
| `notification_sent`    | 알림 발송                                                     | type (start / deadline)                                                                      |
| `notification_opened`  | 알림 탭                                                       | type                                                                                         |
| `penalty_displayed`    | 마감 임박 카드 노출                                           | amount                                                                                       |

### 9.2 Week 2에 답해야 할 질문과 이벤트 매핑

| §IDEATION 4.2 성공 기준 | 계산식                                                        |
| ----------------------- | ------------------------------------------------------------- |
| 1인당 주간 인증 횟수    | `COUNT(action_logged WHERE counted=true) / participant_count` |
| 그룹 유지율             | `COUNT(active challenges at day14) / COUNT(active at day1)`   |
| 서명률                  | `COUNT(challenge_signed) / COUNT(invite_opened)`              |

---

## 10. 화면 인벤토리 (디자인 범위)

> POC 한정 화면 목록. 각 화면은 **모바일 퍼스트**, 와이어프레임 수준으로 시작.
>
> **IA SoT는 [QA_REGRESSION_2026-05-14.md §1 화면 인벤토리](./QA_REGRESSION_2026-05-14.md)** — 모킹업 §1~§13 ↔ 라우트 ↔ 컴포넌트 1:1 매핑. 본 표는 PRD 차원의 디자인 범위 요약. 2026-05-14 UI 리비전 머지(PR1~PR7) 결과 반영.

| #   | 모킹업 §              | 화면                       | 라우트 (신)                                             | 핵심 구성                                                                                   |
| --- | --------------------- | -------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| 1   | §1                    | 온보딩 / 로그인            | `/login` (+ 첫 진입 4-슬라이드 온보딩)                  | 카카오 OAuth (1차) · 매직링크 fallback (env 토글) · 인앱뷰 가드 · 초대 토큰 보존 (ADR-0008) |
| 2   | §3 (생성) + §4 (공유) | 챌린지 생성 wizard         | `/challenge/new` + `/share/[id]` OG                     | 3-step (조건 → 오너 서명 → 초대 링크). 자동 그룹 (ADR-0003), 명시 시작 (ADR-0009)           |
| 3   | §6                    | 서약서 서명                | `/challenge/[id]/pledge`                                | 조건 미리보기 · 서약서 본문 · 서명 캔버스 · 멤버 상태                                       |
| 4   | §2                    | 홈 (챌린지 진행 중)        | `/home`                                                 | 인사·invited 배너·4-stats grid·진행 리스트·active 비참가자 "다음 챌린지부터" 상태           |
| 5   | §10-A                 | 인증 화면                  | `/challenge/[id]/action`                                | 사진 dual-entry · 운동 종류 · 키워드 칩 · 다시 뽑기 · 메모 escape                           |
| 6   | §8                    | 인증 피드                  | `/challenge/[id]` (피드 탭)                             | 인증 카드 리스트 · Kudos 바 · day 슬라이드                                                  |
| 7   | §10-A·B·C·D           | 일기/누적/신기록/실패 모달 | `/challenge/[id]/action` (등록 후 결과 모달, 4 variant) | AI 일기 · Day Slider · PR 갱신 · 벌금 누적                                                  |
| 8   | §11                   | 주간 정산                  | `/challenge/[id]/recap`                                 | Trophy 히어로 · 결과 카드 · 결과 공유 · 계좌 lazy prompt                                    |
| 9   | §12 + 자체 디자인     | 설정/마이페이지            | `/me` + `/me/challenges`                                | 프로필 · 알림 · 약관 · 로그아웃 + 운영/참여 챌린지 분리                                     |
| 10  | §13                   | 알림 센터 (신규)           | `/notifications`                                        | 4 카테고리 탭 · IDB 캐시 · 카드 클릭 → targetUrl navigate                                   |
| 11  | §9-A·9-B              | 그룹 상세 (신규)           | `/group/[id]`                                           | 멤버 · 계좌 lazy 입력 · 챌린지 목록                                                         |

> 폐기 라우트: `/action`, `/feed`, `/pledge`, `/recap`, `/group/new`, `/settings` — 모두 redirect 로 옛 진입점 보존 (ADR-0002).

---

## 11. 성공 시나리오 (Happy Path · QA용)

### 11.1 "민지의 2주" — E2E 시나리오

> 2026-05-14 UI 리비전 반영: 라우트가 모두 challenge sub-route 로 통합됨 (ADR-0002). 옛 `/feed`·`/action`·`/pledge`·`/recap`·`/settings` 는 redirect 로만 존재.

1. 민지가 단톡방에서 초대 링크를 받는다 → `/invite/[token]` ([invite_opened])
2. **카카오 OAuth 로그인** (ADR-0008 — 1차 경로) → `/auth/callback` 이 `accept_invite` RPC 자동 호출 → pending 챌린지가 있으면 `/challenge/[id]/pledge?welcome={그룹}` 진입, 이미 active 라면 `/challenge/[id]?joined_late=1` 에서 "다음 챌린지부터 함께해요" 상태 노출 ([user_signed_up provider=kakao], [invite_opened]). 매직링크는 `NEXT_PUBLIC_ENABLE_MAGIC_LINK=true` 토글 시 비상 fallback.
3. 서약서 내용 확인 → 서명 캔버스 ([challenge_signed])
4. 그룹장이 서명 응답을 확인하고 "혼자 시작하기" 또는 "서명한 멤버로 시작하기" 선택 → 챌린지 `active` ([challenge_activated]) → 시작 푸시 (카테고리: 리마인더)
5. Day 1 저녁, 헬스장에서 운동 후 `/challenge/[id]` 접속:
   - 챌린지 상세에서 **FAB 카메라** 클릭 → `/challenge/[id]/action` 진입 ([action_started])
   - 사진 dual-entry (카메라/라이브러리) · 🏋️ 헬스 선택 → 키워드 칩 자동 랜덤 노출 ([keywords_shown])
   - "뭐 나왔지?" 한 번 더 뽑기 ([keywords_reroll]) → `하체데이` · `펌핑` 탭 ([keyword_selected] × 2)
   - 제출 ([action_logged, selectedKeywords=["하체데이","펌핑"], hasMemo=false, rerollCount=1])
   - AI가 **"오늘은 하체데이, 스쿼트에서 펌핑이 제대로 왔어요. 내일 계단 조심해야겠네요 💪"** 생성 → 결과 모달 10-A ([ai_generated, latencyMs < 5000, keywordCoverage=2/2])
6. 모달 닫기 → `/challenge/[id]` 인증 피드 탭으로 복귀 ([feed_view]). 친구 JJ의 인증에 🔥 탭 ([kudos_given])
7. Day 4 오후, 1회 인증만 했고 마감 임박 알림 수신 ([notification_sent, type=deadline, category=reminder]) → `/notifications` 에서 카드 클릭 → `/challenge/[id]/action` navigate
8. Day 6까지 총 3회 인증 → 주간 목표 달성
9. Day 7 챌린지 자동 종료 → `/challenge/[id]/recap` 진입 시 Trophy 히어로 + "성공! 예상 벌금 0원" 확인

### 11.2 실패 시나리오

1. 민지가 Day 7까지 1회만 인증 → 목표 미달
2. 주간 정산: "예상 벌금 9,000원 (표시만)"
3. Day 8 이후 재도전 여부 결정 (v1 기능)

---

## 12. Non-Functional Requirements (POC)

| 영역           | 기준                                                                            |
| -------------- | ------------------------------------------------------------------------------- |
| **성능**       | 인증 제출 → AI 일기 **P95 < 5초** · 피드 로딩 **P95 < 1초**                     |
| **가용성**     | Vercel 기본값 (99%+). POC는 SLA 없음.                                           |
| **보안**       | HTTPS 전용 · Row Level Security (Supabase) · 사진은 pre-signed URL              |
| **프라이버시** | 사진/메모는 **그룹 내부만** · 외부 링크 공유 불가 · 사용자 탈퇴 시 30일 내 삭제 |
| **접근성**     | 기본 WCAG AA 노력 · POC 엄격 검증 X                                             |
| **브라우저**   | 모바일 Safari (iOS 16+) · Chrome (Android 10+) 우선                             |
| **한글 입력**  | IME 조합 중 제출 방지                                                           |
| **로깅**       | 서버 에러 Sentry (무료 플랜) · 이벤트 Supabase table + PostHog(옵션)            |

---

## 13. 의존성 & 전제 (Dependencies)

| 의존               | 출처                           | 리스크                            | 대응                                                                            |
| ------------------ | ------------------------------ | --------------------------------- | ------------------------------------------------------------------------------- |
| OpenAI API 키      | 사전 발급                      | 비용 · 지연                       | 월 예산 한도 · 템플릿 폴백                                                      |
| Supabase 무료 플랜 | 사전 발급                      | 용량 제한 (1GB 저장)              | 사진 자동 압축                                                                  |
| 카카오 로그인      | OAuth 앱 등록 (완료, ADR-0008) | OAuth 서비스 장애 / 동의항목 변경 | 매직링크 env 토글 fallback (`NEXT_PUBLIC_ENABLE_MAGIC_LINK=true` → 자동 재배포) |
| Web Push VAPID 키  | 자체 생성                      | -                                 | Day 1 생성                                                                      |
| 카카오 알림톡      | 별도 승인 (2주+)               | 심사 지연                         | **POC에서는 제외** · Web Push만                                                 |
| Vercel 무료 플랜   | 즉시                           | 빌드 시간 제한                    | -                                                                               |

---

## 14. Out of Scope — 명시적 비포함 (반복 강조)

| 항목                                         | 이유                                    | 재검토 시점               |
| -------------------------------------------- | --------------------------------------- | ------------------------- |
| 실제 벌금 결제/환급                          | 법무 선행 필요                          | v1                        |
| 스마트워치 / 건강 앱 연동                    | POC 스코프 초과                         | v2                        |
| 위치 기반 인증                               | 개인정보 부담                           | v1                        |
| 멀티 챌린지 타입 UI                          | POC는 운동만                            | v1                        |
| 그룹장 권한 양도                             | Edge Case 드묾                          | v1                        |
| 댓글                                         | Kudos로 시작 후 필요 여부 판단          | v1                        |
| 주간 브이로그 자동 영상                      | 복잡도 높음                             | v1 (IDEATION §7.3 백로그) |
| 인증 사진 자동 검열                          | POC는 소규모·신뢰 그룹                  | v1                        |
| 앱스토어 네이티브 앱                         | 웹/PWA로 충분                           | v2                        |
| 계좌번호 실명 검증 (오픈뱅킹/ARS)            | D-020 scope 밖. 오너 입력값은 UI 표시용 | v1                        |
| 그룹 계좌 N개 / 계좌 변경 이력 / 키 로테이션 | D-020 POC 단일 키                       | v1                        |

---

## 15. 리스크 & 완화

| 리스크                                         | 확률 | 영향 | 완화                                                                                       |
| ---------------------------------------------- | ---- | ---- | ------------------------------------------------------------------------------------------ |
| AI 월 비용 초과                                | 중   | 중   | 한도 모니터링 + 자동 템플릿 전환                                                           |
| 카카오 OAuth 운영 장애 / 동의항목 미일치       | 저   | 높   | 매직링크 env 토글 fallback (`NEXT_PUBLIC_ENABLE_MAGIC_LINK=true`, 분 단위 복구) — ADR-0008 |
| 테스트 그룹 모집 실패                          | 저   | 높   | 킥오프에서 담당자별 자원 1팀                                                               |
| 사용자가 사진 업로드 거부감                    | 중   | 중   | Day 10 인터뷰에서 확인, v1에 "메모만 인증" 옵션                                            |
| 키워드 풀이 민지 페르소나 톤과 안 맞음         | 중   | 중   | Day 10 "어색한 키워드" 질문 필수 · Week 2 중 풀 수정 금지(분석 편향) · v1에서 개편         |
| 키워드 동질화로 피드가 지루                    | 저   | 중   | 🎲 다시 뽑기 + 12~18개 풀 · Week 2 말 키워드 사용 분포 분석                                |
| AI가 키워드를 억지로 끼워넣어 어색             | 중   | 중   | self-retry 1회 · 폴백 템플릿도 키워드 포함 · 인터뷰에서 "어색한 문장 예시" 수집            |
| 자유 메모 escape hatch 과사용으로 가설 H4 왜곡 | 저   | 중   | `memo_fallback_opened` 이벤트로 모니터 · 20%+ 시 UX 재검토                                 |
| Supabase 프리 플랜 한도 도달                   | 저   | 중   | POC 2주 · 12명 규모에서는 충분                                                             |
| Push 권한 거부율 높음                          | 중   | 높   | 권한 요청 타이밍 최적화 (시작 탭 시점)                                                     |

---

## 16. PRD 변경 관리

- **스코프 변경**은 PO(Ian) 승인 필수. 메신저로 "스코프 추가 요청"을 명시.
- 추가는 원칙적으로 **"다른 기능 삭제와 함께만"** 허용 (일정 연장 ≠ 해답).
- 변경 시 **§17 Changelog** 갱신.

---

## 17. Changelog

- **v0.7** (2026-05-20) — **초대 중 pending 유지 + 오너 명시 시작** (Ian · ADR-0009)
  - §2/§3: 서약서를 "자동 active 전이"가 아니라 pending 동안의 초대·서명·멤버 확정 절차로 재정의.
  - §3.3 AC-5/AC-6: 전원 서명 자동 시작 → 그룹장의 "혼자 시작하기" / "서명한 멤버로 시작하기" 명시 시작으로 변경. active 이후 초대자는 그룹 멤버로만 합류.
  - §3.4 Edge Cases: 미응답 친구가 있어도 서명한 멤버로 시작 가능, active 이후 친구는 다음 챌린지부터 참가하는 UX 명시.
  - §9.1: `challenge_activated` 발생 시점을 그룹장 명시 시작으로 변경하고 `participantCount` 속성 반영.
  - §10/§11: 홈의 active 비참가자 "다음 챌린지부터 함께해요" 상태와 카카오 초대 콜백 분기 반영.
- **v0.6** (2026-05-20) — **카카오 OAuth 1차 경로 도입 + 인앱뷰 가드** (Ian · ADR-0008 · PR #61)
  - §3.3 AC-3: 카카오 로그인 1차 / 매직링크는 `NEXT_PUBLIC_ENABLE_MAGIC_LINK` env 토글 비상 fallback 으로 격하.
  - §10 화면 #1: 카카오 OAuth + 인앱뷰 가드(카카오톡·인스타·페북·네이버·라인) + welcome cushion 명시.
  - §11.1 시퀀스 step 2: 매직링크 → 카카오 OAuth + `/auth/callback` 자동 invite 가입 + `?welcome={그룹}` 배너.
  - §13 의존성: 카카오 OAuth 앱 등록 완료, 매직링크는 env 토글 fallback 으로 재정의.
  - §15 리스크: 카카오 승인 지연 → OAuth 운영 장애 / 동의항목 미일치 로 갱신.
  - migration 0027: `handle_new_auth_user()` NULL-safe 화 (카카오 이메일 미동의 케이스 폴백).
  - **운영 제약** (ADR-0008 §Consequences): Supabase GoTrue 카카오 provider 가 `account_email` hardcoded default 이므로 카카오 콘솔에 `카카오계정(이메일)` 선택 동의 등록 필수.
- **v0.5** (2026-05-16) — **2026-05-14 UI 리비전 cleanup** (Ian · PR8)
  - §3.2 UX 흐름: 그룹 명시 생성 단계 폐기 → 자동 그룹 (ADR-0003).
  - §3.4 Edge Cases: 자동 그룹 케이스 + 챌린지 삭제 시 그룹 보존 정책 추가.
  - §4.2 UX 흐름: BottomNav `/action` → 챌린지 상세 FAB → `/challenge/[id]/action` sub-route (ADR-0002).
  - §4.3 AC-3: 사진 정책 갱신 — 최대 5MB / 1920px long-edge / JPEG q 0.85 (실제 코드 정합).
  - §4.5 `ERR_PHOTO_TOO_LARGE` 임계값 10MB → 5MB.
  - §5.2: AI 일기 결과 모달 4 variant (10-A/B/C/D — AI 일기·누적·신기록·실패).
  - §6.2: 알림 2종 → 4 카테고리 (전체/리마인더/친구 인증/벌금) + IDB 캐시 + `/notifications` 라우트.
  - §6.3 AC-7: 권한 요청 트리거를 챌린지 상세 FAB 첫 클릭으로 변경.
  - §7.3 AC-1: Kudos enum 유지 (B11 옵션 a), 모킹업 라벨은 시각만 매핑.
  - §8.2 `challenges`: `duration_days` 7~90, `penalty_amount` 0~10,000, `end_at = start_at + duration_days` (D-007, ADR-0004 정합).
  - §9.1: `action_started` · `feed_view` 트리거 위치 갱신 (schema 무변경 — `src/lib/analytics/schema.ts` 손대지 않음).
  - §10: 화면 인벤토리 표 본체를 모킹업 §↔라우트↔구성 11행으로 재작성. 폐기 라우트 6개 명시.
  - §11.1: happy path 시나리오 라우트 갱신 (sub-route 통합 반영).
- **v0.4** (2026-05-06) — **친구 초대 · 수락 플로우 구현** (Ian · D-021)
  - §3 기능 #1: AC-2/AC-3/AC-4 구현분 착지. `createInvite` / `acceptInvite` Server Action + `accept_invite` RPC.
  - §9 이벤트: `invite_sent` · `invite_opened` 실제 발사 경로 연결.
  - §10 화면 #2: 챌린지 상세에서 공유 버튼 노출.
- **v0.3** (2026-05-06) — **멀티 그룹 + 계좌번호 기반 정산** (Ian · D-020)
  - §8.2 `groups` 테이블 컬럼 표 신설 — `bank_code`, `account_holder`, `account_number_encrypted`, `account_number_last4` + 묶음 CHECK.
  - §14 Out of Scope 에 "계좌번호 실명 검증", "그룹 계좌 N개 / 변경 이력 / 키 로테이션" 추가.
  - D-009 (카카오페이 송금 링크 + QR) 반전 — D-020 (앱 레이어 AES-256-GCM 암호화 계좌번호)으로 교체.
- **v0.2** (2026-04-24) — **인증·AI 일기를 "원탭 키워드" 모델로 전환** (Ian)
  - §2 용어 사전에 **키워드 칩 · 다시 뽑기** 추가
  - §4 인증: UX 흐름 재작성 · 키워드 1~3개 필수 + 메모 escape hatch · AC-2/7/8/9/10 신규 · Edge Case 5건 추가 · 키워드 풀 초안(§4.6) 첨부
  - §5 AI 일기: 프롬프트 입력을 키워드 중심으로 재설계 · AC-2/3/4/8/9 개정 · 템플릿 폴백도 키워드 포함 · §5.6 프롬프트 시스템 설계 신설
  - §8 `action_logs`에 `selected_keywords` · `shown_keywords` · `reroll_count` 컬럼 추가 + GIN 인덱스
  - §9 이벤트 5종 추가 (`keywords_shown`/`keywords_reroll`/`keyword_selected`/`memo_fallback_opened`) · 기존 `action_logged`/`ai_generated` 속성 확장
  - §10 화면 5 정의 갱신
  - §11.1 Happy Path를 키워드 플로우로 재작성
  - §15 리스크 4건 추가
- **v0.1** (2026-04-24) — PRD 초안 작성 (Ian) · MVP 5개 기능 상세 · 데이터 모델 · 이벤트 스키마 · Edge case · Out of scope

---

> _이 파일은 `gbike-labs/.gitignore`에 의해 커밋되지 않는 개인 드래프트입니다._
> _팀 공유 시 Notion / Slack / GitHub Wiki 등으로 복사해 사용하세요._
