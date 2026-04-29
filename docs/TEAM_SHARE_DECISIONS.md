# 🧭 윗키(With-key) — Decisions Log (ADR-lite)

> **목적**: 3개월 후에도 "**왜** 우리가 X를 선택했는지" 재구성 가능하게.
> **원칙**:
> - 의미 있는 결정 = **되돌리기 비용이 큰 선택**만 기록 (작은 코드 스타일 선택 제외).
> - 하나의 결정 = 하나의 `### D-NNN` 엔트리. **수정 금지** (덮어쓰려면 **새 엔트리로 supersede**).
> - 최신이 위. 번호는 단순 증가 (D-001부터).
> - **반드시 "되돌릴 조건"을 적는다** — 이게 빠지면 PIVOT 타이밍을 놓친다.
>
> **관련**:
> - [KICKOFF.md §2](./KICKOFF.md) — D0 결정은 모두 여기 D-001~D-0XX로 등록
> - [TEAM_SHARE_KICKOFF_AGENDA.md §7](../.claude/drafts/TEAM_SHARE_KICKOFF_AGENDA.md) — 원본 포맷 (로컬 전용)
> - [VALIDATION.md §7.3](./VALIDATION.md) — PIVOT 패턴
>
> **언제 기록?**
> - ✅ 기술 스택 선택 (DB, 모델, 호스팅…)
> - ✅ 스코프 변경 (기능 추가/삭제/연기)
> - ✅ 지표 정의 변경 (목표 수치 이동)
> - ✅ 팀/R&R 변경
> - ✅ 외부 조건 변화로 인한 방향 전환
> - ❌ 변수명, 폴더 구조, 라이브러리 minor 버전 — PR 메시지로 족함

---

## 📝 템플릿 (복사해서 사용 — 최신이 위)

```markdown
---

### D-NNN — [한 줄 제목]

- **날짜**: YYYY-MM-DD
- **상태**: ✅ Active | 🔄 Superseded by D-MMM | ⛔ Reverted (sunset YYYY-MM-DD)
- **참여자**: Ian, (이름)
- **맥락 (Context)**:
  - 무엇이 문제였나? 왜 결정이 필요했나?
  - 3줄 이내.
- **고려한 옵션 (Options considered)**:
  - A) (선택지) — 장점 / 단점
  - B) (선택지) — 장점 / 단점
  - C) (선택지) — 장점 / 단점
- **결정 (Decision)**:
  - 우리는 **___** 를 선택한다.
- **근거 (Reasoning)**:
  - 핵심 이유 2~3줄.
  - 측정 가능한 기준이 있으면 숫자로: "응답 지연 <8s 보장" 등.
- **영향 범위 (Impact)**:
  - 어떤 문서/코드/사람이 영향받는가?
  - (예) PRD §5, ENG §6.2, Supabase 스키마
- **되돌릴 조건 (Reversal trigger) ⚠️**:
  - "만약 ___ 이 ___ 를 넘으면 재논의한다." — 구체적 수치/이벤트
  - 예: "월 AI 비용이 $50 초과 3주 연속" / "memo fallback 사용률 ≥40%"
- **Follow-up**:
  - 이 결정으로 인해 해야 할 후속 작업 (있으면)
```

---

<!--
================================================================
아래부터 실제 결정을 append. 최신이 위에 오도록 (D-NNN 번호는 단순 증가).
================================================================
-->

---

### D-013 — BFF Read 레이어를 RSC 페이지에서 분리

- **날짜**: 2026-04-30
- **상태**: ✅ Active
- **참여자**: Ian
- **맥락 (Context)**:
  - 홈/챌린지 디테일/서약 페이지의 데이터 페칭을 `page.tsx` 에 inline `await supabase.from(...)` 으로 두면 POC 동작에는 문제 없음.
  - 주간 정산·피드 페이지네이션 같은 Day 2+ 요구가 들어오면 "쿼리 shape" 과 "UI 조립" 이 같은 파일에서 엉켜 캐싱 전략 교체가 어렵다.
