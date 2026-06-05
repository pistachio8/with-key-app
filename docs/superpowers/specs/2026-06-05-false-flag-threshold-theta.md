---
spec: 2026-06-05-false-flag-threshold-theta
title: false-flag 임계 θ (P2 자동검증 판정) — 잠정 확정·주입
author: pistachio8
date: 2026-06-05
status: draft
---

## Summary

P2 사진 자동검증의 판정(신호 → `passed`/`failed`/`manual_review`)이 의존하는 **false-flag 임계 θ**를 **잠정(provisional)값으로 확정**해 코드 밖 파라미터로 주입한다. θ는 두 층으로 구성된다 — ① 게이트 수용 바 `θ_rate`(정상 사진을 부정으로 오판하는 비율의 상한), ② 제출 단위 판정 임계(phash 해밍거리·EXIF·스크린샷 신호 → status 매핑).

이 값은 **PO 정책 결정**이며 **실측 G1 PoC로 검증된 값이 아니다**. PRD §0의 G1은 BLOCKING 게이트이고 통과 기준은 "실사용 사진셋으로 false-flag 비율이 임계 이하임을 실측 확인"인데(Q1 owner: PO + BE), 현재 라벨된 실사용 사진셋과 신호 계산 구현(EVAL-0021)이 없어 실측을 돌릴 수 없다. 따라서 본 spec은 **잠정 θ를 주입해 판정 로직(EVAL-0022)을 빌드·테스트할 수 있게** 열고, 실측 PoC는 dogfood 단계에서 **코드 변경 없이 주입값만 교체**해 θ를 튜닝하는 후속으로 분리한다(이것이 "θ 하드코딩 금지" 설계 의도다).

PO 확정 방향(2026-06-05 grill 검증 반영): **최소 차단(conservative)** + **게이트 PoC-pending** + **shadow mode**. shadow mode = `VERIFY_ENFORCE=false`(=PoC 전)일 때 판정기는 실제 돌되 결정을 **기록만**(would-be), doneCount·피드 영향 0 — 사용자 무피해로 dogfood 실측 PoC를 가능케 한다(아래 Rollout 4). `failed`는 **동일-user(+동일-group) 재사용으로 한정**하고 전역 cross-user는 auto-`failed` 안 한다. `manual_review`도 **doneCount에 인정**(사람 검토 큐 없음 — 피어 반려만 다운그레이드, PRD Q8).

## Why

- **사진은 운동을 증명하지 못한다** → 정상 인증을 부정으로 막는 false-reject 비용이 크다. PRD는 "기본 `passed`(친구 신뢰), 명백한 부정만 `failed`, 거의 안 막게"를 명시(§5.B `AC-auto-verify-1~3`, §0 G1 미통과 시 "더 보수적으로 조정").
- **θ가 코드에 박히면 튜닝이 PR을 요구한다** → 외부 주입 파라미터로 두면 실측 PoC가 값만 바꿔 조정 가능(EVAL-0022 "θ 하드코딩 금지").
- **실측 PoC를 지금 돌릴 수 없다** → 라벨 사진셋 부재 + EVAL-0021(신호 계산) `todo` + EVAL-0020(컬럼) `todo`. 빌드를 막아두면 P2 판정 슬라이스 전체가 정지한다.
- **게이트를 실측 없이 active로 flip하면 "검증됐다"는 거짓 신호** → meta-eval weaken(실측 미수행을 통과로 간주). 그래서 θ는 주입하되 게이트는 PoC-pending으로 둔다.

## Impact Scope

### 변경 경로

- 신규: `docs/superpowers/specs/2026-06-05-false-flag-threshold-theta.md`(본 문서)
- 수정: `.agents/harness/config/harness.config.example.json`(`false_flag_rate.theta`·`judge` 주입) · `docs/migration/01-rn-mvp-prd.md`(§7 Q1 상태) · `.agents/harness/DECISION_NEEDED.md`(G1-θ 상태) · `evals/tasks/0022-verify-judgment-theta-gated.md`(`blocked→todo`) · `docs/eng-stories/2026-06-05-photo-verification.md`(게이트 노트)

### src/ 영향

본 spec(문서)은 src 변경 0. 단 런타임 θ 소스로 **`apps/web/src/lib/verify/config.ts`**(server env zod 검증)가 EVAL-0021/0022 구현 시 신설되며 `apps/web/.env.example`에 `VERIFY_*` 주석 동기가 필요하다(server-only, `NEXT_PUBLIC_` 금지). 판정 로직은 EVAL-0022, 신호 계산은 EVAL-0021.

