---
spec: 2026-05-30-recap-settlement-followups
title: 정산 페이지 후속 — 계좌 복사 · 미리보기 데드락 · 형식 순서 · 영상 통일 레이아웃 · 랜덤 사진
author: pistachio8
date: 2026-05-30
status: proposed
---

> **부모 SoT**: [`2026-05-30-recap-share-preview-panel.md`](./2026-05-30-recap-share-preview-panel.md) (공유 선택 카드 + 미리보기 패널).
> 이 스펙은 그 위에 정산 페이지(`/challenge/[id]/recap`) **후속 개선 5건**을 더한다. 출력물 종류(영상/사진/티켓)·공유 메커니즘·게이팅은 불변이고, **공유물에 들어가는 사진 선택 규칙**과 **영상 내부 레이아웃**, 그리고 **계좌 복사 · 미리보기 로딩 결함**을 다룬다.

## Summary

정산 페이지에 5건을 적용한다.

- **A. 계좌번호 바로 복사 (1탭)** — 정산 영수증 ACCOUNT 섹션에 텍스트 버튼을 두고, 탭 한 번에 전체 계좌번호를 클립보드에 복사한다. 기존 `revealAccountNumber` Server Action + iOS 안전 클립보드 로직을 **공용 훅으로 재사용**한다.
- **B. 미리보기 공백(데드락) 수정** — 미리보기 이미지가 영영 안 뜨는 결함을 고친다. 원인은 `loading="lazy"` + `display:none` 동시 적용(아래 D-B).
- **C. 형식 순서 + 기본값** — 형식 카드 순서를 `[티켓·사진·영상]`으로, 기본 선택을 **티켓**으로 바꾼다. 첫 진입에서 무거운 영상이 기본이 되지 않게 한다.
- **D. 영상(MP4) 통일 레이아웃** — 영상 몽타주를 **사진 카드 레이아웃**으로 통일한다. 카드 프레임은 고정, 히어로 사진만 순환한다.
- **E. 공유물 랜덤 사진** — 사진·티켓 카드 히어로는 **내가 올린 사진 중 랜덤**, 영상 몽타주는 **챌린지 전체 사진 중 랜덤**. 단 **미리보기에 본 사진 = 실제 공유되는 사진**을 보장한다(seed 1회 결정).

## Why

- **A**: 정산 영수증은 마스킹된 `***-****1234`만 보여 줘 멤버가 벌금을 송금할 계좌를 복사할 길이 없다. 복호화·인가·클립보드 경로는 챌린지 info 탭에 이미 있으나 정산 페이지엔 연결돼 있지 않다.
- **B**: 미리보기가 실제 브라우저에서 빈 박스로 남는다(아래 근본 원인). 패널의 존재 이유("공유 전 확신")가 무력화된다.
- **C**: 영상은 가장 무거운 출력물(MP4 인코딩)이라 첫 진입 기본값으로 두면 첫 미리보기·체감이 느려진다.
- **D**: 현재 영상은 인트로·몽타주·엔드카드의 레이아웃이 제각각이라("몽타주=풀블리드", "엔드카드=사진 카드") 통일감이 없다. 사용자 요청 — "동일 레이아웃에서 이미지만 변경되는 느낌".
- **E**: 공유물이 늘 "최신 1장"이라 단조롭다. 랜덤이면 다양해진다. 다만 미리보기와 실제 공유물이 어긋나면 안 된다.

## Design

### D-A. 계좌번호 바로 복사 (1탭)

영수증 ACCOUNT 줄에 텍스트 버튼을 인라인한다.

```text
ACCOUNT
신한 ***-****1234 · 홍길동        [⧉ 계좌번호 복사]   ← 텍스트 버튼(영수증 톤)
```

- **공용 훅 추출**: `src/app/(app)/challenge/[id]/_components/use-copy-account-number.ts` 신설 — `useCopyAccountNumber(groupId): { copy: () => void; copying: boolean }`. 기존 `account-info-sheet.tsx`의 `copy()` 본문(3갈래 토스트 + iOS Safari transient-activation 안전 `ClipboardItem` 경로 + 구 경로 폴백)을 그대로 옮긴다.
  - **왜 훅**: 같은 복사 로직을 영수증 버튼과 기존 시트 두 곳에서 쓰되 중복(드리프트)을 0으로. iOS 클립보드 처리는 미묘해서 복붙 분기는 위험.