- **고려한 옵션 (Options considered)**:
  - A) 페이지에 직접 호출 — 초기 속도 / Day 2 캐시 교체 비용 증가
  - B) `src/lib/db/reads/*.ts` 로 분리 — RSC 이점 유지 · view 타입 공유 / 파일 1개 추가
  - C) React Query + client fetch — Day 2 피드 친화 / SSR 비용 2배 + POC 범위 밖
- **결정 (Decision)**:
  - 우리는 **B) `src/lib/db/reads/*.ts` 로 분리** 를 선택한다.
  - 3개 read 지점(`fetchActiveChallenge` · `fetchChallengeDetail` · `fetchPendingPledge`) 분리 완료. page 는 supabase-js 를 직접 부르지 않는다.
- **근거 (Reasoning)**:
  - RSC 이점 유지 + material view · request-memo 교체 시 UI 미수정.
  - View 타입(`ActiveChallengeView` 등)이 page props 계약 역할.
- **영향 범위 (Impact)**:
  - `src/app/(app)/home/page.tsx` · `src/app/(app)/challenge/[id]/page.tsx` · `src/app/(app)/pledge/page.tsx` · `src/app/(app)/pledge/_components/pledge-sheet.tsx`.
  - 신규 디렉터리: `src/lib/db/reads/`.
- **되돌릴 조건 (Reversal trigger) ⚠️**:
  - Day 2+ 에 "cache 전략을 쓸 일이 없다" 는 결론이 나오면 inline 으로 원복.
  - read 함수가 page 별 1:1 대응으로만 쓰이고 재사용이 없다면 YAGNI.
- **되돌리기 비용**: 낮음. 3 함수를 page 본문으로 inline 하는 리팩터 수준.

---

### D-012 — Error taxonomy 6 코드 확정

- **날짜**: 2026-04-30
- **상태**: ✅ Active
- **참여자**: Ian
- **맥락 (Context)**:
  - Batch A~C 에서는 `ActionResult.error` 가 `unauthorized`/`invalid_input` 2 코드로 충분했으나, 실 DB 연동 후 RLS 거부(42501)·unique(23505)·대상 부재(PGRST116)·FK(23503) 가 등장.
  - UI 분기(로그인 화면 이동 vs 재시도 vs "없음" 안내) 가 각기 다르다.
- **고려한 옵션 (Options considered)**:
  - A) 모두 `upstream_error` 1 코드 — 코드 단순 / UX 분기 불가
  - B) 6 코드 유니언 (`unauthorized | forbidden | invalid_input | not_found | conflict | upstream_error`) — 의미 분리 / 컴파일 타임 exhaustiveness
  - C) HTTP 상태 코드 직수용 — 표준 / 의미 중복 + 프레임워크 종속
- **결정 (Decision)**:
  - 우리는 **B) 6 코드 유니언** 을 선택한다.
  - `mapSupabaseError()` 가 Postgres/PostgREST 코드를 이 6 코드로 투영. `makeUserMessage()` 는 6 코드 모두 한국어 카피 보유.
- **근거 (Reasoning)**:
  - (A) 는 UX 분기 불가. (C) 는 의미 중복 + 프레임워크 종속.
  - discriminated union 이라 컴파일 타임 exhaustiveness 체크 가능.
- **영향 범위 (Impact)**:
  - `src/lib/actions/response.ts` · `error-messages.ts` · `supabase-error.ts` 신설 + 모든 Server Action 호출부 업데이트.
- **되돌릴 조건 (Reversal trigger) ⚠️**:
  - 코드 3 개만 쓰이고 있다는 사용 통계가 6개월 간 지속되면 축소 고려.
- **되돌리기 비용**: 중간. 유니언 축소는 `ErrorCode` 참조 모든 호출부에 영향.

---

### D-011 — 로컬 dev 인증 경로는 Supabase Magic Link (원격 dev project)