### Supabase / RLS / migration 영향

없음. 신호·status 기록 컬럼은 EVAL-0020(`0044_*`)에서 추가(θ와 독립).

### 외부 서비스

없음. MVP 부정탐지는 결정론 신호(phash·EXIF·스크린샷)만 — 무거운 AI 비전 모델 불필요(PRD §5.B 주석). AI생성 탐지는 Fast-follow(`AC-cheat-detect-4`).

## Design

### θ 구조 (잠정·conservative)

| 파라미터                          | 값              | 의미 / 왜                                                                                                                                     |
| --------------------------------- | --------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `θ_rate`(`false_flag_rate.theta`) | **0.01**        | 정상 사진 오판율 상한 ≤ 1%. G1 게이트 수용 바. **왜**: false-reject 비용이 높아 1%도 보수적 시작점                                            |
| `phashHammingFailMax`             | **6**           | 64-bit perceptual hash 해밍거리 ≤ 6 → 거의 동일(재탕) → `failed`. **왜**: 압축·리사이즈 변형은 흡수하되 사실상 동일 이미지만 차단             |
| `phashHammingReviewMax`           | **10**          | 해밍거리 7~10 → `manual_review`(경계 near-dup). **왜**: 동일/무관 사이 회색지대만 사람 검토로 미룸                                            |
| `exifTimeSignal`                  | **record_only** | EXIF 촬영시각 불일치는 신호로 **기록만**, 단독으로 `failed` 안 함. **왜**: EXIF는 기기·타임존·편집으로 흔히 누락/왜곡 → 단독 차단은 오판 위험 |
| `screenshotSignal`                | **review_only** | 스크린샷 휴리스틱은 드물게 `manual_review`, 단독 `failed` 안 함. **왜**: 정상 사용자도 갤러리 캡처를 올릴 수 있어 단독 차단은 과함            |
| 기본값                            | **passed**      | 위 차단 조건에 안 걸리면 즉시 `passed`(`doneCount` 인정). **왜**: 친구 신뢰가 기본                                                            |

### 판정 매핑 (EVAL-0022가 구현)

phash 임계는 **64비트 DCT pHash 기준**으로 표현된다 — EVAL-0021이 해시 알고리즘을 확정하며, 비트수/알고리즘이 다르면 6/10을 재도출한다(값은 잠정). sharp grayscale→DCT로 구현 가능(신규 무거운 의존 불필요).

**중복 조회 scope별 행동**(grill Q3):

1. **동일-user** 재사용(같은 user의 다른 날/챌린지에 `d ≤ 6`) → `failed` — 핵심 부정, 오판 최저.
2. **동일-group** cross-user(같은 그룹 내 `d ≤ 6`) → `failed`(or `manual_review`).
3. **전역** cross-user near-match → **신호 기록 / 최대 `manual_review`, auto-`failed` 안 함** — 생판 남 충돌 오판 방지. AC-cheat-detect-1 ① '전역 재탕'은 신호로 존재하되 행동만 분리.
4. 위 1·2에서 `7 ≤ d ≤ 10`(경계 near-dup) → `manual_review`.
5. 그 외 → `passed`. EXIF·스크린샷 신호는 `auto_verify_score`/신호 벡터에 **기록만**(advisory) — 단독으로 status를 내리지 않는다(EXIF 불신뢰성·스크린샷 정상 사용 가능성).

**status 의미**(grill Q2):

- `passed`·`manual_review` → **둘 다 doneCount 인정**. `manual_review`는 '기계가 확신 못 함, 피어 봐주세요' UI 힌트일 뿐 — **사람 검토 큐 없음**(그룹장 검토 폐지, PRD Q8). 유일한 다운그레이드 = 피어 반려(EVAL-0025) 또는 기계 hard `failed`.
- `failed` → doneCount 제외, **피드엔 남김**(`AC-auto-verify-2`). 기계 오판(false-positive) 복구 경로 = **마감 전 사진 1회 교체**(EVAL-0024, 재판정) — 피어가 un-fail 하지 않음(`AC-peer-reject-5`).
- 판정/계산 오류(손상 이미지 등) → `manual_review`로 graceful(여전히 카운트).

**shadow mode**(grill Q1): `VERIFY_ENFORCE=false`(=PoC 전)면 위 매핑은 `auto_verify_status`에 **would-be 결정으로 기록만** 되고 doneCount·피드는 전부 `passed`처럼 취급(아무도 차단 안 됨). `VERIFY_ENFORCE=true`(PoC 통과 후)에서만 `failed`가 실제 카운트 제외로 작동.

