# ADR-0008-kakao-oauth-introduction: Kakao OAuth Introduction

**Date**: 2026-05-18
**Status**: proposed
**Deciders**: pistachio8

## Context

with-key 의 1차 진입 경로는 카카오톡 단톡방에서 공유된 invite 링크다(PRD §11.1 민지 시퀀스). 카카오톡·인스타그램·페이스북·네이버앱의 **인앱브라우저는 매직링크 callback 의 세션 쿠키를 유지하지 못한다** — 매직링크는 메일앱(또는 외부 브라우저)에서 클릭한 뒤 인앱뷰로 돌아오면 쿠키 도메인/SameSite 정책 차이로 세션이 깨진다(ADR-0007 의 `token_hash` flow 가 PKCE verifier 쿠키 의존을 줄였지만, 인앱뷰 ↔ 메일앱 컨텍스트 전환의 근본 제약은 남는다).

매직링크는 동작은 하지만 인앱뷰 사용자 비율이 높을 것으로 예상되는 dogfood 첫 단계에서 가입 conversion 을 직접적으로 떨어뜨린다. POC 일정 안에 인앱뷰 호환 1차 경로가 필요하다.

PRD §3.3 AC-3 는 이미 "카카오 로그인 or 이메일 매직링크" 두 경로를 모두 인정하며, PRD §13 의존성 표가 "카카오 로그인 OAuth 앱 등록 3~5일 / 매직링크 병행" 을 명시한다. BE_SCHEMA §5.1 도 단일 provider(kakao) 가정으로 `users.auth_provider` 컬럼을 제외했고, `auth.users.identities` 를 SoT 로 잡았다.

## Decision

**카카오 OAuth 를 1차 로그인 경로로 도입한다.** 구체:

- Supabase Auth Provider(Kakao) 를 enable 하고 `supabase.auth.signInWithOAuth({ provider: 'kakao' })` 로 로그인을 시작한다. RLS 백본의 `auth.uid()` 일관성을 위해 자체 OAuth 핸들러를 만들지 않는다.
- 매직링크 로직(`requestMagicLink` server action · `/auth/callback` 의 `token_hash` flow · legacy PKCE `code` flow)은 **코드로 남긴다**. UI 진입점만 환경변수 `NEXT_PUBLIC_ENABLE_MAGIC_LINK`(기본 `false`)로 숨긴다 — Vercel Env 토글로 즉시 fallback 복구 가능.
- 카카오의 이메일 동의는 **선택 동의**로 운영한다(비즈 앱 검수 없이 도입). `handle_new_auth_user()` 트리거는 `raw_user_meta_data->>'name' → nickname → email-local-part → '사용자'` 폴백으로 NULL-safe 화 한다(migration 0027). 함수 시그니처는 0001_init.sql 과 동일하게 유지해 trigger 재바인딩 없이 본문만 교체한다.
- **OAuth scope**: `signInWithOAuth` 에 `scopes: "profile_nickname profile_image"` 명시 — 카카오 콘솔 동의항목(닉네임 필수 · 이미지 선택)과 1:1 정렬. Supabase default scopes 가 `account_email` 을 포함하므로 명시적 scope 지정으로 배제한다(개인 개발자 앱은 이메일 동의항목 등록 불가).
- `/auth/callback` 은 `next=/invite/{token}` 패턴을 감지하면 `accept_invite` RPC 를 자동 호출하고, 결과 group 의 pending challenge 유무에 따라 `/challenge/{cid}/pledge` 또는 `/group/{groupId}` 로 redirect 한다. 한 번의 카카오 탭으로 가입까지 완결되도록 한다.
- **provider 판정은 `user.app_metadata.provider` 직접 사용** — `code` flow 가 OAuth 와 매직링크 legacy PKCE 둘 다에 쓰이므로 flow 추정으로 분기하면 오판정. 세션 성립 후 Supabase 가 채운 metadata 가 SoT.
- **분석 이벤트 일관성**: callback 자동가입 경로에서도 `invite_opened` · `user_signed_up`(휴리스틱: `created_at < 1분 + onboarded_at IS NULL`) emit. AcceptForm 의 기존 수동 경로와 양방 동일.
- **가입 cushion**: callback 이 redirect 시 `?welcome={groupName}` query 부착. pledge/group page 가 첫 paint 시 inline 환영 배너 렌더 → 카카오 동의 직후 갑작스러운 서약서 화면 진입의 context shift 완화. 신규 라우트는 추가하지 않는다.
- 인앱뷰(카카오톡·인스타·페북·네이버·라인) 진입은 `/invite/[token]` · `/login` 두 페이지에서 **server-side `headers().get('user-agent')`** 로 SSR 단계 분기 + 클라이언트 hydration fallback. 가드 컴포넌트는 **앱별 메뉴 안내 카피 분기** (kakaotalk/instagram/naver/facebook/line/other) 와 Android intent + 메뉴 안내 동시 노출(intent 차단 fallback) + iOS 링크 복사 + Safari 붙여넣기 안내를 한 화면에 둔다.
- **가드 wrap 범위**: AcceptForm 의 `isAuthed=false` 분기와 login 페이지의 로그인 방법 선택 section 에만 적용. 이미 로그인된 사용자(`isAuthed=true`) 와 pending 상태에는 가드 미적용.
- **가드 외부 열기 target URL 은 invite 페이지 자체**. `/login` 직행은 1탭 절감이지만 OG 미리보기·챌린지 카드 컨텍스트 손실 — 가입 동기 cushion 우선.
- **기존 로그인 유저의 invite 직접 진입은 1탭 confirmation 유지**. 사용자 시퀀스의 "바로" 와 의도된 deviation — 가드레일 §"useEffect 자동 mutation 금지" 정합 + 가입 의도 확인.