- **날짜**: 2026-04-30
- **상태**: ✅ Active
- **참여자**: Ian
- **맥락 (Context)**:
  - 카카오 OAuth 는 redirect URL/키 발급/앱 심사가 필요해 POC 2주 내 진행 어려움.
  - 반면 RLS 검증은 real auth 없이 불가능 — `DEV_BYPASS_AUTH=1` 로는 RLS 를 한 줄도 검증 불가.
  - 원격 dev 프로젝트(`ohvcaytmzzwxkbxsmyny`)는 이미 발급되어 있어 Docker 로컬 스택은 불필요.
- **고려한 옵션 (Options considered)**:
  - A) `DEV_BYPASS_AUTH=1` 계속 유지 — 빠름 / RLS 검증 불가
  - B) Supabase email OTP (magic link) — real auth · RLS 검증 가능 / 이메일 한 번 확인 필요
  - C) 카카오 OAuth 즉시 연결 — 실사용 경로 / POC 범위 초과
- **결정 (Decision)**:
  - 우리는 **B) Magic Link** 를 선택한다.
  - 로컬 dev 기본 인증으로 magic link. 카카오 provider 는 v1 백로그.
  - dev DB 는 원격 Supabase 프로젝트 사용 (Docker 미사용) — `supabase link --project-ref` + `db push` 플로우.
- **근거 (Reasoning)**:
  - (A) 는 RLS 검증 불가 → Day 2 목표 충돌. (C) 는 POC 범위 초과 + 외부 의존.
  - 원격 dev 사용 시 Integration test 의 `truncate_test_data` 를 `@test.local` email 스코프로 좁히면 실 seed 데이터 보호 가능.
- **영향 범위 (Impact)**:
  - `src/app/(auth)/login/page.tsx` 이메일 입력 버튼, `src/app/(auth)/login/_actions.ts` 신설, `src/app/auth/callback/route.ts` 신설.
  - `src/app/(app)/layout.tsx` 의 `DEV_BYPASS_AUTH` 분기 제거.
  - `package.json`: `dev` 에서 `DEV_BYPASS_AUTH=1` 제거, `db:push`/`db:types` 스크립트 추가.
- **되돌릴 조건 (Reversal trigger) ⚠️**:
  - 카카오 OAuth 가 준비되면 magic link 는 dev 보조 경로로 축소.
  - 원격 dev 에서 여러 명이 충돌하는 상황이 생기면 per-contributor Supabase branch 로 전환 검토.
- **되돌리기 비용**: 낮음. login UI 교체 수준. `supabase/config.toml` + callback 확장이면 카카오 추가 가능.

---

### D-010 — AI 트레이너 판독 / 상호 인정·반려 UI 제거

- **날짜**: 2026-04-28
- **상태**: ✅ Active
- **참여자**: Ian
- **맥락 (Context)**:
  - 프로토타입(`TEAM_SHARE_UI_PROTO_TYPE.tsx`)은 "AI 트레이너 판독 중" + "인정/반려 투표" UI 전제였으나 PRD/BE_SCHEMA 에 판독·투표 스키마 미존재.
  - Design Brief §1.4 "실패에도 따뜻하게" 톤과 "반려" 투표 UX 가 충돌.
  - 상호 반려는 친구 단톡방 규범에서 관리하는 것이 자연스러움.
- **고려한 옵션 (Options considered)**:
  - A) 프로토타입 그대로 이식 — UX 풍부함 유지 / 스키마·스토리지·권한 정책 모두 추가 필요, 톤 충돌
  - B) Kudos 3 이모지(🔥/💪/👏) + 키워드 칩 인증 + AI 일기로 대체 — 톤 일관 · POC 스키마 충분 / "판독" 엄격성은 약화
- **결정 (Decision)**:
  - 우리는 **B) Kudos + 키워드 + AI 일기 3 축으로 축소** 를 선택한다.
