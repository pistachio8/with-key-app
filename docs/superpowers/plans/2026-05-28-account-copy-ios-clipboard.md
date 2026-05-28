---
plan: 2026-05-28-account-copy-ios-clipboard
title: 계좌번호 복사 iOS Safari/PWA 실패 수정
author: pistachio8
date: 2026-05-28
status: draft
---

## 목표

챌린지 정보 → 정산 계좌 시트에서 "계좌번호 복사" 시 iOS Safari/standalone PWA에서 "복사에 실패했어요" 토스트가 뜨는 버그를 수정한다. (화면 인벤토리 D-016 · PRD §정산 계좌)

## 근본 원인

`account-info-sheet.tsx`의 `copy()`가 **클릭 → `await revealAccountNumber()`(서버 복호화 네트워크 왕복) → `navigator.clipboard.writeText()`** 순서다. iOS WebKit은 사용자 제스처 핸들러 안에 네트워크 `await`가 끼면 **transient user activation(직전 제스처 권한)을 잃어**, 이어지는 clipboard write를 `NotAllowedError`로 거부한다.

토스트 출처가 이를 확증한다 — "복사에 실패했어요. 다시 시도해 주세요."는 `revealAccountNumber`가 **성공**(복호화 평문 확보)한 직후 `writeText`만 throw한 경우(`account-info-sheet.tsx:66`)에만 발화. 서버·복호화·RLS 문제가 아니라 순수 브라우저 clipboard 호출 실패다.

대조군: `in-app-browser-guard`(동기 문자열 즉시 write)·`creation-complete-sheet`·`share-card-action`은 네트워크 await 없이 복사하거나 Web Share로 차폐돼 안전. `invite-trigger`는 `tryWebShare()`가 먼저 가로채 clipboard 경로에 거의 안 닿음. **네트워크 await 직후 + share fallback 없이 clipboard 직행은 `account-info-sheet` 단 하나**.

## 수정 설계

핵심: `navigator.clipboard.write([new ClipboardItem({ "text/plain": <revealPromise> })])`를 **제스처 안에서 동기 호출**한다. Safari는 ClipboardItem에 넘긴 Promise를 나중에 resolve해도 활성화를 유지한다. 복호화는 여전히 클릭 시에만 일어나 D-016 보안을 보존한다.

3중 가드로 회귀·uncaught·테스트 깨짐을 닫는다:

1. `typeof ClipboardItem !== "undefined" && typeof navigator.clipboard?.write === "function"` — 미지원(FF<127 · jsdom · 비-secure context)이면 구 경로로.
2. `try/catch` — 구형 Chrome(76–115: ClipboardItem 존재하나 Promise 값 거부, 생성자 동기 throw)을 잡아 구 경로로 폴백. 동기 throw가 promise 체인을 탈출하는 것도 방지.
3. `blob.catch(() => {})` — 생성자 throw 시 인자로 먼저 평가된 파생 promise가 unhandled rejection이 되는 것을 방지(특히 reveal 실패 + 구형 Chrome 조합).

에러 메시지는 promise 바깥 `revealError: ErrorCode | null` 플래그로 reveal 실패와 clipboard 실패를 구분(reject 사유 전파에 의존하지 않음) — 기존 3갈래 메시지 보존.

### 환경별 추적

| 환경                        | 경로                                                  | 결과                         |
| --------------------------- | ----------------------------------------------------- | ---------------------------- |
| iOS Safari / standalone PWA | 신 (write 동기 호출)                                  | 버그 해결                    |
| Chrome 116+                 | 신                                                    | 정상                         |
| Chrome 76–115               | try throw → catch → 구                                | 무회귀                       |
| Firefox <127 / jsdom        | typeof 가드 → 구                                      | 기존 spec 무회귀             |
| 비-secure(로컬 IP)          | `?.write` falsy → 구 → writeText TypeError → `.catch` | "복사 실패" 토스트(graceful) |

## 영향 범위

- 변경 경로: `src/app/(app)/challenge/[id]/_components/account-info-sheet.tsx` · `…/account-info-sheet.spec.tsx`
- 데이터/RLS 영향: 없음 (서버 액션 `revealAccountNumber` 미변경)
- 외부 서비스: 없음
- 재사용 후보: `makeUserMessage`/`FALLBACK_ERROR_MESSAGE`(`src/lib/actions/error-messages.ts`) 기존 사용 유지

## 작업 단계

1. `account-info-sheet.tsx`의 `copy()`를 3중 가드 ClipboardItem 패턴으로 교체 — 검증: `pnpm typecheck`
2. `account-info-sheet.spec.tsx`에 `globalThis.ClipboardItem` + `navigator.clipboard.write` mock으로 신 경로 성공/clipboard 실패 케이스 추가, 기존 구 경로 테스트 유지 — 검증: `pnpm test`
3. typecheck + lint + test 일괄 — 검증: 아래 명령

## 검증

```bash
pnpm typecheck
pnpm lint
pnpm test
```

수동 확인 항목:

- [ ] iOS 실기 홈화면 설치 PWA에서 계좌 시트 복사 → 클립보드에 평문 들어오는지(성공 토스트)
- [ ] 데스크톱 Chrome에서 복사 무회귀
- [ ] 계좌 미등록 그룹(또는 복호화 실패 mock)에서 적절한 에러 토스트

## 리스크 / 미해결

- **account_copied 이벤트 타이밍(기존 동작)**: `_actions.ts:265`에서 reveal 성공 시 발화하며 실제 clipboard 성공과 무관. 신·구 경로 모두 동일 유지 → 회귀 아님. 이벤트명이 "복사"를 과장하므로 정확화하려면 PRD §9.1 mapping 논의 필요 — 별도 결정(이번 스코프 외).
- **reveal 타임아웃 없음**: reveal이 느리면 Safari가 held write를 abort 가능. reveal = 인덱스 단일 select + 대칭 복호화로 sub-second라 실무 무방. 필요 시 후속 AbortController.
- **구형 Chrome 76–115 잔여**: 생성자에서 throw하지 않고 write에서만 reject하는 구현이면 폴백 없이 실패 토스트. 데스크톱 Chrome <116 비중 극미 → 수용.