신규 라우트는 추가하지 않는다. 기존 라우트(`/invite/[token]` · `/login` · `/auth/callback` · `/challenge/[id]/pledge` · `/group/[id]`) 와 `AcceptForm` 의 pending state(§5-B 전환 화면)를 그대로 재사용한다.

## Alternatives Considered

### 1. 자체 OAuth 라우트 + Supabase admin 으로 user 매핑

- **Pros**: 카카오 응답 가공·로깅을 우리가 100% 통제. provider-specific 커스터마이징 자유.
- **Cons**: Supabase 세션 쿠키와 별개의 토큰 흐름을 만들어야 하고, RLS 의 `auth.uid()` 정합성이 깨진다. `auth.users.identities` 자동 채움 이점도 잃는다. 모든 RLS 정책 재검증 비용 발생.
- **Why not**: ADR-0007 에서 Supabase SSR 쿠키 일관성을 의도적으로 채택했는데 정면 충돌. POC 범위에서 RLS 백본 우회는 위험이 너무 크다.

### 2. Kakao JS SDK 로 클라이언트 로그인 + 서버 토큰 검증

- **Pros**: 카카오톡 단톡방에서 카카오 앱 deep link 로 자연 전환 가능(웹 OAuth redirect 없이).
- **Cons**: 인앱뷰에서 Kakao JS SDK 자체가 차단되는 사례 존재. SDK ↔ Supabase 세션 동기화 코드를 별도로 작성해야 함. 코드 표면 증가.
- **Why not**: 인앱뷰 호환성을 노렸지만 실제 호환이 보장되지 않고 표면 증가. Supabase OAuth provider 방식이 카카오톡 인앱뷰 호환성 면에서 동등하거나 우월(인앱뷰 가드로 외부 브라우저 전환 후 OAuth).

### 3. 매직링크 코드 완전 제거

- **Pros**: 단일 경로로 단순화. 운영 변수 감소.
- **Cons**: 카카오 OAuth 운영 사고(예: 카카오 OAuth 서비스 장애·검수 issue·Client Secret rotation 실수) 시 fallback 부재. POC dogfood 중 인증 전체 불가.
- **Why not**: POC 안정성 비용 ↑. 코드 유지 비용(매직링크 = ~150줄)이 fallback 가치 대비 미미. 사용자도 명시적으로 "매직링크 로직은 없애지 말라" 요청.

### 4. 신규 라우트 추가 (`/invite/[token]/joining` · `/groups/[id]/welcome` · `/groups/[id]/certify`)

- **Pros**: 사용자 시퀀스 명시성. URL 별 책임 분리.
- **Cons**: 가드레일 §아키텍처(route colocation · `src/features/` 신설 금지) 와 정합 어려움. 화면 수 증가, transition 자체가 1초 미만이라 URL 노출 효익 적음. PRD §10 인벤토리(화면 11개) 와 어긋남.
- **Why not**: AcceptForm pending state + `/challenge/[id]/pledge` 의 `?welcome` cushion 배너가 동일 UX 를 충족. 가드레일 "단순함 우선" 과 정합.

### 5. 기존 로그인 유저 invite 진입 시 자동 가입(useEffect server action 트리거)

- **Pros**: 사용자 시퀀스 "바로 그룹 가입/이동" 충실 — 1탭 절감.
- **Cons**: client mount 시 자동 mutation 트리거 패턴이 가드레일 §"useEffect + fetch 쓰기 경로 금지" 의 spirit 위반. 새로고침/뒤로가기 시 race 위험. 의도 없는 클릭(잘못 공유받은 링크)의 자동 가입.
- **Why not**: confirmation 1탭의 신뢰 비용 vs 자동 가입의 의외성 비용 — POC dogfood 단계에서 후자가 더 크다고 판단.