- **근거 (Reasoning)**:
  - POC 목표는 "친구와 함께하는 따뜻한 동기부여" 검증 — 엄격한 판독·반려는 본 가설에서 우선순위 낮음.
  - Kudos 만으로도 사회적 강화 가설 측정 가능 (PRD §7 kudos 이벤트 기반).
- **영향 범위 (Impact)**:
  - PRD §4·§7 (인증·피드 플로우), BE_SCHEMA §8.5 (action_logs 만 사용, 투표/판독 테이블 미추가).
  - `src/app/(app)/action`, `src/app/(app)/challenge/[id]/_components/feed-card.tsx`.
- **되돌릴 조건 (Reversal trigger) ⚠️**:
  - POC 기간 중 "판독 엄격성이 참여율을 끌어올린다" 가설이 사용자 인터뷰에서 반복 등장할 경우 재검토.
  - Kudos 만으로 인증 신뢰도가 떨어진다는 정성 신호 ≥ TBD 건 누적 시.
- **되돌리기 비용**: 높음. UI + `action_logs` 스키마 확장 + 투표 테이블 + 알림 이벤트 모두 재도입 필요.

---

### D-009 — 카카오페이 결제 연동 대신 송금 링크 + QR

- **날짜**: 2026-04-28
- **상태**: ✅ Active
- **참여자**: Ian
- **맥락 (Context)**:
  - 벌금 정산에 카카오페이 결제 API 연동은 심사/PG 계약/키 관리 비용이 높음.
  - Design Brief §1.4 "실패에도 따뜻하게" 톤 유지가 POC 의 핵심 가설.
- **고려한 옵션 (Options considered)**:
  - A) 실결제 API 연동 — 정산 자동화·정확도 / POC 단계 심사/키 관리 비용 과도
  - B) 외부 송금 링크(`NEXT_PUBLIC_KAKAOPAY_SEND_URL`) + 클라 QR + 링크 복사 — POC 비용 낮음 / 실제 송금 자동화 없음
  - C) 링크만, QR 없음 — 가장 단순 / 모바일 웹→앱 전환 비대칭(QR 이 더 자연스럽다)
- **결정 (Decision)**:
  - 우리는 **B) 송금 링크 + 클라 QR + 링크 복사** 를 선택한다.
- **근거 (Reasoning)**:
  - POC 에서 검증해야 하는 것은 "정산 액션이 실제로 발생하는가" — 자동화 정확도가 아님.
  - `qrcode` 라이브러리 클라 생성으로 서버 비용 0.
  - `buildKakaoPayLink` 에 `ALLOWED_HOSTS` allowlist 고정으로 env 오염 시 open-redirect 차단.
- **영향 범위 (Impact)**:
  - BE_SCHEMA §13.2 (결제 연동은 백로그 이연), `src/lib/kakaopay/link.ts`, `src/app/(app)/challenge/[id]/_components/settlement-sheet.tsx`.
- **되돌릴 조건 (Reversal trigger) ⚠️**:
  - 유저가 "정산했다"고 주장하지만 실제 송금 누락률이 ≥ TBD% 로 측정되면 실결제 API 재검토.
- **되돌리기 비용**: 중간. `src/lib/kakaopay/link.ts` + `SettlementSheet` 두 모듈 교체.

---

### D-008 — BottomNav 3탭 도입

- **날짜**: 2026-04-28
- **상태**: ✅ Active
- **참여자**: Ian
- **맥락 (Context)**:
  - Design Brief §3.3 은 "POC 탭바 없음" 으로 기재했으나, PRD §10 9 화면 중 5 개가 탭 진입 후보.
  - 프로토타입(`TEAM_SHARE_UI_PROTO_TYPE.tsx`)도 3 탭 전제였고 단일 화면 스와이프 대비 학습 비용 낮음.
- **고려한 옵션 (Options considered)**:
  - A) 탭바 없이 단일 화면 스와이프/토글 — minimal shell / 화면 독립 라우팅 이점 상실, 접근성 저하
  - B) 3 탭 BottomNav (`홈 · 인증 · 서약서`) — 프로토타입·APG 패턴 / 탭 선택 UX 가 가장 흔함