### 주입 지점 (코드 밖)

- **런타임 소스 = server-only env**(grill Q4): `apps/web`은 config JSON을 로드하지 않고 `process.env.*`만 읽는다(기존 `AI_MONTHLY_BUDGET_KRW`·`OPENAI_MODEL` 패턴). θ는 `apps/web/src/lib/verify/config.ts`(EVAL-0021/0022 구현)가 server env를 **zod 검증 + 기본값**으로 읽는다. **`NEXT_PUBLIC_` 금지** — 임계가 클라 번들에 노출되면 치터가 우회 튜닝 가능(서버 판단). `.env.example`에 주석 동기(가드레일).
- **문서 SoT/미러**: 본 spec(인간 SoT) + `.agents/harness/config/harness.config.example.json`(harness 미러). **런타임 소스 아님** — 값이 갈리면 spec이 우선, env가 실제 적용. θ는 코드에 하드코딩하지 않고 env 파라미터 경로로 읽는다.

```bash
# server-only env (apps/web/src/lib/verify/config.ts 가 zod 검증)
VERIFY_PHASH_FAIL_MAX=6           # d ≤ 6 → failed (동일-user/group scope)
VERIFY_PHASH_REVIEW_MAX=10        # 7..10 → manual_review
VERIFY_PHASH_FAIL_SCOPES=same_user,same_group   # 전역 cross-user는 failed 제외
VERIFY_PHASH_GLOBAL_ACTION=manual_review        # 전역 near-match 행동
VERIFY_FALSE_FLAG_RATE_MAX=0.01  # θ_rate 수용 바 (PoC 측정 대상)
VERIFY_ENFORCE=false             # false=shadow(기록만), true=실제 차단(PoC 통과 후)
```

```jsonc
// .agents/harness/config/harness.config.example.json (gates.false_flag_rate) — 문서 미러, 런타임 아님
"false_flag_rate": {
  "kind": "threshold",
  "theta": 0.01,            // θ_rate (provisional, PoC-pending)
  "thetaStatus": "provisional",
  "active": false,          // false = shadow mode (VERIFY_ENFORCE=false 와 동치)
  "blockedBy": "G1-PoC",
  "judge": {
    "phashHammingFailMax": 6,
    "phashHammingReviewMax": 10,
    "phashFailScopes": ["same_user", "same_group"],
    "phashGlobalAction": "manual_review",
    "exifTimeSignal": "record_only",
    "screenshotSignal": "review_only"
  },
  "spec": "docs/superpowers/specs/2026-06-05-false-flag-threshold-theta.md"
}
```

### 게이트 상태 = PoC-pending

`false_flag_rate.active=false` 유지 = **shadow mode**(`VERIFY_ENFORCE=false`). θ는 주입됐지만 실측 PoC 전까지 판정기는 would-be 결정만 기록하고 아무도 차단하지 않는다 → "게이트 통과"로 표기하지 않는다(meta-eval neutral). EVAL-0022는 `blocked→todo`로 활성(빌드·shadow 운영 가능), EVAL-0020(컬럼)·EVAL-0021(신호)에 intra-feature 의존(게이트 아님). PoC 통과 시 `VERIFY_ENFORCE=true` + `active=true` flip.

## Alternatives Considered

1. **실측 PoC로 θ 도출 후 주입** — 정석이나 라벨 사진셋·신호 구현 부재로 지금 불가. P2 빌드 전체가 막힘. → 잠정 θ로 빌드를 열고 PoC는 후속 튜닝으로 분리.
2. **보수적 조합(moderate) θ** — `failed = phash 재사용 OR (EXIF 불일치 + 스크린샷 동시)`, `θ_rate ≤ 2%`. 부정은 더 잡지만 정상→failed 오판 위험이 큼. → PRD "거의 안 막게"에 어긋나 미채택(PO 최소 차단 선택).
3. **게이트도 active flip + DECISION resolved** — θ를 강제하고 G1-θ를 종결. 실측 미수행을 "통과"로 간주 → meta-eval weaken. → 미채택(PoC-pending 유지).

## Verification

### 명령

```bash
pnpm validate:docs
pnpm harness:check
pnpm harness:context EVAL-0022
```

### 시나리오