### 6. provider 판정을 `code` vs `token_hash` flow 로 휴리스틱

- **Pros**: 추가 메타데이터 조회 없이 callback 진입 시점에 즉시 판정.
- **Cons**: `code` flow 가 OAuth 와 매직링크 legacy PKCE 둘 다에 사용 (ADR-0007 token_hash 도입 이후로도 legacy ConfirmationURL 호환을 위해 남김). 매직링크 legacy 클릭을 카카오로 오판정.
- **Why not**: `user.app_metadata.provider` 가 Supabase 표준 SoT 이고 추가 비용 없음. 휴리스틱 회피.

## Consequences

### 긍정적

- 인앱뷰 사용자 가입 conversion 회복(예상): 매직링크 ↔ 인앱뷰 세션 단절 우회.
- 한 번의 카카오 탭으로 invite → 그룹 가입 → pledge 까지 완결 — PRD §11.1 happy path 와 정합.
- Supabase Auth 의 `auth.users.identities` 자동 관리 — provider 추적 SoT 가 BE_SCHEMA §5.1 결정과 일치.
- 매직링크 fallback 가능(env 토글만으로 즉시 복귀) — 운영 사고 대응 시간 분 단위.
- `user_signed_up` · `invite_opened` 이벤트가 처음으로 callback 자동 경로에서도 수집 — PRD §9.1 미충족 상태 해소.
- 가입 cushion(`?welcome`) 으로 카카오 동의 직후 context shift 완화. 신규 라우트 추가 없이 사용자 시퀀스 step 7 충족.
- 인앱뷰 가드의 앱별 메뉴 안내 + intent/메뉴 동시 노출로 가드 정체 위험 감소.

### 부정적 / 비용

- 카카오 개발자 콘솔 + Supabase Auth Providers + Vercel Env 3개 외부 설정 동기화 책임. 운영 체크리스트(plan 참조) 누락 시 dev/preview/production 인증 깨짐.
- 카카오 사이트 도메인 wildcard 미지원 — Vercel preview 의 카카오톡 공유 카드 검증 경로에 잠재적 회귀 가능성.
- 인앱뷰 가드 UA 패턴 유지보수 — 카카오톡/인스타/페북/네이버/라인 UA 변경 시 회귀 risk. 매년 1~2회 점검 필요. detection 미스 시 가드 없이 카카오 OAuth 실패 — V1 에서 callback 실패 graceful fallback 별도 도입.
- 휴리스틱 emit (`created_at < 1분`) 시계 의존 — V1 진입 시 partial unique index 로 정확화 필요.
- welcome 배너 query 의 외부 공유 케이스 — URL 노출 시 배너 반복. POC 허용, V1 sessionStorage flag 검토.
- 카카오 이메일 선택 동의 — 향후 transactional 이메일 통보 경로가 필요해지면 비즈 앱 검수 별도 트랙으로 진행.
- 기존 로그인 유저의 1탭 confirmation — 사용자 시퀀스 "바로" 와 의도된 deviation.
- 가드 외부 열기 후 invite 페이지에서 한 번 더 탭 — 외부 브라우저에서 invite 컨텍스트 보존을 위한 의도된 cushion.

### 후속 영향

- **migration 0027**: `handle_new_auth_user()` 트리거 본문 변경. 단방향(POC 정책). 함수 시그니처 보존으로 trigger 재바인딩 불필요.
- **callback 책임 확장**: `/auth/callback` 이 인증 + invite 자동가입 + signed_up/invite_opened emit + welcome cushion 까지 — 책임 확장에 동의. 별도 `src/lib/auth/callback-handlers.ts` 로 추출은 POC 이후 검토.
- **PRD §9.1 분석 이벤트**: schema 자체는 미변경(`provider` enum 에 이미 `kakao|email` 존재), emit 호출 신설. spec 작성은 옵션.
- **pledge·group page 의 welcome 배너 inline**: 신규 컴포넌트 아닌 inline JSX (가드레일 §단순함). 1회성 query 기반 — V1 에서 sessionStorage 1회 제한 도입 검토.
- **사용자 시퀀스 step 8 (첫 인증 유도)**: 챌린지 active 이후에만 가능. 본 PR 변경 범위 외 — 기존 푸시 알림 경로(서명 완료 → active → 시작 푸시 → action 진입) 그대로.
- **AGENTS.md §4 spec-required 표**: `supabase/migrations/**` 변경 → 본 ADR 가 충족.
- **V1 후속**: events 테이블 partial unique index, callback 실패 graceful fallback, welcome 배너 sessionStorage 1회 제한, 다른 OAuth provider(Apple 등) 도입 시 본 ADR 패턴 재사용.
