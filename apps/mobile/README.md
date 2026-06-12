# @withkey/mobile

Expo Managed + CNG shell for the fromwith RN migration.

## Commands

```bash
pnpm --filter @withkey/mobile start
pnpm --filter @withkey/mobile typecheck
pnpm --filter @withkey/mobile lint
pnpm --filter @withkey/mobile test
pnpm --filter @withkey/mobile expo config --type public
```

`APP_VARIANT` controls native identifiers and link domains:

- `dev` -> `app.fromwith.dev`, `fromwith-dev`, `dev.fromwith.app`
- `staging` -> `app.fromwith.staging`, `fromwith-staging`, `staging.fromwith.app`
- `prod` -> `app.fromwith`, `fromwith`, `fromwith.app`

Generated `ios/` and `android/` directories are CNG output and must stay untracked.

## Invite deep link (EVAL-0013 · 04 §4 A7)

초대 링크는 https universal/app link(`https://<universalLinkDomain>/invite/<token>`) 포맷을 유지한다 — 카카오톡 공유 카드와 OG(Open Graph) 미리보기가 https URL 을 전제하기 때문.

설치 기기 흐름 (자동):

1. 링크 탭 → 앱이 `/invite/<token>` 으로 열림 (universal/app link, dev build 는 아래 scheme smoke 로 대체 가능)
2. 미인증이면 token 을 SecureStore 에 stash 후 `/login` 으로 이동
3. 세션 성립(Kakao SSO 또는 magic link) → `PostAuthRedirect` 가 stash 를 꺼내 `/invite/<token>` 복귀
4. `accept_invite` RPC 호출 → pending 서약서가 있으면 `/challenge/<id>/pledge` 착지

미설치 기기 흐름 (re-tap MVP, PO 확정 2026-06-11):

- 링크가 웹 PWA invite 랜딩으로 떨어짐 → 스토어에서 설치 → 카카오톡으로 돌아가 **같은 링크 재탭** → 앱 오픈 → 자동 수락
- Branch/Firebase 등 deferred linking SDK 는 도입하지 않는다 (post-MVP 재검토, 04 §4 A7)
- 웹 랜딩의 "설치 후 재탭" 안내 카피는 스토어 공개 시점에 추가한다 — 현재 dogfood 는 PWA 가 본 제품이고 스토어 링크가 없어 지금 노출하면 오안내

dev build smoke (시뮬레이터/실기기):

```bash
# scheme 직접 오픈 — universal link 도메인 검증 전에도 동작
npx uri-scheme open "fromwith-dev://invite/<token>" --ios
npx uri-scheme open "fromwith-dev://invite/<token>" --android
```

universal link 실링크 검증에는 `apps/web` 쪽 `/.well-known/apple-app-site-association` · `assetlinks.json` 호스팅과 `<universalLinkDomain>` DNS 연결이 선행돼야 한다 (인프라 미구성 — PO 액션).