- **결정 (Decision)**:
  - 우리는 **B) 3 탭 BottomNav** 를 선택한다.
- **근거 (Reasoning)**:
  - 모바일 Bottom Navigation 은 iOS/Android 공통 학습된 패턴 — 온보딩 비용 낮음.
  - 각 탭이 독립 라우트라 deep-link / 뒤로가기 히스토리 자연 처리.
- **영향 범위 (Impact)**:
  - `src/app/(app)/layout.tsx` 레이아웃 구조, `src/components/app-shell/bottom-nav.tsx`.
- **되돌릴 조건 (Reversal trigger) ⚠️**:
  - 사용자 인터뷰에서 탭바 때문에 콘텐츠 영역이 답답하다는 신호 ≥ TBD 건 누적 시 재검토.
- **되돌리기 비용**: 낮음. layout + bottom-nav 2 파일 제거면 원복.

---

### D-007 — 서약서 최대 금액 10,000원으로 하향

- **날짜**: 2026-04-28
- **상태**: ✅ Active
- **참여자**: Ian
- **맥락 (Context)**:
  - D-006에서 최대 기간이 3개월로 확장되며, 기존 최대 금액 20,000원을 유지할 경우 누적 벌금 규모가 과도해짐.
  - 초기 사용자의 심리적 허들을 낮춰 진입을 유도할 필요.
- **고려한 옵션 (Options considered)**:
  - A) 20,000원 유지 — 동기부여 강도 유지 / 누적 부담 과도, 진입 허들 ↑
  - B) 10,000원으로 하향 — 누적 부담 완화·진입 허들 ↓ / 동기부여 약화 가능
- **결정 (Decision)**:
  - 우리는 **B) 최대 금액 10,000원** 을 선택한다.
- **근거 (Reasoning)**:
  - 3개월 × 반복 주기 누적 시 20,000원 상한은 실질 부담이 과도.
  - POC 단계에서는 금액 강도보다 행동 데이터 확보가 우선.
- **영향 범위 (Impact)**:
  - PRD (서약서 금액 정책), `lib/validators` 금액 상한 검증, 정산/결제 로직, UI 카피(입력 폼 안내 문구)
- **되돌릴 조건 (Reversal trigger) ⚠️**:
  - 약속 파기율(이행 실패율) 지표가 목표 대비 과도하게 높아 "금액이 낮아 동기부여가 부족" 가설이 세워질 경우 상향 재논의.
  - 또는 사용자 피드백상 "상한 상향" 요구가 ≥ TBD건 누적 시 재논의 (정량 기준은 Day 3 스탠드업까지 TBD).
- **Follow-up**:
  - `lib/validators` 금액 상한 상수 업데이트.
  - PRD/서약서 관련 화면 카피 반영.

---

### D-006 — 서약서 최대 기간 3개월까지 확장

- **날짜**: 2026-04-28
- **상태**: ✅ Active
- **참여자**: Ian
- **맥락 (Context)**:
  - 기존 최대 기간이 짧아 사용자가 중장기 목표(예: 분기 단위 운동 루틴)를 서약서로 설정하기 어려움.
  - 장기 목표 지원이 제품 차별점과 리텐션에 긍정적일 것으로 판단.
- **고려한 옵션 (Options considered)**:
  - A) 기존 단기 상한 유지 — 단순성·리스크 한정 / 중장기 사용 사례 커버 불가
  - B) 최대 3개월까지 확장 — 중장기 목표 지원 / 누적 금액·운영 복잡도 증가
- **결정 (Decision)**:
  - 우리는 **B) 최대 3개월** 을 선택한다.
- **근거 (Reasoning)**:
  - 분기 단위가 사용자 목표 설정의 자연스러운 주기.
  - 누적 금액 부담 문제는 D-007(최대 금액 10,000원 하향)로 동반 조정.
