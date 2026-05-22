---
plan: 2026-05-22-header-unread-dot-source
title: 헤더 알림 dot 의 소스를 /notifications IDB 미읽음으로 이전
author: pistachio8
date: 2026-05-22
status: draft
---

## 목표

`AppHeader` 의 빨간 알림 dot 이 `/notifications` 리스트가 비어있어도 표시되는 현상을 해소한다.
dot 의 의미를 **"`/notifications` IDB(IndexedDB) 미읽음 알림 개수 > 0"** 으로 재정의해, 사용자의 멘탈 모델(`알람 메뉴 = 헤더 dot`)과 일치시킨다.

연관 AC 없음(PRD 미정의). DESIGN_BRIEF §1.5 의 "미읽음 Kudos dot" 정의는 본 plan 에서 폐기 처리한다(주석 보존 — 본 plan 의 `## 후속 액션` 참조).

## 배경 — 현재 구조의 mismatch

| | 헤더 dot (현재) | `/notifications` 리스트 |
|---|---|---|
| 데이터 소스 | 서버: `kudos` 테이블 + `users.last_feed_seen_at` ([`fetchUnreadKudosCount`](../../../src/lib/db/reads/unread-kudos.ts)) | 클라이언트 IDB: `with-key-notifications` DB ([`listNotifications`](../../../src/lib/notifications/store.ts)) |
| 의미 도메인 | Kudos(응원) 미읽음 | Push 수신 알림 (reminder · friend_action · penalty) |
| 읽음 처리 트리거 | `last_feed_seen_at` 갱신 (피드 진입 추정) | `markAllRead` (IDB만 갱신) |

두 시스템이 분리되어 있을 뿐 아니라, **`/feed` 라우트는 ADR-0002 로 폐기**되었고 `markFeedSeen` 서버 액션은 **호출자가 0개**(spec 제외)다. 결과적으로 `last_feed_seen_at` 은 영원히 갱신되지 않아 Kudos 가 1개라도 있으면 헤더 dot 은 영구 ON. 이게 사용자가 보고한 "리스트 비었는데 dot 떠있는" 현상의 root cause.

## 결정 (grilling 결과 — 2026-05-22)

| 분기점 | 선택 | 이유 |
|---|---|---|
| dot 의미 | **B**: dot = `/notifications` IDB 미읽음만 | 사용자 멘탈 모델 일치. `/feed` 폐기로 Kudos 시그널 채널 사라짐 — Kudos 미읽음은 `/feed` 카드 단위 표시(이미 존재)로 충분 |
| Dead code 처리 | **ㄷ**: dot 만 분리, dead code 는 주석만 추가 | Karpathy §3 외과적 수정. `last_feed_seen_at` column drop · `fetchUnreadKudosCount`/`markFeedSeen` 완전 제거는 follow-up |
| IDB 재계산 트리거 | **γ**: 마운트 + `usePathname()` 변경 + `document.visibilitychange` | `/notifications` 진입→탈출 시 자연 갱신, 백그라운드 SW push 수신 후 앱 복귀 시 dot ON. SW 수정 회피(`δ` BroadcastChannel 채택 안 함) |
| 산출물 | plan only | spec-required 경로 §4 해당 없음. 동작 교체이지 도메인 재정의는 plan 범위 |

## 기술 검토 반영 (2026-05-22)

본 plan 은 grilling 직후 1차 기술 검토를 거침. 라벨 의미는 자매 plan [`2026-05-22-kudos-received-notification.md`](2026-05-22-kudos-received-notification.md) §기술 검토 반영 참조.

| 라벨 | 항목 | 반영 위치 |
|---|---|---|
| **M3** | SSR-마운트 깜빡임 완화 — `opacity` transition | §작업 단계 1 |
| **L2** | SR 즉시 통지 — `aria-live="polite"` 영역 | §후속 액션 |
| 그 외 | (kudos plan 측 반영) | 자매 plan |

