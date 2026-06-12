# Drift Report — EVAL-0013 G4 Invite deep link PoC

- Task: **EVAL-0013** (Track: port · Kind: migration)
- Branch: `feat/rn-invite-deep-link`
- Date: 2026-06-11
- Trigger: 04 §4 A7 실행 — invite deep link 착지(`/invite/[token]`)를 placeholder 에서 수락
  orchestration SoT 로 승격. 미인증 token stash(SecureStore) → 로그인 → `accept_invite`
  client RPC → pledge 착지. 미설치는 re-tap MVP(PO 확정 2026-06-11) 문서화.

## Harness Impact Questions — 답변

1. **New folder structure? YES** — `src/features/invite/{api,components}/` 슬라이스 신설(04 §5.1
   lazy 생성 원칙). `capabilities/deep-linking/` 은 **만들지 않음** — URL→route 매핑은 Expo Router
   가 전담하고 별도 Linking 구독이 없어 wrapper 가 빈 추상화가 된다. Branch 교체 필요 시점에
   인터페이스(04 §5.1 계약)와 함께 도입한다.
2. **New naming convention? YES(경미)** — 세션 성립 후 착지 분기 컴포넌트 `PostAuthRedirect`
   (features/invite 공개 API). login·auth/callback 의 "/home 하드코딩 착지"를 이 컴포넌트로
   일원화 — 이후 post-auth 분기(예: 온보딩)는 여기에 추가.
3. **New dependency? NO** — 추가 SDK 0 (Branch/Firebase DL 금지 준수). expo-secure-store 재사용.
4. **Verification commands changed? NO** — `pnpm --filter @withkey/mobile test -- invite` 가
   AT 에 이미 있던 명령 그대로 활성화(신규 spec 3개 매칭).
5. **Harness outdated? NO** — 단, AT 의 "manual/dev-build" 검증(scheme/universal link 실기기
   smoke)은 외부 선행(아래 미해결)이 필요해 코드 머지와 분리.
6. **`.agents/` update? NO(불요)** — 하네스 머시너리 변경 없음.

## 구현 무결성

- `accept_invite` RPC semantics(0028) 무변경 소비: P0002→invalid_or_expired,
  42501 'group full'→group_full, already-joined→성공(idempotent insert). token 본문 로그 금지.
- stash 는 1회성(take 시 삭제) — 실패 token 이 로그인마다 재시도 루프를 만들지 않게.
  keystore 예외는 "보관 없음" 으로 흡수(재탭 복구 가능).
- analytics: RN 에서 emit 0건 — `track.ts` 는 service-role insert 라 RN 직접 호출 금지(04 §5).
  `invite_opened` 의 RN emit 은 events BFF/RLS-safe helper 착지 후(별도 task). PRD §9.1 외
  임의 이벤트 추가 없음.
- web invite PWA fallback 무변경(Non-goal 준수). 웹 랜딩 "설치 후 재탭" 안내 카피는 스토어
  공개 시점으로 이연 — 현 dogfood 는 PWA 가 본 제품이라 지금 노출 시 오안내
  (apps/mobile/README.md §Invite deep link 에 박제).

## 미해결 (PO/인프라 액션)

- universal link 실링크 검증: `apps/web` 의 `/.well-known/apple-app-site-association` ·
  `assetlinks.json` 호스팅 + `dev.fromwith.app` 등 도메인 연결 미구성. dev build smoke 는
  scheme(`fromwith-dev://invite/<token>`)으로 가능(AC 의 "또는 scheme" 경로).
- 실기기 dev build smoke(설치 링크·unauth stash·auth accept·re-tap)는 수동 — 통과 위조 금지
  원칙에 따라 미실행으로 보고.
