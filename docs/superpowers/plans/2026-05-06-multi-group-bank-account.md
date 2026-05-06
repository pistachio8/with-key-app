# 멀티-그룹 + 계좌번호 기반 정산 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** v1 진입 직전 부채 2건을 **한 덩어리**로 해소한다. 2026-05-06 방향 전환 반영.

1. **멀티-그룹 UX 결손** — `groups` 스키마는 멀티 참여/생성이 가능하게 열려 있으나([0001_init.sql:18-36](../../../supabase/migrations/0001_init.sql#L18-L36)), 앱은 단일 그룹 전제로 굳어 있음. **그룹 생성 UI·Server Action 자체가 부재**하고(`grep createGroup` = 0건), [fetchActiveChallenge](../../../src/lib/db/reads/active-challenge.ts#L34-L48)가 `.limit(1)`로 첫 1건만 반환, DESIGN_FLOW 화면4의 "그룹 스트립"은 미구현.
2. **카카오페이 송금 링크 → 계좌번호 기반 정산으로 전환** — 카카오페이 송금 링크/QR 는 외부 API 정책·도메인 변경 리스크가 커서 POC 에서 **계좌번호 수동 복사** 방식으로 선회한다. D-009 는 **완전 반전(Reversed)** 으로 기록하고 신규 **D-016** 를 도입한다.
   - 그룹 오너가 `{ 은행, 계좌번호, 예금주 }` 를 입력한다.
   - DB 는 계좌번호를 **암호화(pgcrypto `pgp_sym_encrypt`)** 해서 저장한다.
   - 정산 화면은 **마스킹 표시**(`신한 ****-**-****789 · 홍길동`).
   - 멤버는 "계좌번호 복사" 버튼으로 평문 계좌번호를 클립보드에 복사한다(복사 API 는 definer RPC 로 복호화 후 반환).
   - 기존 카카오페이 링크 인프라(`buildKakaoPayLink`, `NEXT_PUBLIC_KAKAOPAY_SEND_URL`, `qrcode` 의존성)는 **제거** 한다.

**Architecture:**

- **DB 변경**: 신규 migration 1개 + 선결 과제로 `git reset --hard 1a1f911` 로 기존 0017 커밋 3건 제거 후 깨끗하게 다시 작성.
  - `0017_groups_bank_account_and_create_rpc.sql` (파일명 재사용)
    - **암호화 확장 없음** — 앱 레이어 AES-256-GCM 채택으로 pgcrypto 미사용.
    - `alter table groups add column bank_code text null check (char_length(bank_code) between 2 and 10)`
    - `alter table groups add column account_holder text null check (char_length(account_holder) between 1 and 30)`
    - `alter table groups add column account_number_encrypted bytea null`
    - `alter table groups add column account_number_last4 text null check (char_length(account_number_last4) = 4 and account_number_last4 ~ '^[0-9]{4}$')`
    - **제약 일관성**: 4 컬럼은 **모두 채워지거나 모두 비어 있어야 한다** — `CHECK ((bank_code is null and account_holder is null and account_number_encrypted is null and account_number_last4 is null) or (bank_code is not null and account_holder is not null and account_number_encrypted is not null and account_number_last4 is not null))`
    - **RPC `create_group_with_owner(p_name text, p_bank_code text, p_account_holder text, p_account_number_encrypted bytea, p_account_number_last4 text) returns uuid`** — SECURITY DEFINER. 인자로 **이미 앱에서 암호화된 bytea** 를 받음. 4 계좌 인자 중 하나라도 주어지면 4개 전부 required. `groups` insert + `group_members(role=owner)` insert 를 한 트랜잭션에서 처리 (0002_rls 가 group_members INSERT 를 service_role-only 로 막기 때문 — 기존 D-009 plan 의 definer 패턴과 동일).
    - **복호화 RPC 없음** — 읽기는 일반 SELECT + 앱에서 복호화. RLS `groups_select`(`is_group_member`) 가 비멤버 차단 담당.
    - `revoke all from public, anon` · `grant execute ... to authenticated, service_role`.

- **대칭키 관리 (앱 레이어 AES-256-GCM)**:
  - env: `ACCOUNT_ENCRYPTION_KEY` — base64 인코딩된 32바이트(256bit). Vercel Production/Preview/Development 각각 분리(키 로테이션 전까지 동일 값 OK).
  - 로컬: `.env.local` 에 개발용 키. `.env.example` 에 생성법 주석(`node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`).
  - 시작 체크: `scripts/check-env.ts` 의 REQUIRED 리스트에 추가 — 누락 시 `pnpm dev` 가 바로 실패하여 암호화 실패 연쇄 방지.
  - 암호문 포맷: **`iv(12) || ciphertext || authTag(16)`** 을 bytea 로 단일 컬럼 저장. 가변 길이 허용.
  - 키 로테이션: v1 이후. POC 는 단일 키 고정.
  - v1 이관 경로: 암호화 모듈의 `encryptAccountNumber` / `decryptAccountNumber` 시그니처만 유지하고 내부 구현을 KMS 호출로 교체 가능.

- **앱 변경**:
  - `src/lib/crypto/account-cipher.ts` (신규) — Node `crypto` 기반 AES-256-GCM.
    - `encryptAccountNumber(plain: string): Buffer` → `iv(12) || cipher || tag(16)` 반환.
    - `decryptAccountNumber(encrypted: Buffer): string`.
    - `loadKey()` 는 `ACCOUNT_ENCRYPTION_KEY` 를 base64 디코드. 길이 != 32 면 throw.
    - `server-only` import 로 클라이언트 번들 유입 차단.
  - `src/lib/bank/codes.ts` (신규) — 한국 주요 은행 `BANK_CODES` 배열 + 한글 이름 매핑 (KB국민, NH농협, 신한, 우리, IBK기업, 하나, SC제일, 카카오뱅크, 토스뱅크, 케이뱅크, 새마을금고, 우체국, 신협, 부산, 대구 등 12~15개). validator 는 `z.enum` 에 직접 사용.
  - `src/lib/bank/format.ts` (신규) — `maskAccountNumber(last4): string` (`****-**-****${last4}`), `formatAccountHolder(name): string` (trim).
  - `src/lib/validators/group.ts` — `kakaopaySendUrl` 제거 → `{ name, bankCode, accountHolder, accountNumber }` 로 교체. `accountNumber` 는 `z.string().regex(/^[0-9]{8,16}$/)` (숫자만). 3개 모두 선택이되 **3개 모두 제공 or 전부 미제공** 규칙을 `superRefine` 으로 강제.
  - `src/app/(app)/group/new/page.tsx` + `_actions.ts` — 4 필드 폼. `_actions.ts` 가 `accountNumber` plaintext → `encryptAccountNumber` → bytea 로 변환 후 RPC 에 bytea + last4 를 전달. **plaintext 는 RPC 에 절대 전달되지 않음**.
  - `/home` 리드 `fetchActiveChallenge` → `fetchCurrentChallenges(userId)` 로 교체. 반환 타입에 `bankCode | null · accountHolder | null · accountNumberLast4 | null`. **암호문 컬럼은 SELECT 화이트리스트에서 제외** (클라 번들 노출 방지).
  - `/home` 화면에 **그룹 스트립** + "새 그룹 만들기" CTA.
  - **정산 UI 교체**:
    - 기존 `SettlementSheet` 는 **삭제**. 대신 `AccountInfoSheet` 신설.
    - 서버에서 bank/holder/last4 를 받고 마스킹 표시. "계좌번호 복사" 버튼 클릭 시 Server Action `revealAccountNumber(groupId)` → 서버에서 `select account_number_encrypted from groups where id=?` (RLS `is_group_member` 체크) → 앱에서 `decryptAccountNumber` → 반환값을 클라이언트가 `navigator.clipboard.writeText`.
    - 복사 이벤트 analytics `account_copied { groupId }` 추가.
    - 계좌 미등록 그룹은 "오너가 아직 계좌를 등록하지 않았어요" 안내.
  - `src/lib/kakaopay/**` **전체 삭제** 및 env `NEXT_PUBLIC_KAKAOPAY_SEND_URL` 제거(`.env.example` · `scripts/check-env.ts`).
  - `qrcode` 의존성 제거(`package.json`, `pnpm-lock.yaml`).
  - `/challenge/new` 는 `?groupId=` 존속.

- **analytics**: `group_created` props 에 `hasKakaopayUrl` → `hasAccount: boolean` 로 치환. 신규 이벤트 `account_copied { groupId }`.

**보안 고려사항 (중요):**

- **암호화 경계**: 앱 레이어 AES-256-GCM (Node `crypto`). 암호화/복호화는 Next.js 서버 런타임(Server Action · RSC)에서만 실행. `account-cipher.ts` 는 `import "server-only"` 로 클라 번들 유입을 빌드 타임에 차단.
- **키와 DB 신뢰 경계 분리**: 키는 Vercel env (`ACCOUNT_ENCRYPTION_KEY`), 암호문은 Supabase DB. 한 쪽 덤프만 유출되어도 평문 복구 불가.
- **GCM authTag**: 변조 감지 내장. 복호화 실패 시 `DecipherError` 를 `upstream_error` 로 매핑하여 클라에 원인 미노출.
- **RLS 의존**: 암호문 SELECT 는 `groups_select`(`is_group_member`) 가 차단. definer RPC 미사용 → 노출면 최소. **단, `account_number_encrypted` 컬럼을 RSC 화이트리스트에서 빼 놓고 오직 `revealAccountNumber` action 만 select** — 우발적 클라 번들 유입 2차 방어.
- **로그 유출 방지**: 평문 계좌번호는 `console.log`, `track()`, 에러 메시지, Zod `flatten()` 출력에 절대 실리면 안 됨. validator 스펙에 "reject 메시지에 plaintext 미포함" 스냅샷 테스트 포함.
- **CSP**: `<img src="data:">` (QR) 제거 → CSP `img-src` 에서 `data:` 제거 가능하지만 **이 PR 스코프 밖**.
- **마스킹 규칙**: `****-**-****XXXX` (마지막 4자리). 은행별 자릿수 편차 상관 없이 고정 템플릿 사용.

**Non-Goals:**

- **실결제 API 연동** — D-009 반전이지 D-016 가 대체 — v1 이후.
- **계좌 소유 실명 인증** — 은행 ARS/오픈뱅킹 검증 없음. 오너가 입력한 예금주 이름은 UI 표시용일 뿐 검증하지 않는다.
- **키 로테이션 / 키 당 재암호화**: 단일 키 POC.
- **그룹별 N개 계좌 / 다통화**: v1 이후.
- **계좌 QR 코드 생성**(Toss/KakaoBank 딥링크): POC 밖.
- **그룹 해산/탈퇴, 오너 양도, 계좌 변경 이력**: v1 이후.
- **기존 멤버가 여러 그룹에 있을 때의 정렬/필터링 UI**: 이 plan 에서 "최신 active 우선" 단일 규칙만. 탭/검색은 별도 plan.

---

## File Structure

| 파일 | 책임 | 종류 |
| ---- | ---- | ---- |
| `supabase/migrations/0017_groups_bank_account_and_create_rpc.sql` | 계좌 컬럼 4개 · 묶음 CHECK · `create_group_with_owner(text, text, text, bytea, text)` RPC | Create (reset 후) |
| `src/types/supabase.ts` | `pnpm supabase gen types` 재생성 | Modify |
| `src/lib/crypto/account-cipher.ts` | AES-256-GCM `encryptAccountNumber` / `decryptAccountNumber` · `server-only` | Create |
| `src/lib/crypto/account-cipher.spec.ts` | 왕복 암·복호화 · authTag 변조 거부 · 잘못된 키 길이 거부 | Create |
| `src/lib/bank/codes.ts` | 한국 은행 코드 배열 + 한글 이름 매핑 | Create |
| `src/lib/bank/codes.spec.ts` | 매핑 완전성 테스트 | Create |
| `src/lib/bank/format.ts` | `maskAccountNumber`, `formatAccountHolder` | Create |
| `src/lib/bank/format.spec.ts` | 마스킹 포맷 테스트 | Create |
| `src/lib/validators/group.ts` | `{ name, bankCode, accountHolder, accountNumber }` 스키마 (묶음 optional) | Modify |
| `src/lib/validators/group.spec.ts` | 묶음 optional, regex, enum 검증 | Modify |
| `src/app/(app)/group/new/page.tsx` | 4필드 폼 · 계좌 3필드 묶음 선택 | Modify |
| `src/app/(app)/group/new/_actions.ts` | RPC `create_group_with_owner(p_name, p_bank_code, p_account_holder, p_account_number_plain)` 호출 | Modify |
| `src/app/(app)/group/new/_actions.spec.ts` | 묶음 optional, 허용/거부 케이스, 로그 유출 부재 | Modify |
| `src/lib/db/reads/current-challenges.ts` | 그룹별 최신 active + `{bankCode, accountHolder, accountNumberLast4}` | Modify |
| `tests/integration/reads/current-challenges.spec.ts` | RLS + last4 포함 확인 · 암호문 클라 노출 부재 | Create |
| `src/lib/db/reads/active-challenge.ts` | `@deprecated` · `fetchCurrentChallenges[0]` 재사용 | Modify |
| `src/app/(app)/home/page.tsx` | 그룹 스트립 · 새 그룹 CTA | Modify |
| `src/app/(app)/home/_components/group-strip.tsx` | 0/1/N 렌더 | Modify |
| `src/app/(app)/home/_components/group-strip.spec.tsx` | 0/1/N 렌더 | Modify |
| `src/app/(app)/challenge/[id]/page.tsx` | `challenge-detail` 에 계좌 필드 포함 → `AccountInfoTrigger` 에 전달 | Modify |
| `src/app/(app)/challenge/[id]/_components/account-info-trigger.tsx` | Client 경계 · sheet open state | Create |
| `src/app/(app)/challenge/[id]/_components/account-info-sheet.tsx` | 마스킹 표시 + "계좌번호 복사" 버튼 | Create |
| `src/app/(app)/challenge/[id]/_components/account-info-sheet.spec.tsx` | 마스킹 렌더 · 복사 액션 호출 · 계좌 없음 상태 | Create |
| `src/app/(app)/challenge/[id]/_actions.ts` | `revealAccountNumber(groupId)` Server Action — RLS select + 앱 복호화 · analytics | Create |
| `src/app/(app)/challenge/[id]/_actions.spec.ts` | 비멤버 → forbidden · 복호화 성공 · 암호문/평문 로그 유출 부재 | Create |
| `src/lib/db/reads/challenge-detail.ts` | 반환 타입에 `group: { bankCode, accountHolder, accountNumberLast4 }` 추가 | Modify |
| `src/app/(app)/challenge/[id]/_components/settlement-sheet.tsx` | **삭제** | Delete |
| `src/app/(app)/challenge/[id]/_components/settlement-sheet.spec.tsx` | **삭제** | Delete |
| `src/app/(app)/challenge/[id]/_components/settlement-trigger.tsx` | **삭제** (AccountInfoTrigger 로 대체) | Delete |
| `src/lib/kakaopay/link.ts` · `link.spec.ts` | **삭제** | Delete |
| `src/lib/analytics/schema.ts` · `track.ts` | `group_created.hasKakaopayUrl` 제거 · `hasAccount` 추가 · 신규 `account_copied` | Modify |
| `.env.example` · `scripts/check-env.ts` | `NEXT_PUBLIC_KAKAOPAY_SEND_URL` 제거 · `ACCOUNT_ENCRYPTION_KEY` 추가 (REQUIRED) | Modify |
| `package.json` · `pnpm-lock.yaml` | `qrcode` 제거 | Modify |
| `docs/TEAM_SHARE_DECISIONS.md` | **D-009 Reversed** (2026-05-06) · **D-016 (신규)**: 계좌번호 기반 정산 + pgcrypto | Modify |
| `docs/PRD.md` | §8.2 `groups` 컬럼 표 갱신 (bank_code, account_holder, account_number_encrypted, account_number_last4) · §11 정산 섹션 업데이트 · §14 Non-Goals 업데이트 | Modify |
| `docs/DESIGN_FLOW.md` | §2.2 화면 4 "그룹 스트립" · 정산 화면을 "계좌번호 복사" 로 교체 | Modify |

---

## 선결 과제 — 기존 커밋 롤백 (승인 완료 — 옵션 A)

- [ ] `git reset --hard 1a1f911` — 브랜치에 쌓인 카카오페이 전제 커밋 3건(`822c39e`, `d8d70c6`, `1f58f93`) 제거.
- [ ] `docs/superpowers/plans/2026-05-06-multi-group-kakaopay-link.md` 삭제 — 본 plan 파일이 대체.
- [ ] reset 후 untracked 로 남은 `docs/DESIGN_FLOW.md` 는 Task 7 에서 함께 다룬다(새 플랜 반영).

---

## Task 1: DB 스키마 (migration 0017 재작성)

- [ ] Step 1: `0017_groups_bank_account_and_create_rpc.sql` 작성
  - 컬럼 4개 추가: `bank_code`, `account_holder`, `account_number_encrypted bytea`, `account_number_last4` — 각 CHECK 포함
  - **묶음 CHECK** 제약: 4 컬럼이 모두 NULL 이거나 모두 NOT NULL
  - `create or replace function public.create_group_with_owner(p_name text, p_bank_code text, p_account_holder text, p_account_number_encrypted bytea, p_account_number_last4 text) returns uuid`
    - `auth.uid()` null 체크 → 42501
    - `p_name` 1~30 검증 → 22023
    - 계좌 4인자 중 하나라도 not null 이면 전부 required — 실패 시 22023
    - `insert into groups (owner_id, name, bank_code, account_holder, account_number_encrypted, account_number_last4) values (...)` → returning id
    - `insert into group_members (group_id, user_id, role) values (new_id, auth.uid(), 'owner')`
  - `revoke all from public, anon` · `grant execute to authenticated, service_role`
- [ ] Step 2: `supabase db reset` 후 psql 직접 검증:
  - 더미 bytea + last4 로 `create_group_with_owner` 호출 → 성공, `group_members` 자동 생성
  - anon 세션 호출 → 42501
  - last4 만 넣고 다른 계좌 필드 null → 22023
- [ ] Step 3: `pnpm supabase gen types` → `src/types/supabase.ts` 갱신
- [ ] Step 4: 커밋 — `feat(db): add encrypted bank account columns on groups + create_group_with_owner rpc`

## Task 2: 암호화 모듈 + bank codes + validator

- [ ] Step 1: `src/lib/crypto/account-cipher.ts`
  - `import "server-only"` 상단
  - `loadKey(): Buffer` — `process.env.ACCOUNT_ENCRYPTION_KEY` base64 → 32바이트 검증 후 Buffer 반환. 누락/길이 불일치 시 throw
  - `encryptAccountNumber(plain: string): Buffer` — `crypto.randomBytes(12)` iv + `createCipheriv('aes-256-gcm', key, iv)` + authTag. `iv || cipher || tag` 반환
  - `decryptAccountNumber(encrypted: Buffer): string` — 분해 → `createDecipheriv` + setAuthTag → 복호화. authTag 불일치 시 throw
- [ ] Step 2: `account-cipher.spec.ts`
  - beforeEach 에 테스트용 32바이트 키 env 주입
  - 왕복 검증 (`decrypt(encrypt(x)) === x`)
  - 같은 평문 암호화 2회 → 서로 다른 ciphertext (iv 랜덤성)
  - authTag 변조 bytea → throw
  - 키 길이 != 32 → `loadKey` throw
- [ ] Step 3: `src/lib/bank/codes.ts` — `BANK_CODES` 배열 (금융결제원 코드 기준 ~15개). `BANK_NAMES: Record<BankCode, string>`.
- [ ] Step 4: `src/lib/bank/codes.spec.ts` — 모든 코드 → 이름 매핑 존재 / 중복 없음 / `z.enum` 호환.
- [ ] Step 5: `src/lib/bank/format.ts` — `maskAccountNumber(last4): string` → `"****-**-****" + last4`. `formatAccountHolder(name): string` → trim.
- [ ] Step 6: `src/lib/bank/format.spec.ts` — 포맷 + 경계 케이스.
- [ ] Step 7: `src/lib/validators/group.ts` 갱신 — `name` optional · `bankCode` (`z.enum(BANK_CODES)`)/`accountHolder` (1~30)/`accountNumber` (`/^[0-9]{8,16}$/`) 묶음 optional · `superRefine` 으로 all-or-nothing. **reject message 에 입력 plaintext 포함 금지** — 테스트로 assert.
- [ ] Step 8: `group.spec.ts` 전면 재작성 — 빈 입력 허용 · 3값 중 1값만이면 reject · regex 거부 · 길이 경계 · reject message 에 입력 계좌번호 문자열 미포함.
- [ ] Step 9: `pnpm vitest run src/lib/crypto src/lib/bank src/lib/validators/group.spec.ts` → GREEN
- [ ] Step 10: 커밋 — `feat(bank): aes-gcm account cipher + validator + bank code catalog`

## Task 3: `createGroup` Server Action + `/group/new` 페이지

- [ ] Step 1: `_actions.spec.ts` RED
  - 유효 입력 (계좌 없음) → RPC bytea/last4 null 로 호출, `hasAccount=false`
  - 유효 입력 (계좌 포함) → RPC 에 bytea + last4 전달, `hasAccount=true`. **RPC 인자에 plaintext accountNumber 없음** assertion
  - 계좌 3값 중 일부만 제공 → `invalid_input`, RPC 미호출
  - regex 실패 → `invalid_input`
  - RPC 42501 → `forbidden`, 기타 → `upstream_error`
  - 에러 flatten 결과에 accountNumber plaintext 미포함
- [ ] Step 2: `_actions.ts` 구현
  - `withUser` + zod parse
  - 계좌 3값 존재 시 `encrypted = encryptAccountNumber(parsed.data.accountNumber)` + `last4 = parsed.data.accountNumber.slice(-4)`
  - `supabase.rpc('create_group_with_owner', { p_name, p_bank_code, p_account_holder, p_account_number_encrypted: encrypted, p_account_number_last4: last4 })` — **bytea 직렬화 경로 확인** (supabase-js 가 `Buffer` → `\x...` 포맷 자동 변환. 필요 시 `hexEncode(buffer)` 로 수동 변환)
  - 성공 시 `track({ name: 'group_created', props: { groupId: data, memberTarget: 4, hasAccount } }, { userId })`
- [ ] Step 3: `page.tsx` 재작성 — 4필드 폼. 계좌 3필드는 `<details>` 로 묶어 "(선택) 계좌 정보 등록". `<select>` 로 bank_code (BANK_NAMES 표시), `inputMode="numeric"` + `autocomplete="off"` 로 accountNumber, 숫자 외 문자 입력 즉시 strip 하는 `onChange` 헬퍼.
- [ ] Step 4: 제출 성공 → `router.push('/challenge/new?groupId=${data.id}')`.
- [ ] Step 5: `pnpm vitest run 'src/app/(app)/group/new/_actions.spec.ts'` → GREEN
- [ ] Step 6: 커밋 — `feat(group): /group/new with optional encrypted bank account`

## Task 4: BFF read 교체 + 홈 그룹 스트립

- [ ] Step 1: `fetchCurrentChallenges(userId)` — `groups.select('id, name, bank_code, account_holder, account_number_last4')` (**암호문 컬럼은 SELECT 안 함**). 반환 타입에 `bankCode | null · accountHolder | null · accountNumberLast4 | null`.
- [ ] Step 2: `tests/integration/reads/current-challenges.spec.ts` — (a) 유저 A 그룹의 챌린지는 유저 B 에게 보이지 않음, (b) 반환 객체에 `account_number_encrypted` 키가 없음(화이트리스트 select).
- [ ] Step 3: `fetchActiveChallenge` → deprecated alias. 계좌 필드는 이 함수에서 노출하지 않음.
- [ ] Step 4: `home/_components/group-strip.tsx` — 0/1/N 렌더. 카드에 마스킹 라벨 `"{은행명} ****-**-****{last4}"` (계좌 등록된 그룹만 미리보기로 노출할지 여부는 Step 5 에서 결정, 기본은 감추고 챌린지 상세에서만 노출).
- [ ] Step 5: `home/page.tsx` 교체 + 하단 "새 그룹 만들기" CTA 상시 노출.
- [ ] Step 6: `pnpm vitest run src/app/\(app\)/home/_components/group-strip.spec.tsx` + `pnpm vitest run --project integration tests/integration/reads/current-challenges.spec.ts` → GREEN
- [ ] Step 7: 커밋 — `feat(home): render group strip with multi-group support`

## Task 5: AccountInfoSheet — 계좌번호 복사

- [ ] Step 1: `challenge/[id]/page.tsx` — `fetchChallengeDetail` 반환에 `group: { id, bankCode, accountHolder, accountNumberLast4 }` 포함. **암호문 컬럼은 select 하지 않음**.
- [ ] Step 2: `AccountInfoTrigger` (Client) — 버튼 + `AccountInfoSheet` open state.
- [ ] Step 3: `AccountInfoSheet` (Client):
  - 계좌 등록: `"{bank_name} · {holder}"` + `"****-**-****{last4}"` + "계좌번호 복사" 버튼
  - 계좌 미등록: 안내 문구 + 복사 버튼 disabled
- [ ] Step 4: `_actions.ts` — `revealAccountNumber({ groupId })` Server Action
  - `withUser` + uuid 검증
  - `supabase.from('groups').select('account_number_encrypted').eq('id', groupId).maybeSingle()` — RLS 가 비멤버 차단
  - 결과가 null 또는 암호문 null → `failure('not_found')`
  - `decryptAccountNumber(Buffer.from(bytea))` → `success({ accountNumber })`
  - 복호화 throw → `upstream_error` (원인 로그는 서버 전용, 평문/암호문 비포함)
  - `track({ name: 'account_copied', props: { groupId } })` — plaintext 금지
- [ ] Step 5: `_actions.spec.ts` — RLS 비멤버 시뮬레이션(`maybeSingle` 이 null 반환) → `not_found` · 성공 시 복호화 값 반환 · 복호화 실패 시 `upstream_error` · 로그 mock 캡처에 plaintext 미포함
- [ ] Step 6: `account-info-sheet.spec.tsx`
  - 마스킹 렌더 (`****-**-****1234` 텍스트 존재)
  - 복사 버튼 클릭 → action mock 반환값이 `navigator.clipboard.writeText` 에 그대로 전달
  - 토스트 "계좌번호가 복사되었어요"
  - 계좌 미등록 상태에서 버튼 disabled
- [ ] Step 7: 기존 `settlement-sheet.tsx` / `settlement-trigger.tsx` / 스펙 삭제. `page.tsx` import 교체.
- [ ] Step 8: `pnpm vitest run` 전체 → GREEN
- [ ] Step 9: 커밋 — `feat(settlement): copy encrypted bank account instead of kakaopay link`

## Task 6: 레거시 정리

- [ ] Step 1: `src/lib/kakaopay/**` · `src/app/(app)/challenge/[id]/_components/settlement-*` 삭제 확인 (Task 5 에서 이미 삭제했으면 skip).
- [ ] Step 2: `qrcode` 의존성 제거 — `pnpm remove qrcode @types/qrcode` (있으면).
- [ ] Step 3: `.env.example` 갱신
  - `NEXT_PUBLIC_KAKAOPAY_SEND_URL` 제거
  - `ACCOUNT_ENCRYPTION_KEY=` 추가 + 주석으로 생성 커맨드 (`node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`) 및 "로컬/Preview/Production 별도 키 권장" 문구
- [ ] Step 4: `scripts/check-env.ts` REQUIRED 에 `ACCOUNT_ENCRYPTION_KEY` 추가.
- [ ] Step 5: `src/lib/analytics/schema.ts` · `track.ts`
  - `group_created.hasKakaopayUrl` → `hasAccount: boolean`
  - 신규 `account_copied` 이벤트 `{ groupId: uuid }`
  - `schema-union-parity.spec.ts` 픽스쳐 업데이트
- [ ] Step 6: `pnpm tsc --noEmit --pretty false` + `pnpm eslint .` — dead import / 미사용 심볼 제거.
- [ ] Step 7: 커밋 — `chore: remove kakaopay link infra and qrcode dependency`

## Task 7: 문서 & 의사결정 업데이트

- [ ] Step 1: `docs/TEAM_SHARE_DECISIONS.md`
  - D-009 상태 → **❌ Reversed (2026-05-06)**. 이유 한 줄: 카카오페이 송금 링크 API 정책/도메인 변경 리스크로 POC 검증 안정성 저하. 교체안은 D-016 참조.
  - **D-016 신설** — "계좌번호 수기 입력 + 앱 레이어 AES-256-GCM 암호화":
    - 맥락: 카카오페이 송금 링크 API 정책 리스크 → D-009 Reversed.
    - 옵션: A) 송금 링크(D-009), B) 오픈뱅킹/ARS 실명 검증, C) **오너 수기 입력 + AES-256-GCM (채택)**, D) pgcrypto `pgp_sym_encrypt` + DB GUC 키.
    - 근거: POC 가설("정산 액션이 발생하는가") 검증에 외부 API 의존 제거. 앱 레이어 AES-GCM 으로 **키와 DB 를 서로 다른 신뢰 경계에 배치** (D 안 대비 우위). Node 표준 crypto → 의존성 추가 없음. v1 KMS 이관 시 `account-cipher` 모듈 구현만 교체.
    - 영향: `groups` 스키마 4컬럼, `create_group_with_owner` definer RPC (암호문 bytea 를 인자로 받음), `AccountInfoSheet`, `ACCOUNT_ENCRYPTION_KEY` env.
    - 되돌릴 조건: 실결제 API 운영 여력 확보 시 실결제 플로우로 이관. 또는 KMS 전환.
    - 되돌리기 비용: 중간 — migration + AccountInfoSheet + account-cipher 모듈.
