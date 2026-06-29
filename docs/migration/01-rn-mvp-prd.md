# fromwith RN MVP — PRD (Product Requirements Document)

> **Author**: pistachio8 (PO) · **Date**: 2026-06-02 · **Status**: Draft v0.1
> **Stakeholders**: FE(RN) · BE(Supabase) · 디자이너 · QA · 법무(게이트)
> **대상**: POC(Next.js PWA)를 React Native 앱으로 전환하면서 신기능 2종(포인트 정산·사진 자동검증)을 더한 MVP.
>
> **Pre-read** (의사결정 사슬):
>
> - [brainstorm](../strategy/2026-06-02-rn-mvp-feature-brainstorm.md) — 무엇을 더할지
> - [assumptions](../strategy/2026-06-02-rn-mvp-assumptions.md) — 무엇이 위험한지
> - [prioritization](../strategy/2026-06-02-rn-mvp-prioritization.md) — 무엇을 자를지(MVP 컷)
> - [startup-canvas](../strategy/2026-06-02-fromwith-startup-canvas.md) — 전략·비즈니스 모델
> - [00-rn-conversion-plan](./00-rn-conversion-plan.md) — 기술 전환(Expo·Phase)
> - [02-rn-migration-harness](./02-rn-migration-harness.md) — 어떻게 반복 빌드·검증하나(하네스)
> - [POC PRD](../PRD.md) — 포팅 기능 ①~⑤의 AC SoT (중복 명세하지 않고 참조)
>
> **이 문서의 역할**: RN MVP가 **정확히 무엇을 만드는가**. 포팅 기능은 POC PRD를 참조하고 RN 전환 델타만, 신기능 P1·P2는 풀 명세.

---

## 0. 전제 / 선행 게이트 (BLOCKING)

> 아래 두 게이트는 **MVP 빌드 진입 전 필수**다. P1·P2의 핵심 가정이 미검증(leap-of-faith)이라, 통과 못 하면 설계를 재고한다([assumptions §5](../strategy/2026-06-02-rn-mvp-assumptions.md)).

| #      | 게이트                       | 통과 기준                                                                                                                                     | 미통과 시                                                              |
| ------ | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| **G1** | **부정탐지 정밀도 PoC** (F1) | 실사용 사진셋으로 **정상 사진을 부정으로 오판(false-flag)하는 비율이 임계 이하**임을 확인(운동 분류가 아니라 부정탐지). 임계값은 PoC에서 확정 | 부정탐지 신호를 더 보수적으로(거의 안 막게) 조정하거나 사람검토 비중 ↑ |
| **G2** | **법무 검토 1회** (Vi1·Vi3)  | **ⓑ적립/번들 포인트**(현금 충전 아님)로 시작 시 환불 의무·사행성·선불전자지급수단 리스크 ≈0 확인                                              | 포인트 정산을 Fast-follow로 미루고 MVP는 포팅 + P2만                   |

**규제 우회 원칙 (MVP 고정)**: 보증금은 **현금 충전이 아니라 적립/구독 번들 포인트**로 시작한다. **왜**: 현금 충전 포인트는 환불 의무·사행성 규제를 부른다. 현금 충전은 G2 통과 후 Fast-follow. **미달분 개인 재분배(원금 초과)는 도박 위험으로 채택 안 함 — 정산은 "공동 주머니 방식"으로 확정(2026-06-02).**

---

## 1. Executive Summary

POC에서 검증된 "그룹 운동 각서" 핵심 루프(서약→인증→Kudos→정산)를 **React Native 앱으로 옮기고**, POC에서 "표시만"이던 벌금을 **실제 포인트 정산(P1)**으로, 그룹장 수동 판정 부담을 **사진 자동검증(P2)**으로 전환한다. 대상은 3~8인 친구·동료 운동 그룹이며, P1+P2가 합쳐져 POC의 연출용 벌금을 **실제 손실회피 + 0% 수수료 신뢰 차별점**으로 만든다.

## 2. Background & Context

- **POC 결과**: 핵심 루프 5종(서약서·인증·AI일기·피드/Kudos·정산표시)이 PWA로 동작. 단 정산이 "예정 금액 표시만"이라 손실회피가 **연출**에 그침([POC PRD §1.2](../PRD.md)).
- **왜 RN인가**: 네이티브 카메라·푸시·앱 상주가 인증 마찰을 낮추고 자동검증·알림 신뢰를 높인다. 기술 전환 설계는 [00-rn-conversion-plan](./00-rn-conversion-plan.md)에 완료.
- **왜 지금 이 두 기능인가**: [startup-canvas](../strategy/2026-06-02-fromwith-startup-canvas.md)가 closed-loop 포인트·0% rake·구독 모델을 확정했고, [prioritization](../strategy/2026-06-02-rn-mvp-prioritization.md)에서 P1+P2가 **분리 불가한 한 쌍**으로 MVP 컷에 들어옴. 자동검증 없는 정산은 분쟁으로, 정산 없는 자동검증은 동기 없이 무너진다.
- **플랫폼 결정 메모**: 이 RN 전환은 **2026-06-02 사용자 결정**이며, 이전(미채택·미문서화)의 "retention 검증 전 Expo 포팅 보류·보증금 WTP 는 현금 WoZ 로 먼저" 제안을 의식적으로 대체한다. 단 그 제안의 핵심 원칙("싸게 먼저 검증")은 폐기하지 않고 **선행 게이트 G1·G2 + V1 fake-door**로 보존한다 — 전체 포인트 ledger 를 빌드하기 전에 정확도·규제·포인트 동기를 먼저 친다.