- **`AccountInfoSheet` 리팩터**: 자체 `copy()`·`copying` state를 훅 호출로 교체. **동작 불변**(기존 `account-info-sheet.spec.tsx` 통과 유지).
- **신규 버튼**: `src/app/(app)/challenge/[id]/recap/_components/account-copy-button.tsx` (`"use client"`) — `useCopyAccountNumber(groupId)` 사용. lucide `Copy` 아이콘 + "계좌번호 복사" 라벨. 영수증 톤(`text-[11px]`·`var(--invite-accent)`·underline-offset)으로, 채워진 큰 버튼이 아니라 텍스트 버튼.
- **prop 추가**: `SettlementReceipt`에 `groupId: string | null`. `recap/page.tsx`가 `recap.group?.id ?? null` 전달. ACCOUNT 블록은 `account` truthy일 때만 렌더되므로 그 안에서 `groupId`는 보장된다(렌더 가드).
- **인가·이벤트**: `revealAccountNumber`가 RLS(`groups_select_member`)로 비멤버를 차단하고 `account_copied` 이벤트를 이미 발사한다 → **신규 권한·이벤트·마이그레이션 0**. 멤버 누구나 송금 위해 복사 가능(기존 info 탭과 동일 정책).

### D-B. 미리보기 공백(데드락) 수정

**근본 원인 (확정)**: `share-card-action.tsx`의 미리보기 `<img>`가 마운트 시점에 두 속성을 동시에 가진다.

- `loading="lazy"`
- Tailwind `hidden`(= `display:none`) — 자기 `status`가 `"loaded"`가 되기 전까지.

실제 브라우저에서 `loading="lazy"` + `display:none`은 **영영 로드되지 않는다**. `display:none` 요소는 레이아웃 박스가 없어 뷰포트와 교차하지 않고 → lazy 로더가 fetch를 보류 → `onLoad`/`onError` 둘 다 안 뜸 → `status`가 `"loading"`에 영구 고정 → 이미지는 계속 숨김 → **공백**. ("끝까지 안 뜸 + 에러 문구도 아님" 증상과 일치. `공유하기`는 `fetch`라 정상 작동 → OG 라우트 자체는 멀쩡.)

**왜 테스트가 못 잡았나**: `share-card-action.spec.tsx`는 jsdom에서 `fireEvent.load(...)`로 load 이벤트를 **수동 발화**한다. jsdom은 lazy 교차 로딩을 구현하지 않아 실브라우저 데드락이 재현되지 않는다.

**수정**:

- 미리보기 이미지의 show/hide를 `hidden`(`display:none`) → **`opacity` 기반**으로 변경한다. opacity면 박스가 유지돼 lazy 교차가 정상 발화한다(스크롤 진입 시 로드 → `onLoad` → 노출). 데드락 해소.
- 로딩 스켈레톤을 **크림 톤 + 은은한 shimmer**로 채운다. 현재는 배경 없는 `animate-pulse`라 `bg-muted` 위에서 거의 안 보여 "공백"으로 읽힌다(부모 스펙 D5가 의도한 "shimmer"가 구현에서 누락됐다).
- `loading="lazy"`는 **유지**(opacity로 비용 절약 의도 보존), `decoding="async"` 추가.
- **keep-alive 유지**: 한 번 본 형식은 unmount 안 함(형식 전환 시 재fetch 0, 부모 D3) — 숨김 방식만 `display:none` → opacity.
- **회귀 테스트**: 선택된 미리보기 `<img>`가 로딩 중에도 `display:none`이 **아님**을 단언(데드락 재발 차단).

### D-C. 형식 순서 + 기본값

- `FORMATS` 순서: `[영상, 사진, 티켓]` → **`[티켓, 사진, 영상]`**.
- 기본값: `useState<Template>("clip")` → **`useState<Template>("ticket")`**.
- `seenPreviewKinds` 초기값: `new Set([PREVIEW_KIND.clip])`(=`["photo"]`) → `new Set(["ticket"])`.
- 첫 진입 미리보기 = 티켓 카드(D-B 수정으로 정상 로드). 영상은 맨 끝.
- **테스트**: 기본 선택 단언(영상→티켓), 미리보기 기본 이미지(photo→ticket alt·template) 수정.