- [ ] Step 2: `docs/PRD.md`
  - §8.2 `groups` 표 — `kakaopay_send_url` 제거 · `bank_code`, `account_holder`, `account_number_encrypted`, `account_number_last4` 추가 · 묶음 CHECK 각주 1줄.
  - §11 정산 섹션 — "카카오페이 QR/링크" → "계좌번호 복사". 화면 기획에 마스킹 규칙 명기.
  - §14 Non-Goals 갱신.
  - Changelog 2026-05-06 항목 추가.
- [ ] Step 3: `docs/DESIGN_FLOW.md` — §2.2 화면 4 에 "그룹 스트립 (0~N)" · §2.2 정산 섹션에 "AccountInfoSheet: 마스킹 + 복사".
- [ ] Step 4: 커밋 — `docs: reverse D-009 and introduce D-016 (encrypted bank account settlement)`

## Task 8: 최종 검증 + PR

- [ ] `pnpm tsc --noEmit --pretty false`
- [ ] `pnpm eslint .`
- [ ] `pnpm vitest run --project unit`
- [ ] `pnpm vitest run --project integration`
- [ ] `pnpm build`
- [ ] 수동 smoke — 그룹 2개 생성(A=계좌 등록, B=미등록) → 홈 스트립 둘 다 노출 → A 의 챌린지에서 복사 → 복사 결과가 평문 계좌번호와 일치 → B 는 복사 비활성. 비멤버 세션은 같은 그룹 상세 진입 불가(RLS).
- [ ] `gh pr create --base develop` (한국어 body):
  - Summary: 멀티 그룹 UX 완성 + 카카오페이 링크를 **계좌번호 암호화 저장 + 마스킹 + 복사** 로 교체. D-009 Reversed, D-016 신설.
  - Test plan:
    - [ ] 그룹 2개 생성 후 홈 스트립 둘 다 노출
    - [ ] 그룹 A 계좌 등록 후 마스킹(`****-**-****1234`) 노출
    - [ ] 복사 버튼 클릭 시 클립보드 값이 평문 계좌번호와 일치(자동 테스트)
    - [ ] 비멤버 계정으로 `reveal_group_account` RPC 직접 호출 시 42501
    - [ ] 계좌 미등록 그룹은 복사 버튼 disabled
    - [ ] `pnpm build` 통과