- 정상: 청정 사진(중복 없음) → `passed`.
- 동일-user 재탕: 같은 user의 과거 phash와 `d ≤ 6` → `failed`(enforce 시 카운트 제외, 피드 잔존).
- 동일-group 복사: 같은 그룹 타인의 phash와 `d ≤ 6` → `failed`(or `manual_review`).
- **전역 cross-user 충돌**: 생판 남의 phash와 `d ≤ 6` → **`failed` 아님**(신호 기록 / 최대 `manual_review`).
- 경계: near-dup(7 ≤ d ≤ 10, 동일-user/group) → `manual_review`(카운트 인정).
- 소프트 신호 단독: EXIF 누락만 / 스크린샷 의심만 → `passed`(기록만), 단독 차단 안 됨.
- **shadow mode**(`VERIFY_ENFORCE=false`): 위 `failed`/`manual_review`가 would-be로 기록되되 doneCount·피드는 전부 `passed` 취급(차단 0).
- 주입 확인: 판정 코드에 θ 하드코딩 부재 — server env(`VERIFY_*`) zod 경로로 읽음, `NEXT_PUBLIC_` 부재.

> 위 status 단언은 EVAL-0022(판정 로직)에서 θ 픽스처로 테이블 테스트. 본 spec 단계에선 값·주입 지점·문서 정합만 검증.

## Rollout

1. 본 spec 머지 + config·PRD·DECISION_NEEDED·EVAL-0022 동기(본 작업).
2. EVAL-0020(컬럼)·EVAL-0021(신호) 구현.
3. EVAL-0022 판정 로직 구현 — θ를 주입 파라미터로 읽어 매핑, θ 픽스처 테이블 테스트.
4. **dogfood 실측 G1 PoC**(shadow mode, grill Q7): 판정기 shadow 결정 vs **피어/그룹장 라벨**(그룹이 정당하다고 본 / 본인이 진짜 운동이라 확인한 사진)을 ground truth로 대조 → false-flag 비율 측정(N 작아 수동 라벨링). **θ_rate(≤1%)가 수용 바이고 노브(해밍 6/10)보다 우선** — 충돌 시 해밍을 조여(낮춰) rate를 충족시킨다. 임계 이하 확인 시 `VERIFY_ENFORCE=true` + `false_flag_rate.active=true` flip + DECISION_NEEDED G1-θ resolved.

### 롤백

문서·config 변경만이라 단일 revert로 원복(θ_rate→null, active→false 유지, EVAL-0022→blocked). src/·DB 변경 없음.

## Out of scope

- 신호 _계산_ 구현(phash·EXIF·스크린샷) — EVAL-0021.
- status _판정 로직_ 구현 — EVAL-0022.
- 검증 컬럼 migration — EVAL-0020.
- 피어 다수결 반려(맥락적 사기) — EVAL-0025(θ 무관, 기계 신호와 상호보완).
- AI생성·재촬영 우회 하드닝 — Fast-follow(`AC-cheat-detect-4`).
- 실측 PoC 자체 — dogfood 후속(본 spec은 잠정 θ 주입까지).

## 용어집

- **false-flag(오판)**: 정상 사진을 부정으로 잘못 판정하는 것. 비율(`θ_rate`)이 낮을수록 좋다.
- **false-reject**: 정당한 인증을 거절하는 것. 본 도메인에서 비용이 큰 실패(친구 신뢰 훼손).
- **G1**: 빌드 진입 전 BLOCKING 게이트 — 부정탐지 정밀도(false-flag rate) 실측 PoC.
- **perceptual hash(phash)**: 이미지 시각 특징을 요약한 해시. 두 이미지의 해밍거리가 작으면 시각적으로 유사/동일.
- **해밍거리(Hamming distance)**: 두 해시의 다른 비트 수. phash에서 작을수록 유사.
- **provisional θ**: 실측으로 검증되지 않은 잠정 정책값. PoC가 후속 튜닝.
- **PoC-pending**: 임계는 주입했으나 실측 검증 전이라 게이트를 강제(active)하지 않은 상태.
- **shadow mode**: 판정기를 실제로 돌리되 결정을 기록만 하고 doneCount·피드에 적용하지 않는 모드(`VERIFY_ENFORCE=false`). 사용자 무피해로 실측 데이터를 모은다.
- **ground truth(정답 라벨)**: false-flag 비율을 재기 위한 '실제로 정당했는지'의 기준. 여기선 피어/그룹장 판단 + 본인 확인.
- **scope(중복 조회 범위)**: phash 재사용을 어느 모집단과 대조하는가 — 동일-user / 동일-group / 전역. `failed`는 앞 둘로 한정.