### D-D. 영상(MP4) 통일 레이아웃 (인트로 유지)

현재 `recap-clip/route.ts`의 `renderBeatPng` 분기:

```text
intro    → renderIntroFrame   (크림 + 그룹명, 타이틀 카드)
photo    → renderMontageFrame (사진 풀블리드 + from.with pill만)   ← 엔드카드와 다른 레이아웃
endcard  → renderPhotoCard    (사진 카드: 히어로 + 하단 데이터바)
```

**변경**: photo(몽타주) beat를 `renderMontageFrame(...)` 대신 **`renderPhotoCard({ ...data, heroUrl: <해당 beat 사진> })`** 로 렌더한다. 카드 프레임(그룹명·기간·`X DAYS`·`ROUTINE TRACE`·from.with·하단 데이터바)은 고정되고 **히어로 슬롯의 사진만 beat마다 바뀐다**.

```text
intro(0.4s, 유지) → 사진 카드(히어로=몽타주1) → 사진 카드(히어로=몽타주2) → … → 엔드카드(사진 카드)
```

- **인트로 유지**: 도입 0.4s 타이틀 카드는 그대로.
- **엔드카드**: `renderPhotoCard(data)` 유지하되 `data.heroUrl`은 D-E의 "내 사진" 픽을 쓴다(미리보기 카드와 동일 사진으로 영상이 끝남).
- **orphan 정리**: `renderMontageFrame`이 더는 안 쓰이면 `frames.tsx`에서 제거(내 변경이 만든 orphan 정리). `frames.tsx`는 `renderIntroFrame`만 남는다.
- **트레이드오프**: 사진이 풀블리드(100%) → 히어로 영역(상단 ~82%)로 살짝 크롭되고 하단 데이터바가 항상 보인다. 이것이 "동일 레이아웃" 느낌의 핵심.
- **비용**: 몽타주 beat가 단순 프레임 → 사진 카드(요소 多)로 바뀌어 프레임당 렌더가 소폭 무거워진다. beat 수(인트로+몽타주≤6+엔드카드=최대 8)는 그대로라 `maxDuration=60s` 내. 회귀 시 영상만 부분 롤백 가능.

### D-E. 공유물 랜덤 사진 + seed 일관성

**규칙**:

| 출력물         | 히어로/사진 선택                                                                             |
| -------------- | -------------------------------------------------------------------------------------------- |
| 사진·티켓 카드 | **내가 올린 사진** 중 랜덤. 0장이면 **챌린지 전체 사진** 중 랜덤. 전체도 0장이면 TERRA 단색. |
| 영상 몽타주    | **챌린지 전체 사진**의 랜덤 샘플(최대 `MAX_MONTAGE=6`).                                      |
| 영상 엔드카드  | 사진·티켓 카드와 **같은 "내 사진" 픽**(seed 동일) → 미리본 카드로 영상이 끝남.               |

**seed 일관성 (핵심)**: 미리보기 `<img>`와 실제 공유 `fetch`는 **별개 HTTP 요청**이다. 라우트가 요청마다 랜덤이면 미리보기 사진 ≠ 공유 파일 사진이 된다. 이를 막기 위해 **선택을 1회만 결정**한다.

- **seed 생성**: `recap/page.tsx`(동적 RSC — `requireUser`/`headers`로 이미 비캐시)가 요청당 1회 `seed`(정수)를 만든다. **왜 동적 안전**: 페이지가 정적 최적화되지 않으므로 방문마다 새 seed(= 재추첨). 클라이언트는 seed를 **prop**으로 받아 SSR/CSR 값이 일치(하이드레이션 불일치 없음).
- **전파**: `ShareCardAction(seed prop)` → 미리보기 `ogCardSrc(...&seed=)` + 공유 `fetch` URL(`og-card?...&seed=` · `recap-clip?...&seed=`) 모두에 `seed` 부착.
- **결정적 선택**: OG·clip 라우트가 `seed`를 읽어 결정적으로 고른다 → 같은 URL = 같은 사진 = **미리보기와 공유물 일치**. `max-age=300` 캐시도 URL(seed 포함) 단위라 정합.
- **seed 헬퍼**: `src/lib/share/seeded-pick.ts` 신설(순수 함수, 단위 테스트 용이).
  - `pickOne<T>(arr, seed): T` — 결정적 1개 선택.
  - `sample<T>(arr, n, seed): T[]` — 결정적 셔플 후 앞 n개.
  - 내부 RNG는 mulberry32 같은 작은 결정적 PRNG. **왜 결정적**: 같은 seed → 같은 결과여야 미리보기=공유물.