---

## Self-Review

- **D-009 명시적 Reversed**: 기존 카카오페이 인프라 흔적은 코드/env/의존성 전부 제거. DECISIONS 에 반전 기록으로 "왜 되돌렸는가" 고정.
- **암호화 경계**: 평문 계좌번호는 (a) `/group/new` 의 Server Action 에서 `encryptAccountNumber` 호출 시점, (b) `revealAccountNumber` 의 `decryptAccountNumber` 호출 시점, 이 두 서버 포인트에서만 메모리에 존재. DB 는 항상 암호문. 클라이언트는 평문을 **복사 버튼 클릭 결과로만** 받아 즉시 `clipboard.writeText` → 메모리에서 이탈.
- **server-only import**: `account-cipher.ts` 가 `import "server-only"` 를 포함하여 클라 번들로 유입 시 빌드 타임 에러. 복호화 모듈이 새어나가는 사고 방지.
- **RLS 의존 (definer 미사용)**: 암호문 SELECT 는 기존 `groups_select`(`is_group_member`) 로 차단. definer RPC 는 `create_group_with_owner` 하나만 — `group_members` INSERT 제약 때문에 반드시 필요하기 때문. 복호화 경로에는 definer 미사용 → 노출면 최소.
- **SELECT 화이트리스트**: `fetchCurrentChallenges`, `fetchChallengeDetail` 은 `account_number_encrypted` 컬럼을 **절대 select 하지 않음**. 오직 `revealAccountNumber` action 만 select. 우발적 클라 번들 유입 2차 방어.
- **묶음 CHECK**: 4컬럼 동시 NULL / 동시 NOT-NULL — "last4 만 채워지는" 부분 상태 불가능. app-level validator 도 `superRefine` 으로 동일 규칙.
- **키 관리 리스크**: `ACCOUNT_ENCRYPTION_KEY` 가 Vercel env 에 평문 저장. Vercel compromise 시 노출. POC 한정 수용. v1 에서 KMS(AWS KMS / Supabase Vault) 이관 시 `account-cipher` 모듈 내부만 교체.
- **Fallback 경로 없음**: kakaopay env 폴백 완전 제거. 정산 UX 는 `AccountInfoSheet` 하나.
- **호환성**: 브랜치에 쌓인 카카오페이 커밋 3건은 `git reset --hard 1a1f911` 로 제거 (선결 과제 승인 완료). develop 에는 아직 관련 코드 없음.
- **파일 수**: 신규 ~12개 · 수정 ~14개 · 삭제 5개 · Migration 1개. 리스크 최대 지점은 Task 2 (account-cipher bytea 포맷) + Task 5 (Buffer → bytea 직렬화 via supabase-js + 클라 클립보드). Task 순서 준수 필수.