## 3. Objectives & Success Metrics

### Goals

1. **포팅 패리티**: POC 핵심 루프 5종이 RN에서 실데이터로 동작(인증→피드→정산 표시).
2. **정산 루프 완성(P1)**: 종료 시 달성자는 보증금을 환급받고, 미달분 포인트는 **그룹 공동 주머니**로 모인다(공동 주머니 방식 확정).
3. **판정 자동화(P2)**: 인증 사진이 자동 판정으로 `doneCount`에 반영되어 그룹장 수동 판정이 사라진다.
4. **신뢰 유지**: 자동 오판·정산 분쟁이 임계 이하로 통제된다.

### Non-Goals (명시적 범위 밖 — 왜)

1. **현금 충전 포인트** — 규제 리스크, G2 통과 후 Fast-follow. **미달분 개인 재분배** — 도박 위험으로 채택 안 함(공동 주머니로 확정).
2. **구독 결제(P3)** — 개인 WTP 약함, 런치 후 수익화([prioritization Later](../strategy/2026-06-02-rn-mvp-prioritization.md)).
3. **B2B 운영자 대시보드(P4)** — 2순위 세그먼트.
4. **PWA 폐기** — 전환 기간 invite/OG fallback 유지(migration Phase 8 cutover).
5. **이의제기 리치 플로우·anti-cheat 하드닝** — MVP는 최소판, 하드닝은 Fast-follow.

### Success Metrics

> North Star = **주간 활성 그룹 수(WAG)**, OMTM = **챌린지 완주율(시작→종료 active 유지)** — startup-canvas §6 승계. + POC [VALIDATION.md] GO/NO-GO + 신기능 지표. 목표값은 dogfood Week baseline 후 확정.

| Metric                   | Current(POC) | Target(MVP)                   | Measurement                                                                    |
| ------------------------ | ------------ | ----------------------------- | ------------------------------------------------------------------------------ |
| **챌린지 완주율(OMTM)**  | baseline     | +유의미 향상                  | 시작 챌린지 중 종료까지 active 유지 비율(startup-canvas §6 — 목표 달성과 별개) |
| 목표 달성률(참여)        | baseline     | +향상                         | 주 단위 누적(weekly accrual) 목표 달성 참가자 비율                             |
| **포인트 동기 효과(V1)** | 없음         | 포인트 그룹 완주율 > 비포인트 | A/B 또는 도입 전후 코호트                                                      |
| **자동검증 오판율(F1)**  | 수동         | false-reject ≤ 게이트 임계    | 자동판정 vs 사후 라벨                                                          |
| **이의제기율(V4)**       | 없음         | ≤ 목표치                      | 이의제기 건수 / 자동판정 건수                                                  |
| **정산 완료율(V2)**      | 표시만       | ≥ 목표치                      | 정산 트리거된 챌린지 / 종료 챌린지(=수동 + auto-settle)                        |
| 인증 1건당 검증 비용(F5) | —            | 예산 내                       | 서버 비전/AI 호출 비용 × 볼륨                                                  |

## 4. Target Users & Segments

- **1순위(beachhead)**: 3~8인 친구·동료 운동 그룹. POC가 검증한 핵심 루프. Job = "작심삼일을 친구와의 약속으로 묶어 끝까지 가고 싶다"([startup-canvas §2](../strategy/2026-06-02-fromwith-startup-canvas.md)).
- **그룹장**: 챌린지 생성·정산 트리거 권한자.
- (Later) B2B 운영자·헬스장 — MVP 범위 밖.

## 5. User Stories & Requirements

### 5.A 포팅 트랙 (P0 · Track: port) — POC PRD 참조 + RN 델타

> 기능 ①~⑤의 유저 스토리·AC는 [POC PRD §3~§7] 및 [인증 job stories](../stories/2026-06-02-photo-verification-job-stories.md)가 SoT. 여기서는 **RN 전환 시 달라지는 것만** 기술한다.