- **"내 사진" 데이터**: `src/lib/db/reads/challenge-photos.ts`의 `RecapPhotoView`에 `ownerId`(업로더 `action_logs.user_id`) 1필드 추가, select에 `user_id` 포함, `buildChallengePhotosView`가 매핑. **하위호환**(기존 소비자 `PhotoGallery`는 무영향). 라우트는 `photos.filter(p => p.ownerId === user.id)`로 내 사진을 가린다.
- **프라이버시**: "내 사진" 픽은 내 카드에 내 사진을 보이는 것이라 노출 증가 없음. 영상 몽타주의 전체 사진은 이미 그룹 공유 범위(RLS 그룹 멤버 한정). 새 노출면 없음.

## Impact Scope

### 변경 경로

- `src/app/(app)/challenge/[id]/recap/_components/settlement-receipt.tsx` — `groupId` prop 추가, ACCOUNT 블록에 `<AccountCopyButton>` 인라인.
- `src/app/(app)/challenge/[id]/recap/_components/account-copy-button.tsx` _(신규)_ — 텍스트 복사 버튼.
- `src/app/(app)/challenge/[id]/_components/use-copy-account-number.ts` _(신규)_ — 공용 복사 훅.
- `src/app/(app)/challenge/[id]/_components/account-info-sheet.tsx` — 복사 로직을 훅 호출로 교체(동작 불변).
- `src/app/(app)/challenge/[id]/recap/page.tsx` — `groupId`·`seed` 전달.
- `src/app/(app)/challenge/[id]/recap/_components/share-card-action.tsx` — `seed` prop, 형식 순서·기본값(D-C), 미리보기 opacity/스켈레톤(D-B), 공유 URL에 `seed`.
- `src/app/api/og/recap-card/route.tsx` — `seed`로 "내 사진" 픽(폴백 포함).
- `src/app/api/share/recap-clip/route.ts` — `seed`로 몽타주 샘플 + 엔드카드 "내 사진" 픽, 몽타주 beat를 `renderPhotoCard`로(D-D).
- `src/app/api/share/recap-clip/frames.tsx` — `renderMontageFrame` 제거(orphan).
- `src/lib/share/seeded-pick.ts` _(신규)_ — 결정적 pick/sample.
- `src/lib/db/reads/challenge-photos.ts` — `ownerId` 필드 추가.
- 테스트: `share-card-action.spec.tsx`(순서·기본값·seed·데드락 회귀), `account-info-sheet.spec.tsx`(훅화 후 통과 유지), `recap-card/route.spec.ts`(내 사진/폴백), `recap-clip/route.spec.ts`(몽타주 카드 레이아웃·샘플), `seeded-pick.spec.ts`(신규), `challenge-photos` mapper(ownerId), `account-copy-button` 신규 테스트.

### API / 데이터 / RLS / migration

- **마이그레이션·RLS·analytics 무변경**. `revealAccountNumber`/`account_copied`는 기존 자산 재사용(PRD §9.1 무변경). `challenge-photos.ts`는 select에 이미 RLS 허용된 `user_id` 컬럼 1개 추가일 뿐.
- **spec-required 경로 해당 없음**(validators·analytics/track·supabase/\*\*·middleware·keywords·ai·migrations 무변경).

### 외부 서비스

- 없음. OG·clip 자체 렌더만 사용.

## Verification

```bash
pnpm typecheck
pnpm lint
pnpm test          # 위 spec 들 갱신·신규 후 통과
pnpm build         # raw <img> lint · Next 16 client boundary 회귀
```

수동(모바일 뷰포트 / 실브라우저 — **B는 버그 수정이라 실브라우저 재현 필수**):

