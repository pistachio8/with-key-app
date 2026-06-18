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

## iOS 실기기 dev build 세팅

`apps/mobile` 을 아이폰 실기기에서 돌리는 절차다. **처음 한 번만** 빌드해 기기에 설치하면, 이후 화면 코드 수정은 재빌드 없이 바로 반영된다.

### 왜 "dev client" 가 필요한가

이 앱은 Expo Go(Expo 가 만든 범용 테스트 앱)로 **못 돌린다**. Kakao 네이티브 SDK·`expo-secure-store`·`expo-image-picker` 같은 네이티브 모듈이 들어 있는데 Expo Go 엔 그 모듈이 없기 때문이다. 그래서 우리 네이티브 모듈까지 포함한 **전용 개발 빌드(dev client)** 를 직접 만들어 기기에 깐다. 한 번 깔면 JS(화면 로직)는 **Metro**(개발 서버, `pnpm --filter @withkey/mobile start`)가 실시간으로 공급한다 — JS 변경은 재빌드 불필요, 네이티브 의존성·`app.config.ts`·Kakao 키를 바꿀 때만 재빌드한다.

### 사전 준비

1. 의존성: 루트에서 `pnpm install`
2. env: `cp apps/mobile/.env.example apps/mobile/.env.local` 후 값 채우기
   - `EXPO_PUBLIC_SUPABASE_URL` · `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` — `apps/web` 의 `NEXT_PUBLIC_SUPABASE_*` 와 같은 공개값
   - `EXPO_PUBLIC_KAKAO_NATIVE_KEY` — 비우면 Kakao 로그인은 꺼지고 magic link 만 동작(처음엔 비워도 됨)
3. 기기: 설정 → 개인정보 보호 및 보안 → **개발자 모드(Developer Mode) ON** + 재시동 (iOS 16 이상 필수 — 보안상 개발용 앱 설치 전 명시적 허용)
4. Xcode → Settings → Accounts 에 Apple ID 로그인 (서명 인증서가 여기서 자동 생성된다)

### 빌드 → 설치 (Xcode 경로 권장)

> **왜 Xcode 로 하나**: 터미널 `expo run:ios --device` 는 최신 iOS 기기에서 설치 단계가 깨진다(아래 표 마지막 줄). Xcode 의 ▶ Run 은 Apple 공식 설치 도구(`devicectl`)를 써서 그 버그를 피한다.

1. `open apps/mobile/ios/<scheme>.xcworkspace`
2. TARGETS → Signing & Capabilities → **Automatically manage signing** 체크 + **Team** 을 본인 계정으로 선택
3. 상단 기기 드롭다운에서 실기기 선택 → **▶ Run**
4. 다른 터미널에서 Metro: `pnpm --filter @withkey/mobile start`
5. 기기 첫 실행 시 설정 → 일반 → VPN 및 기기 관리에서 개발자 앱 **신뢰**

### 자주 막히는 곳 (증상 → 원인 → 해결)

| 증상(에러 메시지)                                                                       | 원인                                                                                               | 해결                                                                                                                  |
| --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `No code signing certificates`                                                          | Xcode 에 Apple ID 미로그인                                                                         | Xcode → Settings → Accounts → `+` 로 계정 추가                                                                        |
| `Cannot create provisioning profile … do not support the Associated Domains capability` | **무료 Personal Team** 은 `applinks`(universal link) capability 미지원                             | dev 빌드에서 `associatedDomains` 제거 (아래 ※)                                                                        |
| `No profiles … <엉뚱한 팀 ID>`                                                          | pbxproj 의 `DEVELOPMENT_TEAM` 이 다른/유령 팀을 가리킴                                             | Signing 에서 Team 재선택. 안 먹으면 pbxproj 의 ID 를 `security find-identity -v -p codesigning` 의 실제 팀 ID 로 교체 |
| `Developer Mode disabled`                                                               | 기기 개발자 모드 OFF                                                                               | 위 사전 준비 3                                                                                                        |
| `Automatic signing is disabled … pass -allowProvisioningUpdates`                        | `expo run` CLI 가 profile 자동 생성 플래그를 안 붙임                                               | Xcode ▶ Run(또는 `xcodebuild … -allowProvisioningUpdates build`)으로 profile 을 한 번 생성하면 이후 재사용된다        |
| `TypeError: Cannot convert object to primitive value` (LockdowndClient)                 | **expo CLI 가 최신 iOS(예: 26) 기기와 통신 비호환** — 빌드·서명은 정상(`Installing …` 까지 진행됨) | Xcode ▶ Run, 또는 `xcrun devicectl device install app --device <udid> <빌드된 .app 경로>`                             |

> **※ 무료 Personal Team 의 Associated Domains 우회**
> 무료 Apple 계정(Personal Team)은 universal link capability 를 못 쓴다(게다가 `apple-app-site-association` 호스팅도 미구성이라 어차피 안 켜진다 — 위 Invite deep link 참조). dev 빌드만 임시로 빼면 된다:
>
> 1. `app.config.ts` 에서 **dev variant 만** `associatedDomains` 제외 (staging/prod 는 유지) — 로컬 임시이므로 **커밋하지 않는다**
> 2. `ios/<app>/<app>.entitlements` 에서 키 삭제:
>    `/usr/libexec/PlistBuddy -c "Delete :com.apple.developer.associated-domains" <entitlements 파일>`
>    (`plutil -remove` 는 키 이름의 점`.`을 중첩 경로로 오해해 실패한다)
>
> 유료 Apple Developer Program 팀이면 이 우회가 전부 불필요하고 universal link 도 정상 동작한다.

### 이후 개발 루프

dev client 가 한 번 깔리면 **Metro 만 켜면 된다**(`pnpm --filter @withkey/mobile start`). 화면 코드 수정 → 저장 → 기기에 자동 반영. 네이티브 의존성 · `app.config.ts` · Kakao 키를 바꿨을 때만 위 빌드 단계를 반복한다.