| #   | 포팅 기능         | AC SoT            | RN 전환 델타 (왜)                                                                                                                                         |
| --- | ----------------- | ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1  | 그룹 서약서       | POC PRD §3        | Server Action `signPledge`→`sign_and_maybe_activate` RPC 직접 호출. 초대는 universal/app link 딥링크                                                      |
| A2  | 사진+키워드 인증  | job stories S1·S2 | 웹 file input/canvas→**네이티브 카메라/ImageManipulator** 업로드 파이프라인. `submitActionLog`→서버 API(트랜잭션 경계 유지)                               |
| A3  | AI 운동일기       | 가드레일 §AI일기  | 변경 없음 — **서버 전용 유지**(OpenAI key·4.5s timeout·fallback). RN은 결과만 수신. **포팅 대상이나 P1+P2 임계경로 아님** — 일정 압박 시 후순위 조정 가능 |
| A4  | 피드 / Kudos      | job stories S3    | read는 RN-safe contract로(`next/cache`·cookies 제거, ADR-0024 admin hydrate→BFF). Kudos optimistic toggle                                                 |
| A5  | 정산 표시 / recap | job stories S4    | **P1로 대체·확장**(아래 5.C). recap 공유 카드/영상은 서버 endpoint 유지, RN은 다운로드/네이티브 공유                                                      |
| A6  | 푸시·알림         | job stories S5    | Web Push(VAPID)→**Expo push token**. 알림센터 IDB→RN 로컬/서버. Quiet Hours 정책 유지                                                                     |

### 5.B 신기능 P2 — 사진 자동검증 (P0 · Track: greenfield)

> **P2 = 자동 부정탐지 (확정 2026-06-02)**: 사진은 "운동했다"를 증명할 수 없으므로, **기본은 통과(친구 신뢰)하고 명백한 부정만 자동 차단**한다. 애매한 건 통과 또는 사람 검토.
> 검증은 **"운동인지 분류"가 아니라 "부정인지 탐지"** — 중복 해시·EXIF·스크린샷 같은 **싼 결정론적 검사**로 대부분 처리되어 **MVP엔 무거운 AI 비전 모델이 거의 불필요**(AI생성 탐지 등은 Fast-follow). [인증 job stories](../stories/2026-06-02-photo-verification-job-stories.md) 기반. **G1 통과 전제(부정탐지 정밀도).**

| #    | User Story                                                                                                   | Acceptance Criteria                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ---- | ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P2-1 | (운동 직후) 인증 사진을 올리면 **별도 승인 없이 바로 `doneCount`에 반영**되고, 명백한 부정만 걸러지길 바란다 | • `AC-auto-verify-1`: **기본 status = `passed`**(친구 신뢰, 즉시 `doneCount`(KST distinct day) 인정)<br>• `AC-auto-verify-2`: **명백한 부정 신호**(중복 해시·EXIF 불일치·스크린샷)만 `failed`(카운트 제외, 피드엔 남음)<br>• `AC-auto-verify-3`: 확신 안 서는 경계 케이스만 `manual_review`(드물게)<br>• `AC-auto-verify-4`: 결정론적 검사는 제출 즉시 판정. 결과·신호·모델 버전이 `action_logs`에 기록(본문 미로깅, 메타만)<br>• `AC-auto-verify-5`: **마감 전 1회 한정 사진 교체 허용**(잘못 올림 정정) — 교체 시 부정탐지 재실행(immutability 예외, Q9 ADR)                                                   |
| P2-2 | (반려) 친구들이 보기에 명백히 의심스러운 인증을 **그룹이 함께 걸러내고** 싶다 (그룹장 단독 판정 X)           | • `AC-peer-reject-1`: 인증 카드에 **🟨 반려(옐로카드) 1탭** — Kudos와 별개, **익명 집계**(카운트만, 누가 눌렀는지 숨김)<br>• `AC-peer-reject-2`: **본인 제외 참가자 과반**(> (N−1)/2)이 반려 → 해당 인증 `failed`(doneCount 제외). 본인은 자기 인증 반려 불가<br>• `AC-peer-reject-3`: 토글 가능, 과반 미달로 떨어지면 `passed` 복원. 유효 기간 = **정산 전(마감 후 48h)까지**<br>• `AC-peer-reject-4`: 이 피어 다수결이 **그룹장 수동검토·`manual_review`를 대체**(이해상충 해소, Q8)<br>• `AC-peer-reject-5`: 자동 부정탐지(P2-3)와 상호보완: 기계=재탕·스크린샷, 피어=맥락적 사기. 기계 오판은 Q7 교체로 정정 |
| P2-3 | (치팅 방지) 재사용·스크린샷 사진이 **인증으로 통과되지 않게** 하고 싶다 — **이게 P2의 핵심 판정**            | • `AC-cheat-detect-1`: **MVP 부정탐지 신호**: ① perceptual hash(`photo_phash`) 중복(그룹 내/전역 재탕) ② EXIF 촬영시각 검사(챌린지 기간·제출시각과 동떨어지면 의심) ③ 스크린샷 휴리스틱(상태바·EXIF 카메라 정보 부재)<br>• `AC-cheat-detect-2`: 동일/유사 해시 재사용은 `failed`(or `manual_review`)<br>• `AC-cheat-detect-3`: 온디바이스 사전검증(흐림·스크린샷)으로 업로드 전 1차 거름(E1)<br>• `AC-cheat-detect-4`: AI생성·재촬영·메타 조작 우회 탐지 하드닝은 Fast-follow(red-team)                                                                                                                          |
| P2-4 | (그룹장) 인증마다 일일이 확인하지 않아도 되어 운영 부담이 **대폭 줄고** 싶다                                 | • `AC-owner-load-1`: 기본 자동 통과 + 반려는 **그룹 피어 다수결(P2-2)** → **그룹장 전용 검토 없음**(이해상충 해소, Q8)<br>• `AC-owner-load-2`: 그룹장도 일반 참가자로서 반려 1표만 행사<br>• `AC-owner-load-3`: `failed`·반려율이 임계 이상이면 그룹에 알림(부정탐지 오작동·갈등 신호)                                                                                                                                                                                                                                                                                                                           |