- **A**: 정산 영수증 ACCOUNT "계좌번호 복사" 탭 → 토스트 "계좌번호가 복사되었어요", 클립보드에 전체 번호. 비멤버/미등록 시 적절 토스트.
- **B**: 정산 진입 시 미리보기가 **즉시(스크롤 진입 시) 로드**되어 카드가 보인다. 느린 네트워크에서 크림 shimmer 스켈레톤 → 로드 후 카드. 로딩 중 `<img>`가 `display:none`이 아님(데드락 무재발). CLS 0.
- **C**: 카드 순서 `[티켓·사진·영상]`, 첫 진입 선택 = 티켓.
- **D**: 영상 다운로드/공유 → 인트로 후 **사진 카드 레이아웃에서 사진만 순환**, 엔드카드는 미리본 카드와 같은 사진.
- **E**: 새로고침마다 사진 바뀜. **같은 방문 안에서 미리보기 사진 = 공유/저장 파일 사진** 동일. 내 사진 0장이면 전체 사진, 전체 0장이면 단색.

## Alternatives Considered

- **A. 기존 계좌 시트 열기(2탭)**: `AccountInfoSheet`를 열어 복사. 재사용 100%지만 2탭. 사용자가 "바로 복사(1탭)"를 선택 → 훅 추출로 1탭.
- **E-random. 요청마다 true 랜덤**: 가장 단순하나 미리보기 ≠ 공유물. 패널 신뢰를 깨 비채택.
- **E-random. 뷰어별 고정(결정적 seed=hash(challenge+viewer))**: 플러밍 0·캐시 친화지만 "매번 다름" 아님. 사용자가 "방문마다 새로"를 선택 → page seed.
- **D. 몽타주 그대로(풀블리드) 두기**: 통일감 요구 미충족.
- **B. lazy 제거**: 데드락은 풀리나 비용 절약 의도(미스크롤 시 0 렌더)를 잃는다 → opacity 유지가 둘 다 충족.

## Rollout / Rollback

- 단일 브랜치(`feat/recap-share-preview-panel-impl` 연장 또는 후속 브랜치), base `develop`.
- 부분 롤백: A·B·C·D·E가 비교적 독립 → 문제 항목만 revert 가능(예: 영상 비용 이슈 시 D만, 랜덤 이슈 시 E만 되돌려 "최신 1장"으로 복원).

## Out of scope

- 미리보기 패널 인라인 영상 재생(poster + 배지 유지).
- OG/clip 미리보기 전용 축소 size 파라미터(후속 최적화).
- 모바일 OS 사진첩 직접 저장(웹 플랫폼 제약, 네이티브 전환 시 해소 — 부모 스펙 참조).
- `templates.tsx`·`frames.tsx`의 카드 **레이아웃·색 자체** 변경(히어로 사진 소스만 바뀜).

## 용어집

- **seed**: 같은 입력엔 같은 결과를 내는 난수 생성용 초기값. 여기선 "미리보기=공유물" 일치를 위해 페이지가 1회 정해 미리보기·공유 URL에 함께 싣는 정수.
- **결정적 PRNG**: 같은 seed면 같은 수열을 내는 의사난수 생성기(mulberry32 등). 미리보기와 공유물이 같은 사진을 고르게 보장.
- **데드락(여기서)**: `loading="lazy"` 이미지가 `display:none`이라 영영 로드되지 않는 교착. "보이면 로드 / 로드돼야 보임"의 순환.
- **OG (Open Graph)**: 공유용 이미지 규격. 여기선 `next/og`로 4:5 카드를 렌더하는 `/api/og/recap-card`.
- **몽타주(montage)**: 여러 사진을 짧게 이어 보여 주는 영상 구간.
- **엔드카드**: 영상 마지막 정지 요약 카드(= 사진 카드).
- **keep-alive**: 한 번 마운트한 컴포넌트를 숨기되 unmount 하지 않아 재요청을 막는 기법.
- **RLS (Row Level Security)**: Postgres 행 단위 접근 제어. `groups_select_member`가 비멤버의 계좌·사진 접근을 차단.
- **transient activation**: 사용자 제스처 직후 짧게 유지되는 권한 창. iOS Safari 클립보드 쓰기에 필요.
