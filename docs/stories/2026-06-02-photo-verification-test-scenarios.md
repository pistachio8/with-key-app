# Test Scenarios: 인증(사진) 기능

> fromwith 인증 기능의 QA 실행용 test 시나리오입니다.
> 출처: [`2026-06-02-photo-verification-job-stories.md`](2026-06-02-photo-verification-job-stories.md) v2 (실제 코드 대조 완료본).
> 작성일 2026-06-02 · 작성자 pistachio8.

**Source**: Job Stories v2 (S1~S5) + 코드 근거(`file:line`)
**Total scenarios**: 28
**Coverage**: Happy path · Edge cases · Error handling · Security(RLS/권한) · Performance(timeout/batch)
**범례**: 우선순위 Critical / High / Medium / Low · 상태 ✅구현됨 🔄부분 ⬜미구현(갭)

각 시나리오는 스토리의 acceptance criteria 최소 1개와 연결됩니다. 매핑은 [Coverage Matrix](#coverage-matrix) 참조.

---

## S1 — 인증 남기기 (사진 + 키워드 + AI 일기)

### TS-1.1 정상 인증 (AI 일기 모드) ✅

**Tests**: S1 AC-2, AC-3, AC-5, AC-7
**Preconditions**: 사용자가 active 챌린지의 참가자. 오늘 아직 미인증.
**User role**: 챌린지 참가자

| Step | Action                        | Expected Result                                                             |
| ---- | ----------------------------- | --------------------------------------------------------------------------- |
| 1    | `/challenge/{id}/action` 진입 | 인증 폼 노출, `action_started` 1회 기록                                     |
| 2    | 사진 1장 촬영/선택            | 미리보기 표시                                                               |
| 3    | 운동 종류 선택(예: running)   | 해당 종류 키워드 칩 노출(`keywords_shown`)                                  |
| 4    | 키워드 칩 2개 탭              | 선택 표시, `keyword_selected` 기록                                          |
| 5    | 제출                          | AI 일기(≤150자) 생성, action_logs 저장, `action_logged`+`ai_generated` 기록 |
| 6    | 피드 복귀                     | 방금 인증 카드가 피드 최상단에 표시                                         |

**Postconditions**: `doneCount` +1(오늘 첫 인증), 사진은 `action-photos`에 저장.
**Priority**: Critical

---

### TS-1.2 직접 입력 메모(키워드 폴백)로 인증 ✅

**Tests**: S1 AC-2(폴백), AC-5
**Preconditions**: active 챌린지 참가자.

| Step | Action                     | Expected Result                               |
| ---- | -------------------------- | --------------------------------------------- |
| 1    | 사진 선택 + 운동 종류 선택 | 정상                                          |
| 2    | "직접 쓰고 싶어요" 링크 탭 | `memo_fallback_opened` 기록, 메모 입력창 노출 |
| 3    | 메모 입력(≤150자) 후 제출  | memo가 `ai_summary`로 승격, AI 호출 없이 저장 |

**Postconditions**: `ai_generated` 미발생(직접 입력), `action_logged.hasMemo=true`.
**Priority**: High

---

### TS-1.3 키워드 다시 뽑기 후 제출 ✅

**Tests**: S1 AC-4
**Preconditions**: active 챌린지 참가자.

| Step | Action                    | Expected Result                          |
| ---- | ------------------------- | ---------------------------------------- |
| 1    | 운동 종류 선택            | 키워드 칩 노출                           |
| 2    | "다시 뽑기" 탭 (최대 5회) | 새 키워드로 교체, `keywords_reroll` 기록 |
| 3    | 키워드 1~3개 선택 후 제출 | `action_logged.rerollCount`에 횟수 반영  |

**Postconditions**: rerollCount 정확 기록.
**Priority**: Medium

---

### TS-1.4 사진 없이 제출 (negative) ✅

**Tests**: S1 AC-2
**Preconditions**: active 챌린지 참가자.

| Step | Action                                    | Expected Result                                  |
| ---- | ----------------------------------------- | ------------------------------------------------ |
| 1    | 사진 없이 운동 종류+키워드만 입력 후 제출 | 제출 차단, `ERR_PHOTO_REQUIRED` 류 사용자 메시지 |

**Postconditions**: action_logs 미생성.
**Priority**: Critical

---

### TS-1.5 키워드 0개 + 메모 없음 (negative) ✅

**Tests**: S1 AC-2
**Preconditions**: active 챌린지 참가자.

| Step | Action                                          | Expected Result                          |
| ---- | ----------------------------------------------- | ---------------------------------------- |
| 1    | 사진+운동 종류만, 키워드 0개·메모 없음으로 제출 | zod `superRefine` 검증 실패, 명확한 에러 |

**Postconditions**: 미저장.
**Priority**: High

---

### TS-1.6 AI 타임아웃 → templateFallback (performance) ✅

**Tests**: S1 AC-5
**Preconditions**: OpenAI 응답 4.5s 초과 또는 mock 지연.

| Step | Action                               | Expected Result                                          |
| ---- | ------------------------------------ | -------------------------------------------------------- |
| 1    | 정상 입력 후 제출, AI 응답 4.5s 초과 | `AbortController`로 중단, `templateFallback()` 일기 저장 |
| 2    | 결과 확인                            | `action_logged` 정상, `ai_generated.fallback=true`       |

**Postconditions**: 사용자는 빈 응답을 보지 않음.
**Priority**: High | **환경**: OpenAI mock/지연 주입 필요

---

### TS-1.7 HEIC 사진 업로드 (edge) ✅

**Tests**: S1 AC-3
**Preconditions**: iOS Safari, HEIC 원본.

| Step | Action                 | Expected Result                        |
| ---- | ---------------------- | -------------------------------------- |
| 1    | HEIC 사진 선택 후 제출 | `prepareForUpload`가 변환, 업로드 성공 |

**Postconditions**: 피드에서 정상 표시.
**Priority**: Medium | **환경**: 실 iOS 기기 권장
**Note**: validator MIME(jpeg/png/webp)와 bucket(heic/heif 허용) 불일치(E13) — 변환 실패 경로도 함께 확인.

---

### TS-1.8 5MB 초과 사진 (negative) ✅

**Tests**: S1 AC-3
**Preconditions**: 6MB 사진.

| Step | Action        | Expected Result                                   |
| ---- | ------------- | ------------------------------------------------- |
| 1    | 6MB 사진 제출 | `uploadPhoto` `reason:"size"` 거부, 사용자 메시지 |

**Postconditions**: 미저장.
**Priority**: Medium

---

### TS-1.9 비활성 챌린지에서 인증 (negative) ✅

**Tests**: S1 AC-1
**Preconditions**: 챌린지 status가 pending/closed 또는 기간 밖.

| Step | Action           | Expected Result                     |
| ---- | ---------------- | ----------------------------------- |
| 1    | 기간 밖에서 제출 | 서버 KST 시각 기준 `forbidden` 반환 |

**Postconditions**: 미저장.
**Priority**: Critical

---

### TS-1.10 비참가자의 인증 시도 (security) ✅

**Tests**: S1 AC-1, 권한
**Preconditions**: 해당 챌린지 비참가자 계정.

| Step | Action                                  | Expected Result               |
| ---- | --------------------------------------- | ----------------------------- |
| 1    | `submitActionLog`를 타 챌린지 id로 호출 | RLS/참가자 조회로 `forbidden` |

**Postconditions**: 미저장, 정보 누출 없음.
**Priority**: Critical

---

### TS-1.11 업로드/RPC 실패 시 정리 (error) ✅

**Tests**: S1 AC-3 / Edge E5
**Preconditions**: Storage 또는 `update_action_log_photo_path` RPC 실패 주입.

| Step | Action           | Expected Result                                        |
| ---- | ---------------- | ------------------------------------------------------ |
| 1    | 제출 중 RPC 실패 | `deletePhoto()`로 고아 사진 정리, 사용자에게 실패 안내 |

**Postconditions**: 불완전 성공 레코드/고아 파일 없음.
**Priority**: High | **환경**: 실패 주입 필요

---

### TS-1.12 일기 본문 미로깅 (security) ✅

**Tests**: S1 AC-7
**Preconditions**: 정상 인증.

| Step | Action                             | Expected Result                                                                              |
| ---- | ---------------------------------- | -------------------------------------------------------------------------------------------- |
| 1    | 인증 후 분석 이벤트/서버 로그 점검 | `action_logged`/`ai_generated`에 일기·프롬프트 본문 없음, 메타만(`photoSize`·`latencyMs` 등) |

**Postconditions**: 사생활 보호 충족.
**Priority**: High

---

## S2 — 하루 한 번 카운트

### TS-2.1 오늘 첫 인증 ✅

**Tests**: S2 AC-1
**Preconditions**: 오늘 미인증.

| Step | Action    | Expected Result                |
| ---- | --------- | ------------------------------ |
| 1    | 인증 제출 | `doneCount` +1, 추가 안내 없음 |

**Priority**: Critical

---

### TS-2.2 같은 날 두 번째 인증 ✅

**Tests**: S2 AC-1, AC-2, AC-3
**Preconditions**: 오늘 이미 1회 인증함.

| Step | Action            | Expected Result                                          |
| ---- | ----------------- | -------------------------------------------------------- |
| 1    | 인증 폼 재진입    | "추가 피드는 기록되지만 인증 횟수는 안 늘어요" 안내 카드 |
| 2    | 두 번째 인증 제출 | 피드에 카드 추가, `doneCount` 불변                       |

**Postconditions**: 그날 doneCount 여전히 1, 피드 카드는 2개.
**Priority**: High

---

### TS-2.3 KST 자정 경계 (edge) ✅

**Tests**: S2 AC-1
**Preconditions**: 서버 시각을 23:59 KST / 00:01 KST로 제어.

| Step | Action         | Expected Result                       |
| ---- | -------------- | ------------------------------------- |
| 1    | 23:59 KST 인증 | day key = D                           |
| 2    | 00:01 KST 인증 | day key = D+1, `doneCount` 2일로 집계 |

**Priority**: High | **환경**: 서버 시각 제어/clock mock

---

### TS-2.4 제출 후 사진 교체/삭제 시도 (negative) ⬜설계 제약

**Tests**: S2 AC-4
**Preconditions**: 인증 완료된 action_log 보유.

| Step | Action                            | Expected Result                |
| ---- | --------------------------------- | ------------------------------ |
| 1    | 동일 경로에 재업로드(upsert) 시도 | Storage RLS UPDATE 없음 → 거부 |
| 2    | action_log 삭제 시도              | 수단 없음(immutable), 거부     |

**Postconditions**: 원본 불변.
**Priority**: Medium
**Note**: 정정 허용 여부는 Open Question(ADR 필요).

---

## S3 — 인증 피드 + Kudos

### TS-3.1 그룹원 인증 카드 표시 ✅

**Tests**: S3 AC-1, AC-5
**Preconditions**: 같은 챌린지에 그룹원 인증 존재.

| Step | Action       | Expected Result                                               |
| ---- | ------------ | ------------------------------------------------------------- |
| 1    | 피드 탭 진입 | 카드: 사진·작성자명·키워드·AI일기 요약·시각, `feed_view` 기록 |

**Priority**: Critical

---

### TS-3.2 Kudos 토글 ✅

**Tests**: S3 AC-3, AC-6
**Preconditions**: 피드에 타인 카드 존재.

| Step | Action           | Expected Result                                  |
| ---- | ---------------- | ------------------------------------------------ |
| 1    | 🔥 탭            | 카운트 +1, 내 반응 활성, `kudos_given` 기록      |
| 2    | 🔥 재탭          | 토글 해제, 카운트 -1                             |
| 3    | 카드 작성자 확인 | 작성자에게 `kudos_received` 푸시(본인→본인 제외) |

**Priority**: High

---

### TS-3.3 비멤버 피드 접근 (security) ✅

**Tests**: S3 AC-2
**Preconditions**: 해당 챌린지 비멤버 계정.

| Step | Action                         | Expected Result                                   |
| ---- | ------------------------------ | ------------------------------------------------- |
| 1    | 비멤버가 피드 조회             | Layer 1 visibility가 빈 ID 리스트 반환 → 카드 0개 |
| 2    | 사진 signed URL 직접 접근 시도 | bucket RLS(같은 챌린지 멤버만 SELECT)로 차단      |

**Postconditions**: 타 그룹 사진/내용 누출 없음.
**Priority**: Critical

---

### TS-3.4 빈 피드 (edge) 🔄

**Tests**: S3 AC-7
**Preconditions**: 아무도 인증 안 한 챌린지.

| Step | Action    | Expected Result         |
| ---- | --------- | ----------------------- |
| 1    | 피드 진입 | 빈 상태 안내(에러 아님) |

**Priority**: Medium | **Note**: 빈/실패 상태 UI 구현 확인 필요.

---

### TS-3.5 Pre-signed URL 만료 경계 (edge) ✅

**Tests**: S3 AC-4
**Preconditions**: signed URL 발급 후 9~10분 경과.

| Step | Action                       | Expected Result                         |
| ---- | ---------------------------- | --------------------------------------- |
| 1    | 만료 임박 시점 재방문        | 9분 revalidate로 fresh URL, 이미지 정상 |
| 2    | 600초 초과 후 stale URL 사용 | 깨진 이미지 대신 갱신 동작 확인         |

**Priority**: Medium | **환경**: 시간 경과/clock 제어

---

### TS-3.6 다수 카드 사진 batch 로딩 (performance) ✅

**Tests**: S3 AC-4, AC-5
**Preconditions**: 카드 20개 이상.

| Step | Action      | Expected Result                                             |
| ---- | ----------- | ----------------------------------------------------------- |
| 1    | 피드 스크롤 | `getPhotoSignedUrls` batch로 token 호출 폭발 없음(429 없음) |

**Priority**: Medium | **Note**: ADR-0024 admin cache 경로 회귀 확인.

---

## S4 — 누적 달성 / 예정 벌금

### TS-4.1 목표 달성 → 벌금 0 ✅

**Tests**: S4 AC-1
**Preconditions**: `doneCount ≥ goalCount`.

| Step | Action            | Expected Result          |
| ---- | ----------------- | ------------------------ |
| 1    | 결과/홈 화면 조회 | 성공 표시, 예정 벌금 0원 |

**Priority**: Critical

---

### TS-4.2 목표 미달 → 예정 벌금 표시 ✅

**Tests**: S4 AC-1, AC-2
**Preconditions**: `doneCount < goalCount`, `penalty_amount`=5,000.

| Step | Action    | Expected Result                                  |
| ---- | --------- | ------------------------------------------------ |
| 1    | 결과 조회 | "예정 벌금 5,000원(표시만)" 노출, 실제 정산 없음 |

**Postconditions**: 정산 트랜잭션 미발생(POC).
**Priority**: Critical

---

### TS-4.3 그룹 누적금(pot) 집계 (edge) ✅

**Tests**: S4 AC-3
**Preconditions**: 미달 참가자 2명, penalty 5,000.

| Step | Action   | Expected Result                           |
| ---- | -------- | ----------------------------------------- |
| 1    | pot 조회 | Σ(미달자×penalty)=10,000, 달성자는 0 가산 |

**Priority**: High

---

### TS-4.4 end_at 도달 자동 종료 (edge) ✅

**Tests**: S4 AC-6
**Preconditions**: `end_at` 경과한 active 챌린지.

| Step | Action                  | Expected Result                        |
| ---- | ----------------------- | -------------------------------------- |
| 1    | deadline-push cron 실행 | `active → closed` 전이, 이후 인증 차단 |

**Priority**: High | **환경**: cron 수동 트리거

---

### TS-4.5 타 그룹 결과 조회 (security) ✅

**Tests**: S4 AC-4
**Preconditions**: 타 그룹 챌린지 id.

| Step | Action                  | Expected Result |
| ---- | ----------------------- | --------------- |
| 1    | 비멤버가 결과/벌금 조회 | RLS로 차단      |

**Priority**: Critical

---

### TS-4.6 penalty_displayed 이벤트 ✅

**Tests**: S4 AC-5
**Preconditions**: 마감 임박 카드 노출.

| Step | Action              | Expected Result                  |
| ---- | ------------------- | -------------------------------- |
| 1    | 마감 임박 카드 표시 | `penalty_displayed{amount}` 기록 |

**Priority**: Medium

---

## S5 — 알림에서 인증/피드 진입

### TS-5.1 deadline 푸시 → 인증 화면 ✅

**Tests**: S5 AC-1, AC-3
**Preconditions**: 푸시 구독 ON, 챌린지 종료 12~36h 전, 현재 비-Quiet Hours.

| Step | Action                  | Expected Result                          |
| ---- | ----------------------- | ---------------------------------------- |
| 1    | deadline-push cron 발송 | "마감 24시간 전" 푸시 수신               |
| 2    | 알림 탭                 | `/challenge/{id}/action`으로 딥링크 진입 |

**Priority**: High | **환경**: 실기기/푸시 구독

---

### TS-5.2 friend_action 푸시 → 챌린지 ✅

**Tests**: S5 AC-2
**Preconditions**: 그룹원이 방금 인증, 본인 구독 ON.

| Step | Action           | Expected Result                                  |
| ---- | ---------------- | ------------------------------------------------ |
| 1    | 그룹원 인증 발생 | "OOO님이 오늘 인증을 완료했어요" 수신(본인 제외) |
| 2    | 탭               | `/challenge/{id}` 진입                           |

**Priority**: High

---

### TS-5.3 Quiet Hours 발송 차단 (edge) ✅

**Tests**: S5 AC-4
**Preconditions**: 서버 시각 03:00 KST.

| Step | Action      | Expected Result                                         |
| ---- | ----------- | ------------------------------------------------------- |
| 1    | 알림 트리거 | `isQuietHoursKST`=true → 발송 skip, `suppressed` 기록만 |

**Priority**: High | **환경**: clock 제어

---

### TS-5.4 본인 인증 알림 제외 (edge) ✅

**Tests**: S5 AC-2
**Preconditions**: 본인이 인증.

| Step | Action         | Expected Result                                  |
| ---- | -------------- | ------------------------------------------------ |
| 1    | 본인 인증 제출 | 본인에게는 friend_action 미발송(`excludeUserId`) |

**Priority**: Medium

---

### TS-5.5 기존 탭 navigate vs 새 창 (edge) ✅

**Tests**: S5 AC-3
**Preconditions**: 앱 탭이 (a) 열려 있음 / (b) 없음.

| Step | Action                 | Expected Result                                      |
| ---- | ---------------------- | ---------------------------------------------------- |
| 1    | 알림 탭 — 앱 열린 상태 | 기존 same-origin 탭을 `targetUrl`로 navigate + focus |
| 2    | 알림 탭 — 앱 닫힌 상태 | `clients.openWindow(targetUrl)` 새 창                |

**Priority**: Medium

---

### TS-5.6 알림 클릭 비콘 핸들러 부재 (known gap) ⬜

**Tests**: S5 / Edge E14
**Preconditions**: 알림 클릭.

| Step | Action                                   | Expected Result (현재 vs 기대)                                                       |
| ---- | ---------------------------------------- | ------------------------------------------------------------------------------------ |
| 1    | service worker가 `/api/push/opened` POST | **현재**: 수신 Route Handler 없음 → 비콘 유실 / **기대**: 핸들러 구현 또는 비콘 제거 |

**Priority**: Low(추적용) | **Note**: 회귀 테스트 아님 — 갭 가시화용 시나리오.

---

## Coverage Matrix

| 스토리 / AC    | Happy       | Edge        | Error/Neg            | Security  | Perf |
| -------------- | ----------- | ----------- | -------------------- | --------- | ---- |
| S1 인증 남기기 | 1.1·1.2·1.3 | 1.7         | 1.4·1.5·1.8·1.9·1.11 | 1.10·1.12 | 1.6  |
| S2 하루 1회    | 2.1·2.2     | 2.3         | 2.4                  | —         | —    |
| S3 피드+Kudos  | 3.1·3.2     | 3.4·3.5     | —                    | 3.3       | 3.6  |
| S4 달성/벌금   | 4.1·4.2     | 4.3·4.4     | —                    | 4.5       | —    |
| S5 알림 진입   | 5.1·5.2     | 5.3·5.4·5.5 | 5.6(gap)             | —         | —    |

모든 스토리에 happy + (edge 또는 error) + 최소 1개의 보안/성능 시나리오가 매핑됩니다. S1(코어)은 negative·security를 가장 두껍게 커버합니다.

---

## Test Data Requirements

QA 실행에 필요한 데이터/환경입니다.

- **계정**: ① active 챌린지 참가자(오너), ② 같은 챌린지 일반 참가자, ③ **비참가자/타 그룹** 계정(security 시나리오용).
- **챌린지 상태 셋업**: pending / accepted / active(기간 내) / active(기간 밖) / closed 각 1개. `goal_count`·`penalty_amount`(0 / 5,000) 변형.
- **사진 픽스처**: 정상 JPEG(<5MB), **HEIC 원본**, **6MB 초과** 파일, 손상 파일.
- **시각 제어**: 서버 clock mock(23:59/00:01 KST 경계, 03:00 KST Quiet Hours, end_at 경과).
- **외부 서비스 mock**: OpenAI 4.5s 초과 지연(타임아웃→fallback), Storage/RPC 실패 주입.
- **푸시 환경**: VAPID 구독된 실기기 또는 web push 에뮬레이션, cron 수동 트리거 경로.
- **분석 검증**: 이벤트 수집 확인 수단(`action_logged`·`ai_generated`·`feed_view`·`kudos_given`·`penalty_displayed`)과 본문 미로깅 점검.

> ⚠️ 더미 데이터는 **합성/redacted** 값만 사용 — 실제 사용자 사진·일기 본문 반입 금지(사생활).
> E2E는 공유 Supabase 동시 실행 시 플레이크 가능 — 단독 재실행 권장(머지 비차단).

---

## Open Items (시나리오에서 드러난 후속)

1. **TS-2.4 / E4** 인증 정정 수단 부재 — 허용 정책 결정 시 시나리오 갱신(ADR 필요).
2. **TS-1.7 / E13** validator·bucket MIME 불일치 — 변환 실패 경로 정의.
3. **TS-5.6 / E14** `/api/push/opened` 핸들러 — 구현 또는 비콘 제거 결정.
4. **TS-4.2** 실제 벌금 정산(v1) 도입 시 "표시만" 시나리오를 정산 검증으로 확장.