대안 비교 요약:
- 옵션 A (Kudos 유지 + `markFeedSeen` 트리거 추가) — `/feed` 폐기 후 트리거 둘 곳이 마땅치 않고 사용자가 본 mismatch 의 절반만 해결.
- 옵션 C (Kudos OR IDB 합집합) — "리스트 비었는데 dot" 케이스 일부 잔존.
- 옵션 δ (BroadcastChannel) — SW 코드 수정 + iOS Safari < 16.4 호환성 부담, POC 범위 초과.

## 영향 범위

- 변경 경로:
  - [`src/app/(app)/layout.tsx`](../../../src/app/(app)/layout.tsx) — `fetchUnreadKudosCount` 호출 · `unreadNotifications` prop 제거
  - [`src/components/app-shell/app-header.tsx`](../../../src/components/app-shell/app-header.tsx) — `unreadNotifications` prop 제거, 알림 아이콘 영역을 `<NotificationBell />` island 로 치환
  - `src/components/app-shell/notification-bell.tsx` (신규) — `'use client'` island. IDB `unreadCount()` 구독
  - `src/components/app-shell/notification-bell.spec.tsx` (신규) — 마운트·pathname·visibilitychange 시나리오 검증
  - [`src/components/app-shell/app-header.spec.tsx`](../../../src/components/app-shell/app-header.spec.tsx) — `unreadNotifications` 관련 case 정리
  - [`src/lib/db/reads/unread-kudos.ts`](../../../src/lib/db/reads/unread-kudos.ts) — 주석 추가 ("현재 호출자 없음 — ADR-0002 이후 역할 재정의 대기")
  - [`src/app/(app)/_actions.ts`](../../../src/app/(app)/_actions.ts) — `markFeedSeen` 주석 동일 표기
- 데이터/RLS 영향: 없음 (이번 PR 에서는 `users.last_feed_seen_at` column 유지)
- 외부 서비스: 없음
- 재사용 후보:
  - [`src/lib/notifications/store.ts`](../../../src/lib/notifications/store.ts) `unreadCount()` 그대로 활용
  - `usePathname` (`next/navigation`), `document.visibilitychange` 표준 API

## 작업 단계 (small batch)

1. **NotificationBell island 신설**
   - `src/components/app-shell/notification-bell.tsx` — `'use client'`. `useEffect` 로 `unreadCount()` 호출 → `useState<boolean>` 으로 dot 토글. 트리거: 마운트 · `usePathname()` 변경 · `document.visibilitychange` (visible 일 때만 재계산).
   - 초기값 `false` (SSR 단계에서는 IDB 미가용).
   - **깜빡임 완화 (M3)**: dot `<span>` 에 `opacity-0 transition-opacity duration-200` 기본값, `unread === true` 일 때 `opacity-100` 토글. CLS 0 보장은 `position: absolute` 로 layout shift 없음 + 시각 깜빡임은 200ms fade-in 으로 완화. 수동 확인에서 재평가.
   - 시그니처: `<NotificationBell />` (props 없음, IDB 자체 구독).
   - 검증: `pnpm typecheck`
2. **AppHeader 시그니처 정리**
   - `AppHeader` 에서 `unreadNotifications` prop 제거. 알림 `<Link>` 영역을 `<NotificationBell />` 로 치환. `ICON_LINK_CLASSES` · `<Bell>` · `aria-label` 토글 로직은 NotificationBell 로 이전.
   - 검증: `pnpm lint && pnpm typecheck`
3. **layout.tsx 정리**
   - `fetchUnreadKudosCount(user.id)` 호출 · `Promise.all` 항목 · `unreadCount` 변수 · `unreadNotifications` prop 모두 제거.
   - 검증: `pnpm lint && pnpm typecheck`
4. **테스트 갱신**
   - `app-header.spec.tsx`: `unreadNotifications=true|false` describe 두 케이스 제거. `aria-label="알림"` 단일 케이스만 남김.
   - `notification-bell.spec.tsx` 신규: 마운트 시 `unreadCount()` 호출 / 0 이면 dot 미렌더 / >0 이면 `data-testid="header-unread-dot"` 렌더 / pathname 변경 시 재호출 / visibilitychange (visible) 시 재호출. `lib/notifications/store` 를 `vi.mock` 으로 대체.
   - 검증: `pnpm test src/components/app-shell`