**P2 엣지 케이스**: 검증 서비스 다운(→ `manual_review`로 graceful), 판정 비용 폭증(→ 볼륨 모니터·온디바이스 1차 거름), 오프라인 제출(→ 큐잉 후 동기화).

### 5.C 신기능 P1 — 포인트 보증금 정산 (P0 · Track: greenfield)

> closed-loop **ⓑ적립/번들 포인트**로 시작. **G2 통과 전제.** POC "표시만"(penalty_amount)을 실제 포인트 이동으로 전환.
> 미달분 산정은 (draft) [weekly-penalty-accrual spec](../superpowers/specs/2026-06-02-weekly-penalty-accrual.md)의 **주 단위 누적 모델**(`confirmedPenalty`)을 SoT로 따른다 — 전체 1회 binary(`doneCount ≥ goalCount`)는 장기 챌린지에서 깨지므로 사용하지 않는다. 보증금 포인트는 기존 KRW `penalty_amount`와 **1:1**(예: 1,000원 = 1,000P).

| #    | User Story                                                                                                               | Acceptance Criteria                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ---- | ------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1-1 | (서약 시) 보증금 포인트를 걸어 **"안 하면 잃는다"**는 실제 압박을 느끼고 싶다                                            | • `AC-deposit-hold-1`: 서약 시 보증금 포인트가 **hold(잠금)**된다(현금 충전 아님 — 적립/번들 잔액에서)<br>• `AC-deposit-hold-2`: hold 금액 = 챌린지 **최대 누적 벌금**(Σ 전체 주 × penaltyAmount). 종료 시 미달분만 forfeit, 나머지 release<br>• `AC-deposit-hold-3`: 그룹에 **이월 공동자산(풀)**이 있으면 → 풀을 그룹 공동 스테이크로 먼저 깔고 **참가자 N명 균등 차감**(각자 hold = 최대 누적 벌금 − 풀÷N). 풀은 개인 소유 아닌 **공동자산**이라 균등 적용. **N = 다음 챌린지 참가 확정 인원(전원 서명 후 활성화 시점 기준 — 새 멤버 포함, 나간 사람 제외)**<br>• `AC-deposit-hold-4`: **잔액 부족 시 서약 차단**(무보증 참여 없음). 신규 유저는 **가입 시 초기 포인트 그랜트**(첫 보증금 1회분, `bundle_grant`)로 첫 서약 가능 — 닭-달걀 방지(금액 추후 튜닝)<br>• `AC-deposit-hold-5`: hold/해제가 **append-only 포인트 원장**에 기록된다(잔액 = Σ delta)                                                                                                                                                                                                                                                                                                                                                               |
| P1-2 | (진행 중) 내 보증금이 목표 미달로 **깎일 위험**을 시각적으로 보고 싶다(D2)                                               | • `AC-deposit-gauge-1`: 보증금 잔액 게이지 + 미달 시 차감 예정액을 보여준다<br>• `AC-deposit-gauge-2`: "표시만"이 아니라 종료 시 실제 이동됨을 명확히 고지<br>• `AC-deposit-gauge-3`: `penalty_displayed`(승계) + 신규 포인트 잔액 조회 이벤트                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| P1-3 | (종료 시) 달성자는 보증금을 돌려받고, 미달분은 **그룹의 다음 챌린지 보증금으로 이월**되어 끝까지 한 보람을 얻고 싶다(V3) | • `AC-settle-1`: **정산 모델 = 공동 주머니 방식 (확정, 2026-06-02 사용자 결정 · startup-canvas 옵션 B)**: 달성자는 본인 보증금 **전액 환급(원금 한도 내)**, 미달분(forfeit)은 **그룹 공동 주머니 → 그룹의 다음 챌린지 보증금으로 이월**(확정, 현금화 불필요·재참여 동기) — 다음 챌린지에서 **참가자 균등 차감**(공동자산, P1-1), **개인 간 재분배 없음**<br>• `AC-settle-2`: **풀 보관**: 그룹이 살아있는 한 **무기한 보관**(현금화 불가라 부담 적음), 다음 챌린지를 안 열어도 유지. **그룹 삭제 시에만 소멸**<br>• `AC-settle-3`: ⚠️ **회식·장비·기부·현금환급 등 현금이 필요한 용도는 제외** — closed-loop(현금화 불가) 원칙 위반(현금화 시 환불·자금이체·사행성 규제 발생). 공동 주머니는 **앱 내 이월/적립으로만** 소진<br>• `AC-settle-4`: 미달분 산정은 주 단위 누적([weekly-penalty-accrual](../superpowers/specs/2026-06-02-weekly-penalty-accrual.md), `confirmedPenalty`)을 SoT로 — 전체 1회 binary 아님<br>• `AC-settle-5`: 분배 규칙은 **챌린지 시작 시 고정**(그룹장 재량 분배 아님, 확정 트리거만)<br>• `AC-settle-6`: (참고) 미달분을 달성자가 나눠 갖는 **개인 재분배 방식은 도박 위험이라 채택하지 않음** — 향후 도입은 PO 결정 + 법무 선행<br>• `AC-settle-7`: 모든 이동이 원장에 append, 정산 스냅샷 저장 |
| P1-4 | (그룹장) 종료 후 **"정산" 한 번**으로 끝내고, 잊어도 자동 처리되고 싶다(V2)                                              | • `AC-settle-trigger-1`: 그룹장 종료 화면에 "정산 확정" 트리거(재량 분배 아님, 확정만)<br>• `AC-settle-trigger-2`: **이의제기·반려 마감 = 마감 후 48h**(이때 doneCount 확정) → 그룹장 수동 정산은 그 전 언제든 → **마감 후 72h(3일째) cron 에서 미트리거 시 auto-settle**(사전 규칙대로, E4)<br>• `AC-settle-trigger-3`: 이중 정산 방지(원장 idempotency·정합성, F4)<br>• `AC-settle-trigger-4`: `settlement_triggered`/`settlement_auto` 이벤트                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| P1-5 | (정산 후) 환급받은 포인트를 **다음 챌린지 보증금·구독 할인**에 쓰고 싶다                                                 | • `AC-points-use-1`: 포인트는 closed-loop 잔액으로 적립, **현금화 불가**<br>• `AC-points-use-2`: 용도(현금 불필요): 다음 챌린지 보증금 · (Later)구독 할인 · 앱 내 보상<br>• `AC-points-use-3`: 잔액·이력 조회 화면                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |

**P1 엣지 케이스**: 동시 정산 요청(원장 lock), 이의제기로 인한 `doneCount` 변동과 정산 충돌(→ 정산 hold/재계산), 그룹 중도 탈퇴자 보증금 처리(정책, Open Q), 환불 요청(ⓑ적립이라 원칙적 비현금, 정책 고지).

### 5.D Feature 추적 메타 (Track · 의존 · 게이트)

> 각 Feature(AC id prefix)의 **Track 슬롯 · 선행 의존 · blocking 게이트**를 한 곳에 모은다 — `create-agent-tasks`가 `Track`·`Status: blocked`·`Blocked-by`를 기계 결정하는 입력(PM_PLUGIN_ADAPTER 계약 §3·§4, D12). port 트랙 A1~A6의 AC SoT는 [POC PRD](../PRD.md)·[인증 job stories](../stories/2026-06-02-photo-verification-job-stories.md)(§5.A) — 01에는 AC id를 두지 않고 prefix 핸들만 제공.

| Feature (AC prefix)          | Track      | depends-on                                   | blocked-by (gate/spec)         |
| ---------------------------- | ---------- | -------------------------------------------- | ------------------------------ |
| A1 그룹 서약서               | port       | —                                            | —                              |
| A2 사진+키워드 인증          | port       | —                                            | —                              |
| A3 AI 운동일기               | port       | —                                            | —                              |
| A4 피드 / Kudos              | port       | —                                            | —                              |
| A5 정산 표시 / recap         | port       | `AC-settle-*` (P1으로 대체·확장)             | —                              |
| A6 푸시·알림                 | port       | —                                            | —                              |
| `AC-auto-verify-*` (P2-1)    | greenfield | A2 인증 파이프라인                           | **G1** (θ false-flag 임계, Q1) |
| `AC-peer-reject-*` (P2-2)    | greenfield | `AC-auto-verify-*`                           | —                              |
| `AC-cheat-detect-*` (P2-3)   | greenfield | A2 인증 파이프라인                           | **G1** (Q1)                    |
| `AC-owner-load-*` (P2-4)     | greenfield | `AC-peer-reject-*`                           | —                              |
| `AC-deposit-hold-*` (P1-1)   | greenfield | A1 서약, weekly-penalty-accrual spec         | **G2** (법무, Q2)              |
| `AC-deposit-gauge-*` (P1-2)  | greenfield | `AC-deposit-hold-*`                          | **G2**                         |
| `AC-settle-*` (P1-3)         | greenfield | `AC-deposit-hold-*`, weekly-penalty-accrual  | **G2**                         |
| `AC-settle-trigger-*` (P1-4) | greenfield | `AC-settle-*`, `AC-peer-reject-*` (48h 마감) | **G2**                         |
| `AC-points-use-*` (P1-5)     | greenfield | `AC-settle-*`                                | **G2**                         |