- **영향 범위 (Impact)**:
  - PRD (서약서 기간 정책), `lib/validators` 기간 상한 검증, Supabase 스키마(서약서 기간 필드 제약), UI(기간 선택 컴포넌트)
  - D-007과 강한 결합 (금액 정책 동반 조정)
- **되돌릴 조건 (Reversal trigger) ⚠️**:
  - 3개월 기간 설정자의 중도 이탈율이 단기 설정자 대비 과도하게 높을 경우(예: 30일 리텐션 격차 ≥ TBD%) 상한 축소 재논의.
  - 또는 장기 서약서 이용률이 총 서약서 중 < TBD% 로 유의미하게 낮을 경우, 기능 대비 복잡도 재평가.
- **Follow-up**:
  - `lib/validators` 기간 상한 상수/검증 로직 업데이트.
  - 기간 선택 UX(슬라이더/프리셋) 범위 조정.
  - Supabase 마이그레이션 필요 여부 확인.

---

### D-005 — "각서" → "서약서" 명칭 변경

- **날짜**: 2026-04-28
- **상태**: ✅ Active
- **참여자**: Ian
- **맥락 (Context)**:
  - 기존 "각서" 표현이 강압적/법적 어조로 읽혀 일반 사용자에게 거리감을 유발.
  - 제품 톤앤매너(친숙·가벼운 동기부여)와 상충.
- **고려한 옵션 (Options considered)**:
  - A) "각서" 유지 — 강제성 인상 ↑ / 진입 심리적 허들 ↑, 제품 톤 불일치
  - B) "서약서"로 변경 — 친숙·자발적 뉘앙스 / 강제성 인상 약화 가능
  - C) 완전 신조어/브랜드 용어 — 차별화 / 의미 전달 불명확
- **결정 (Decision)**:
  - 우리는 **B) "서약서"** 로 통일한다.
- **근거 (Reasoning)**:
  - "서약"은 자발적 약속의 뉘앙스가 강해 제품 톤과 부합.
  - 의미 전달력(=약속 문서)은 유지하면서 심리적 허들을 낮춤.
- **영향 범위 (Impact)**:
  - 전 UI 카피, PRD, 디자인 시안, 랜딩/온보딩 문구, 푸시/알림 템플릿, `lib` 도메인 네이밍(코드 식별자는 영문 기준이라 영향 최소, 주석·문구만 조정)
- **되돌릴 조건 (Reversal trigger) ⚠️**:
  - 사용자 테스트에서 "서약서" 표현이 모호하거나 "약속/다짐" 등 다른 표현 선호가 유의미하게 높을 경우(≥ TBD%) 재명명 검토.
- **Follow-up**:
  - 기존 문서·드래프트의 "각서" 전수 치환(PRD, KICKOFF 등).
  - 디자인 시안 및 카피 가이드에 반영.

---

### D-004 — 사진 기반 운동 인증 기능은 POC 범위에서 제외(옵셔널로 보류)

- **날짜**: 2026-04-28
- **상태**: ✅ Active
- **참여자**: Ian
- **맥락 (Context)**:
  - 사용자가 찍은 사진이 실제 운동 관련인지 자동 판별하는 "사진 인증" 아이디어 제기.
  - AI 비전 모델 호출 비용이 호출당 누적되며 POC 예산에 부담.
- **고려한 옵션 (Options considered)**:
  - A) POC에 포함 — 인증 신뢰도 ↑, 차별점 / AI 비용 증가, 거짓양성/거짓음성 UX 비용
  - B) POC에서 제외(옵셔널 백로그) — 비용·스코프 통제 / 인증 신뢰도는 별도 설계 필요
  - C) 수동 인증(텍스트 기반)만으로 대체 — 비용 0 / 자동화 미흡
- **결정 (Decision)**:
  - 우리는 **B) POC에서 제외, 옵셔널 백로그로 보류** 를 선택한다.