5. **Dead code 주석 추가**
   - `unread-kudos.ts` 파일 헤더에 "현재 호출자 없음. `/feed` 폐기(ADR-0002) 이후 dot 소스가 IDB 로 이전(2026-05-22 plan). 제거는 follow-up." 추가.
   - `_actions.ts` `markFeedSeen` 에 동일 주석.
   - 검증: `pnpm lint`
6. **전체 검증**
   - `pnpm typecheck && pnpm lint && pnpm test`
   - 모바일 viewport 수동 시나리오 (아래 §검증 참조)

## 검증

```bash
pnpm typecheck
pnpm lint
pnpm test
```

수동 확인 항목:

- [ ] 모바일 viewport (375px) `/home` 진입 시 알림 IDB 비어있으면 dot 미표시
- [ ] DevTools Application → IndexedDB → `with-key-notifications` 에 미읽음 레코드 1개 수동 삽입 → 페이지 새로고침 → dot 표시
- [ ] `/notifications` 진입 → 자동 `markAllRead` → 뒤로가기 → pathname 변경으로 dot OFF
- [ ] DevTools "Application → Service Workers → Update on reload" 켜고 푸시 시뮬레이션 → 백그라운드 IDB 적재 → 앱 탭 전환 후 복귀 (visibilitychange) → dot ON
- [ ] `aria-label` 동적 변경 확인: dot ON 시 `"알림 (새 응원 있음)"` → 본 plan 에서는 라벨도 IDB 기준으로 통일 (예: `"알림 (새 알림 있음)"`)

수동 확인 비대상:
- `pnpm build` — Next.js 설정 / middleware 변경 없음
- `pnpm supabase db reset` — migration 추가 없음

## 리스크 / 미해결

- **SSR-마운트 깜빡임**: 초기 false → 마운트 후 true 로 dot 가 켜지는 짧은 깜빡임. `position: absolute` 라 layout shift 0. 인지적 거슬림은 미미할 것으로 판단(수동 확인에서 재평가).
- **다른 탭 동기화 없음**: 탭 A 에서 `/notifications` 진입해 `markAllRead` 해도 탭 B 헤더는 visibilitychange 발생 전까지 그대로. POC 수준 허용.
- **`aria-label` 문구 결정**: 현재는 "새 응원 있음" — Kudos 한정 표현. IDB 알림(reminder/friend_action/penalty) 전체를 가리키므로 "새 알림 있음" 으로 일반화 권장. plan 적용 시 확정.

## 후속 액션 (별도 PR/issue)

- **Dead code 완전 제거**: `fetchUnreadKudosCount` · `markFeedSeen` · `isUnread` · 각 spec · `users.last_feed_seen_at` column drop migration.
  - migration 은 spec-required 경로 §4 → **ADR 필수**: `docs/adr/NNNN-drop-last-feed-seen-at.md` 동반.
- **SW BroadcastChannel 실시간 동기화**: 옵션 δ 후속. SW 측 push 수신 시 `BroadcastChannel('with-key-notifications').postMessage('new')` → 헤더 즉시 반영. iOS Safari ≥ 16.4 전제 검토.
- **DESIGN_BRIEF §1.5 갱신**: "미읽음 Kudos dot" 정의를 "미읽음 알림 dot (IDB)" 로 갱신.
- **L2. SR(스크린 리더) 즉시 통지 — `aria-live="polite"` 영역**: 현재 plan 의 `aria-label` 동적 변경만으로는 SR 사용자에게 dot ON 즉시 안내가 안 됨(라벨 변경은 다음 focus 시점에 읽힘). 헤더 영역 어딘가에 `aria-live="polite"` 또는 `role="status"` 컨테이너 추가해 "새 알림 N건" 텍스트를 토글하는 패턴. 접근성 우선순위 확정 후 별도 PR.