> **게이트 해제 = `Blocked-by` 제거 조건**: G1 = 부정탐지 false-flag 임계(θ) PoC 확정([Q1](#7-open-questions)) · G2 = ⓑ적립 포인트 법무 검토([Q2](#7-open-questions)). 둘 다 §0 BLOCKING. greenfield AC에 의존하는 Agent Task는 해당 게이트 전까지 `Status: blocked` + `Blocked-by: G1|G2`로 생성한다(create-agent-tasks Process 4·D12). 단 결정론 불변식(`AC-deposit-hold-5` 원장 잔액=Σdelta·`AC-settle-trigger-3` idempotency)은 게이트와 무관하게 즉시 활성(05 §3).

## 6. Solution Overview

### 6.1 아키텍처 (RN 전환 골격)

- **클라이언트**: Expo Router RN 앱(`apps/mobile`). 순수 도메인(validators·keywords·challenge·share)은 shared package로 추출([migration Phase 2](./00-rn-conversion-plan.md)).
- **쓰기 경로**: POC Server Action을 **Supabase RPC 직접 호출 또는 BFF API**로 승격(migration §9). 권한·트랜잭션·service-role 작업은 서버에 격리(RLS 우회 금지).
- **자동검증·정산·AI·푸시**: 서버 전용 책임 유지(키·비용·정합성).

### 6.2 데이터 모델 델타 (BE_SCHEMA에 추가 — migration ADR 필요)

> 정확한 DDL은 별도 migration + ADR. 여기서는 **제품 수준 델타**만.

- **신규 `point_ledger`** (append-only): `id` · `user_id` · `group_id` · `challenge_id` · `delta`(signed int, 포인트) · `reason`(enum: `bundle_grant`/`deposit_hold`/`deposit_release`/`penalty`/`distribution`/`refund`) · `ref_id` · `created_at`. **잔액 = SUM(delta)**. RLS: self + 동일 그룹 read, write는 서버(RPC)만. **왜**: 정산은 금전성이라 감사·분쟁 추적 가능한 이벤트소싱(E2·F4).
- **신규 `settlements`**: `challenge_id` · `settled_at` · `settled_by`(user/auto) · `pool_points` · `distribution`(jsonb 스냅샷). **왜**: 정산 결과 불변 스냅샷.
- **`action_logs` 델타**: `auto_verify_status`(enum) · `auto_verify_score`(numeric) · `auto_verify_model_version`(text) · `photo_phash`(text, dedup) · `photo_captured_at`(EXIF). 모두 **서버 write 전용**(클라 INSERT/UPDATE 차단, 기존 AI 컬럼과 동일 정책, BE_SCHEMA §7). ⚠️ **단 기존 `action_logs`는 immutable(UPDATE 정책 없음, job stories S2·E4)인데 자동검증은 비동기 확정·override 라 status 의 사후 UPDATE 가 필요** → 검증 status 컬럼에 한해 **서버 전용 UPDATE 허용** 예외가 필요(immutability 모델 변경 → migration ADR 대상, Q9).
- **`challenge_participants` 델타**: `deposit_points`(hold 금액) 또는 원장 파생.
- **반려(🟨) 반응**: 기존 `kudos` 류 반응에 **익명 반려 타입 추가**(집계만, 식별자 비노출). 본인 제외 과반 도달 시 `doneCount` 제외 + `auto_verify_status=peer_rejected`. ⚠️ 반응 타입 추가는 **AnalyticsEvent union(PRD §9.1)과 1:1** 유지 위해 PO 승인 + spec 필요(가드레일).

### 6.3 RN 플랫폼 전환 (migration §4 참조)

> 레이어별 전환 규칙(라우팅·이미지·저장소·푸시·폼·분석 등)과 권장 스택 결정 상태는 [03-rn-migration-rules](./03-rn-migration-rules.md).

- 카메라/사진: Expo ImagePicker/ImageManipulator + 온디바이스 사전검증.
- 푸시: Expo push token(`device_push_tokens` 신설 또는 `push_subscriptions` 확장 — ADR).
- 딥링크: 초대·알림 targetUrl을 앱 route로 매핑(migration §10 route map). 외부 진입은 Universal/App Links(https), 내부 이동은 `fromwith://` scheme([04 A7](./04-rn-architecture.md)).
- 네비게이션: **Root Stack + 인증 후 Bottom Tabs**[홈·내챌린지·알림·프로필] 도입([04 A5](./04-rn-architecture.md)). 챌린지 상세·그룹은 탭 위 push, 생성 flow는 modal. ⚠️ **PWA에 없던 새 IA(Information Architecture, 정보구조) → PO 승인 + 핵심 플로우 screenshot acceptance 필요**.

### 6.4 측정/이벤트

- 신규 이벤트는 **PRD §9.1 / AnalyticsEvent 유니온과 1:1**(임의 추가 금지, PO 승인 + spec). 후보: `settlement_triggered`·`settlement_auto`·`auto_verify_result`·`verify_appeal`·`points_balance_view`.

## 7. Open Questions

| #      | Question                                                                                                                                                                                                                                                                                                                                                                                           | Owner     | Deadline        |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | --------------- |
| Q1     | **부정탐지 false-flag 임계값**(정상 사진 오판율)을 얼마로 둘 것인가 (G1) — 🟡 **잠정 확정·주입**(2026-06-05, conservative: θ_rate ≤ 1% · phash 해밍 ≤6 → `failed`(동일-user/group; 전역 cross-user 제외) · EXIF/스크린샷 단독 차단 안 함 · shadow mode, [spec](../superpowers/specs/2026-06-05-false-flag-threshold-theta.md)). 실측 G1 PoC로 튜닝·확정은 **open**(`false_flag_rate.active=false`) | PO + BE   | G1 PoC(실측)    |
| Q2     | ⓑ적립 포인트의 **환불·탈퇴자 보증금** 처리 정책 (Vi1) — 🟡 **PO 정책 확정**([ADR-0043](../adr/0043-deposit-refund-exit-policy.md): 중도 탈퇴 hold 전액 forfeit→공동주머니 · 적립 포인트 현금환불 불가 · 계정삭제 시 잔액 소멸 · 약관 고지). **법무 사인오프(G2)는 잔여**                                                                                                                           | 법무 + PO | G2              |
| ~~Q3~~ | ✅ **해결 완료** — 이월 풀 = 참가자 균등 차감 · N 기준 = 다음 챌린지 참가 확정 인원(활성화 시점, 새 멤버 포함) · 미개설 시 = 무기한 보관(그룹 삭제 시 소멸). 상세 P1-1·P1-3                                                                                                                                                                                                                        | —         | 결정됨          |
| ~~Q4~~ | ✅ **해결** — 잔액 부족 시 **서약 차단**(무보증 없음) + 신규 유저 **가입 초기 그랜트**(첫 보증금 1회분). 그랜트 금액 추후 튜닝                                                                                                                                                                                                                                                                     | PO        | 결정됨          |
| ~~Q5~~ | ✅ **해결** — 이의제기·반려 마감 = 마감 후 **48h** → 그룹장 수동정산 그 전 언제든 → 마감 후 **72h(3일) cron auto-settle**                                                                                                                                                                                                                                                                          | PO        | 결정됨          |
| ~~Q6~~ | ✅ **해결** — grace window = 마감 후 **48h**(= 반려 마감, Q5와 동일). 그 전까지 doneCount 미확정                                                                                                                                                                                                                                                                                                   | PO        | 결정됨          |
| ~~Q7~~ | ✅ **해결** — **마감 전 1회 사진 교체 허용**, 교체 시 부정탐지 재실행. immutability 예외(Q9 ADR)                                                                                                                                                                                                                                                                                                   | PO        | 결정됨          |
| ~~Q8~~ | ✅ **해결** — 그룹장 검토 폐지, **🟨 반려 이모지 피어 다수결**(익명, 본인 제외 과반 → failed)로 대체. 상세 P2-2                                                                                                                                                                                                                                                                                    | PO        | 결정됨          |
| Q9     | `action_logs` immutability 예외 ADR 범위 — **검증 status 서버 UPDATE + Q7 사진 1회 교체** 둘 다 포함                                                                                                                                                                                                                                                                                               | BE        | 데이터 모델 ADR |

## 8. Timeline & Phasing

> [migration plan Phase](./00-rn-conversion-plan.md)에 MVP 컷을 주입한 순서. **게이트 G1·G2가 Phase 진입 선행조건.**

| 단계                    | 내용                                                        | 대응 migration Phase | 완료 조건                                |
| ----------------------- | ----------------------------------------------------------- | -------------------- | ---------------------------------------- |
| **G. 게이트**           | 정확도 PoC(G1) + 법무 검토(G2)                              | Phase 0 직후         | 두 게이트 통과 또는 컷 재조정            |
| **M1. 포팅 기반**       | Expo 부트스트랩·인증·딥링크·shared domain                   | Phase 1~2            | dev build 로그인·세션·딥링크 성공        |
| **M2. read 패리티**     | 홈·챌린지 피드/대시보드/정보·그룹·recap read                | Phase 3              | RLS 사용자로 핵심 read 화면 실데이터     |
| **M3. mutation + P2**   | 생성·서약·그룹 + **사진 자동검증·카메라·anti-cheat 최소판** | Phase 4~5            | RN 인증 1건 자동판정→`doneCount` 반영    |
| **M4. P1 정산**         | **포인트 원장·보증금 hold·분배·auto-settle·보증금 시각화**  | Phase 5~7            | 종료→정산→분배 end-to-end, 이중정산 없음 |
| **M5. 알림·polish**     | Expo push·알림센터·recap 공유·접근성                        | Phase 6~7            | 실기기 푸시·공유·핵심 failure path 통과  |
| **M6. dogfood/cutover** | 1주 챌린지 생성→자동인증→자동정산 + PWA fallback            | Phase 8              | dogfood 코호트 GO/NO-GO                  |

---

## 9. 다음 단계 (PRD 이후)

1. `/pm-execution:job-stories` — P1·P2를 엔지니어링 job story로 분해(인증 job stories 패턴 재사용).
2. `/pm-execution:test-scenarios` — 신기능 QA 시나리오(기존 photo-verification test 시나리오 확장).
3. `/pm-execution:pre-mortem` — 이 PRD에 사전 부검(오판·규제·정산 정합성·RN 전환 리스크).
4. `/pm-execution:sprint-plan` — M1~M6를 스프린트로.
5. 데이터 모델 델타 → **migration ADR**(point_ledger·settlements·action_logs 컬럼) 작성.

---

## 용어집

- **포팅 트랙**: POC에서 이미 검증돼 RN으로 그대로 옮기는 기능 묶음. 신규 명세 대상 아님.
- **P1 / P2**: 이번 MVP에 더하는 신기능. P1=포인트 보증금 정산, P2=사진 자동검증. 분리 불가한 한 쌍.
- **closed-loop 포인트**: 앱 안에서만 도는 현금화 불가 포인트. 규제(전자금융·에스크로) 우회.
- **ⓑ적립/번들 포인트**: 현금 충전이 아니라 적립·구독 번들로 지급되는 포인트. 환불·사행성 리스크 ≈0이라 MVP 시작점.
- **정산 모델 (확정 2026-06-02)** = **공동 주머니 방식**: 달성자는 본인 보증금 환급, 미달분은 그룹 공동 주머니 → **그룹의 다음 챌린지 보증금으로 이월**(현금화 불필요). 개인 간 재분배 없음(사행성≈0, 친구 그룹 적합 = startup-canvas 옵션 B). · ⚠️ **회식·장비·기부·현금환급 등 현금 필요 용도는 제외**(현금화 = 규제 발생). · (참고) 미달분을 달성자가 나눠 갖는 **개인 재분배 방식**(옵션 A)은 도박 위험으로 **미채택** — 향후 PO + 법무 검토 시에만.
- **leap-of-faith(LoF)**: 틀리면 기능 전체가 무너지는 핵심 가정. G1·G2가 이를 검증.
- **point_ledger**: 포인트 이동을 append-only로 쌓는 원장 테이블. 잔액 = Σ delta. 정산 감사·분쟁 추적용.
- **auto-settle fallback**: 그룹장이 정산을 안 눌러도 마감 후 자동으로 사전 규칙대로 정산하는 안전장치.
- **perceptual hash(phash)**: 사진 내용 기반 유사도 해시. 재사용·중복 사진 검출에 사용.
- **반려(🟨 옐로카드)**: Kudos와 별개의 **익명** peer 반응. 한 인증에 본인 제외 참가자 과반이 누르면 `failed`(doneCount 제외). 그룹장 단독 판정을 대체.
- **manual_review / peer_rejected**: 자동 부정탐지가 확신 못 한 인증은 기본 통과 후 피어 반려로 거른다 — 그룹장 전용 검토 큐는 폐지(Q8).
- **doneCount / goalCount**: 누적 인증 일수(KST distinct day) / 목표 일수. `passed` 인증만 doneCount 인정.
- **RPC / BFF**: Supabase Postgres 함수 호출 / Backend-for-Frontend API. RN이 Server Action을 못 써서 쓰기 경로를 이리로 승격.
- **G1 / G2**: 빌드 진입 전 통과해야 하는 선행 게이트. G1=부정탐지 정밀도 PoC(정상 사진 false-flag rate), G2=법무 검토.