- **근거 (Reasoning)**:
  - POC 핵심 가설(서약서 기반 행동 변화)에서 사진 인증은 필수 경로가 아님.
  - AI 비용은 D-001 이후 관리 대상이며, 비필수 기능으로의 비용 유입을 먼저 차단.
- **영향 범위 (Impact)**:
  - PRD 기능 범위(인증 플로우), `lib/ai` 사용량/비용 추정, 디자인 범위(인증 화면)
- **되돌릴 조건 (Reversal trigger) ⚠️**:
  - 내부/외부 테스트에서 "인증 신뢰도 부족"으로 인한 이슈가 ≥ TBD건 관측될 경우 재논의.
  - 또는 월 AI 예산 여유가 확보되고, 사진 인증 단가가 호출당 TBD원 이하로 내려갈 경우 재평가.
- **Follow-up**:
  - 옵셔널 백로그 문서에 "사진 기반 운동 관련성 인증" 항목 등록(간단 스펙 + 예상 비용 메모).
  - 대체 인증(수동/타임스탬프/위치 등) 방식 스코프 여부는 별도 결정(추후 D-NNN).

---

### D-003 — (안건명 미기록) 디자인 접근 추가 결정 — UX 플로우 차트 재확인

- **날짜**: 2026-04-24
- **상태**: ✅ Active ⚠️ D-002와 결정 내용 동일 — 안건명 미기록 상태로 KICKOFF §2.2에 별도 행으로 잡혀 임시 ID 부여. 다음 체크포인트에서 D-002로 통합 여부 결정.
- **참여자**: 쟁쟁, 샤쌤, 뚜뚜, 순진
- **맥락 (Context)**:
  - 킥오프에서 디자인 접근 안건이 두 번 다뤄짐. 두 번째는 안건명이 기록되지 않아 D-002와 별도로 식별됨.
  - 결과는 D-002와 동일하나, 추적 가능성을 위해 별도 엔트리로 남김.
- **고려한 옵션 (Options considered)**:
  - A) UX 플로우 차트 — 사용 흐름·의사결정 검증 우선 / 비주얼 산출물 부재
  - B) 제미나이(Gemini) GenAI 디자인 생성 — 빠른 시안 / 흐름 검증 부족
- **결정 (Decision)**:
  - 우리는 **A) UX 플로우 차트** 를 선택한다 (D-002 재확인).
- **근거 (Reasoning)**:
  - "디자인은 나중에 다루고 UX를 우선" 합의를 한 번 더 명시적으로 확정.
- **영향 범위 (Impact)**:
  - KICKOFF §2.1, §2.2, §2.7
- **되돌릴 조건 (Reversal trigger) ⚠️**:
  - 킥오프 기록상 "뒤는 없다" — **본 로그 원칙상 되돌릴 조건은 필수**이므로 잠정 기준 제안:
    - Day 7 Demo에서 플로우 차트만으로 사용자/내부 합의가 어려운 정황 ≥2회 발생 시 재논의.
- **Follow-up**:
  - Day 3 스탠드업에서 D-002와의 통합 여부 정리 후 본 엔트리 supersede 검토.
  - KICKOFF §2.2 "추가 디자인 접근 결정"의 안건명 명시화.

---

### D-002 — 초기 디자인 산출물로 UX 플로우 차트 채택

- **날짜**: 2026-04-24
- **상태**: ✅ Active
- **참여자**: 쟁쟁, 샤쌤, 뚜뚜, 순진
- **맥락 (Context)**:
  - "정교한 디자인" 기준과 초기 디자인 접근을 정해야 Day 1 진입 가능.
  - 흐름 검증과 비주얼 산출물 중 무엇을 먼저 잡을지 결정 필요.
- **고려한 옵션 (Options considered)**:
  - A) UX 플로우 차트 — 사용 흐름·의사결정 검증에 강함 / 비주얼 산출물 부재
  - B) 제미나이(Gemini) GenAI 디자인 생성 — 빠른 시안·정교한 비주얼 / 흐름 검증 부족
- **결정 (Decision)**:
  - 우리는 **A) UX 플로우 차트** 를 선택한다.
- **근거 (Reasoning)**:
  - 디자인은 나중에 다루고 UX(흐름)를 우선한다.
  - 정교한 비주얼은 흐름이 잡힌 뒤에 붙여도 늦지 않음.
- **영향 범위 (Impact)**:
  - KICKOFF §2.1, §2.7, R&R(디자인=뜌)
  - 후속 디자인 산출물(와이어프레임/시안) 일정에 직접 영향
- **되돌릴 조건 (Reversal trigger) ⚠️**:
  - 킥오프 기록상 "뒤는 없다" — **본 로그 원칙상 되돌릴 조건은 필수**이므로 잠정 기준 제안:
    - Day 7 Demo에서 플로우 차트만으로 외부 테스터/내부 합의 형성이 어려운 사례 ≥2회 발생 시 재논의.
    - 또는 Day 14 회고에서 "비주얼 부재가 핵심 리스크"로 식별 시 재논의.
- **Follow-up**:
  - UX 플로우 차트 초안 작성 (KICKOFF §4 Action Item).
  - Day 3 스탠드업에서 초안 점검.

---

### D-001 — 키워드 선택 방식으로 "키워드 검색" 채택

- **날짜**: 2026-04-24
- **상태**: ✅ Active ⚠️ 되돌릴 조건 보완 필요 (KICKOFF §3 #4, §4 Action Item)
- **참여자**: 쟁쟁, 샤쌤, 뚜뚜, 순진
- **맥락 (Context)**:
  - POC 범위(§4.3) 확정을 위해 키워드를 어떻게 노출/입력받을지 결정 필요.
  - 사용자 흐름의 첫 진입점이라 후속 UX·AI 프롬프트 입력 포맷에 영향이 큼.
- **고려한 옵션 (Options considered)**:
  - A) 키워드 리롤 — 우연성·재미 요소 / 검색 의도 미반영
  - B) 키워드 검색 — 검색 의도 직접 반영·시장 트렌드 부합 / 빈 결과 처리·키워드 풀 품질 의존
- **결정 (Decision)**:
  - 우리는 **B) 키워드 검색** 을 선택한다.
- **근거 (Reasoning)**:
  - 시장/제품 트렌드가 키워드 검색 쪽에 있다는 팀 판단.
  - 사용자가 원하는 키워드를 직접 찾는 패턴이 더 자연스럽다.
- **영향 범위 (Impact)**:
  - KICKOFF §2.1, §2.7
  - 키워드 풀 v1(R&R: 쟁뜌)
  - AI 일기 프롬프트 입력 포맷 (R&R: 쟁)
- **되돌릴 조건 (Reversal trigger) ⚠️**:
  - **킥오프 기록 미기재 — Action Item으로 보완 필요** (KICKOFF §3 #4, §4, §5).
  - 잠정 검토 기준 (Day 3 스탠드업까지 정량화):
    - 검색 → 키워드 선택 전환율 < TBD%
    - 빈 결과율 ≥ TBD%
    - 사용자가 "원하는 키워드가 없다"고 응답 ≥ TBD%
- **Follow-up**:
  - 되돌릴 조건 정량 기준 정의 (Day 3 스탠드업까지) — KICKOFF §4 Action Item.
  - 키워드 검색 기준과 검색 UX 초안 정리 — KICKOFF §4 Action Item.
  - 키워드 풀 v1 초안 (R: 쟁뜌) — KICKOFF §2.6.

---

## 📚 Supersession & Revert History

> 결정이 뒤집히면 여기에 한 줄씩 기록. 원본 엔트리는 상태만 바꾸고 본문 유지.

| Date | Decision | Change | 이유 |
|---|---|---|---|
| - | - | - | - |

---

> _이 파일은 `gbike-labs/.gitignore`에 의해 커밋되지 않는 개인 드래프트입니다._
