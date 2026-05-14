# 매직링크 Rate Limit 해소 설계 — E2E 분리 + Resend SMTP

| 항목 | 값 |
|---|---|
| 날짜 | 2026-05-12 |
| 작성자 | ian (pistachio8) |
| 상태 | **Track A 미착수 · Track B 완료** |
| 영역 | 인증 인프라(`src/lib/supabase`, `src/app/(auth)/login`), CI(`.github/workflows/ci.yml`) |
| 참고 | [PRD §5.1 회원가입·로그인](../../PRD.md) · [BE_SCHEMA §users](../../BE_SCHEMA.md) · [QUALITY_GATE](../../QUALITY_GATE.md) |

이 문서는 Supabase 매직링크(이메일 1회용 로그인 링크)의 시간당 발송 한도가 본인 수동 테스트를 차단하는 문제를 두 트랙으로 해소하는 설계다. **Track A**는 CI E2E(End-to-End) 테스트가 운영 Supabase project의 한도를 잠식하지 않도록 환경을 분리한다. **Track B**는 운영 Supabase project의 Auth SMTP(Simple Mail Transfer Protocol)를 Supabase 내장에서 Resend로 전환해 한도 자체를 시간당 2건에서 일일 100건으로 끌어올린다.

---

## 1. 배경 (문제)

Supabase Free Tier(무료 플랜)의 내장 Auth SMTP는 **이메일 한 주소당 60초 쿨다운 + 프로젝트당 시간당 약 2건**으로 매직링크 발송이 제한된다. 본 프로젝트는 운영 project 하나를 다음 세 곳이 공유한다:

1. 운영 사용자(POC 기간 dogfood 참가자)
2. 본인 수동 테스트(개발 중 직접 로그인 확인)
3. CI E2E 잡(`tests/e2e/auth-login.spec.ts` 의 폼 submit 검증)

→ CI가 한 번 돌면 매직링크 호출이 retries=2 까지 최대 3건 발생하고, 그 직후 본인이 손으로 로그인을 시도하면 시간당 2건 한도에 막혀 **수동 테스트가 진행 불가**.

---

## 2. 진단

코드 측 발송 경로 네 곳을 점검한 결과:

| 위치 | 매직링크 실제 발송? | 비고 |
|---|---|---|
| `tests/e2e/global-setup.ts` | ❌ 발송 안 함 | `admin.auth.admin.generateLink()` 로 OTP(One-Time Password, 1회용 토큰)를 서버에서 직접 추출 후 `verifyOtp()` 로 세션 쿠키 주입. SMTP 미경유. |
| `tests/integration/**` | ❌ 거의 없음 | DB/RLS(Row Level Security, 행 단위 접근 제어) 위주, 매직링크 호출 없음. |
| `tests/e2e/auth-login.spec.ts` | ✅ 발송 시도 | `submitBtn.click()` → `requestMagicLink()` Server Action → `signInWithOtp()` → Supabase Auth API 호출. PR당 1~3건 한도 소비. |
| 본인 dogfood / 수동 로그인 | ✅ 발송 | CI와 같은 운영 project 공유. |

진짜 문제는 **CI E2E와 dogfood가 동일 project의 한도를 공유한다는 것**이며, 어느 한쪽이 한도를 소진하면 다른 쪽이 차단된다.

---

## 3. 결정

두 트랙을 병렬로 진행한다. 서로 의존성이 없어 순서 무관.

### Track A — Supabase E2E project 분리 (미착수)

- 새 Supabase Free project를 `with-key-e2e` 로 만들고 CI E2E·통합 잡만 이 project를 가리키게 한다.
- 이 project의 Auth SMTP는 의도적으로 잘못된 설정(예: `host=null.invalid`)으로 두어 발송 시도가 SMTP 단에서 즉시 실패하게 한다.
- **운영 코드는 0줄 변경**. `tests/e2e/auth-login.spec.ts` 의 토스트 검증 조건 `successToast.or(errorToast).or(rateLimitedToast)` 이 errorToast 경로로 자연스럽게 통과한다.

### Track B — 운영 project Auth SMTP를 Resend로 전환 (완료)

- Resend 계정 생성, `mail.<DOMAIN>` 서브도메인을 Resend에 인증(SPF/DKIM 텍스트 레코드).
- Supabase 운영 project Auth → SMTP Settings에 Resend SMTP 자격증명 입력.
- 결과: 시간당 2건 한도 → 일일 100건 / 월 3,000건 한도(Resend Free Tier).

### 3.1 환경별 Supabase 연결 (Phase 1 범위)

본 spec이 만드는 환경별 연결 매트릭스. 로컬 dev와 Vercel은 Phase 1에서 분리하지 않으며 운영 project를 공유한다 — POC 일정과 Free Tier 2개 한도(운영 + E2E)를 우선한다.

| 실행 환경 | 연결 Supabase project | env 주입처 |
|---|---|---|
| `pnpm dev` (로컬) | 운영 project | `.env.local` (gitignored) |
| `pnpm test:e2e` (로컬) | 운영 project | `.env.local` |
| CI `integration` 잡 | **E2E project** | GitHub Secrets `*_E2E` |
| CI `e2e` 잡 | **E2E project** | GitHub Secrets `*_E2E` |
| Vercel Preview 배포 | 운영 project | Vercel Env Vars (Preview) |
| Vercel Production 배포 | 운영 project | Vercel Env Vars (Production) |

운영 project가 dev·preview·production에 공유되므로 본인 dev에서 생성되는 테스트 데이터(group, challenge, action photo 등)는 주기적으로 cleanup한다. Phase 2에서 별도 dev project 또는 로컬 Supabase 컨테이너로 분리한다(§8 참조).

---

## 4. Track A 세부 — 작업 단위 6개

### 4.1 Supabase Cloud에 새 무료 project 생성

- 이름: `with-key-e2e` (또는 동등)
- region: 운영 project와 동일(latency 비교 의미 유지)
- DB 비밀번호는 운영과 무관한 새 값으로 생성

### 4.2 새 project의 Auth → SMTP 설정

- Authentication → Emails → SMTP Settings에 의도적으로 잘못된 host(예: `null.invalid`) 입력.
- **왜**: 발송 시도가 외부로 1건도 나가지 않게 봉쇄하면서, 호출 자체는 정상적으로 발생해 `auth-login.spec.ts` 의 errorToast 경로를 검증한다.
- 대안(내장 SMTP 유지)도 가능하나, CI 재시도 시 첫 2건이 실제 메일로 발송될 위험이 있어 비채택.

### 4.3 Migration 새 project에 적용

```bash
supabase link --project-ref <e2e-project-ref>
supabase db push
```

- 운영 project와 동일한 스키마·RLS·RPC(Remote Procedure Call, Postgres 함수)를 보장.
- 이후 모든 migration은 운영·E2E 양쪽에 자동 적용(§4.5 참조).

### 4.4 GitHub Repository Secrets 추가(5개)

| Secret 이름 | 값 |
|---|---|
| `SUPABASE_URL_E2E` | E2E project URL |
| `SUPABASE_PUBLISHABLE_KEY_E2E` | publishable key (`sb_publishable_*`) |
| `SUPABASE_SECRET_KEY_E2E` | secret key (`sb_secret_*`) |
| `SUPABASE_DB_PASSWORD_E2E` | DB 비밀번호 |
| `SUPABASE_PROJECT_REF_E2E` | project ref (link 명령에 필요) |

> 키 명명은 [`supabase-keys.md`](../../../.claude/rules/common/supabase-keys.md) 의 신규 키 체계(publishable/secret)를 따른다. 레거시 `anon`/`service_role` 이름 금지.

### 4.5 `.github/workflows/ci.yml` 변경

`integration` 잡과 `e2e` 잡의 env를 `*_E2E` secret으로 매핑하고, migration 적용 스크립트가 E2E project를 가리키도록 인자를 받게 한다.

```yaml
integration:
  env:
    SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}
    SUPABASE_DB_PASSWORD: ${{ secrets.SUPABASE_DB_PASSWORD_E2E }}
    NEXT_PUBLIC_SUPABASE_URL: ${{ secrets.SUPABASE_URL_E2E }}
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: ${{ secrets.SUPABASE_PUBLISHABLE_KEY_E2E }}
    SUPABASE_SECRET_KEY: ${{ secrets.SUPABASE_SECRET_KEY_E2E }}
    SUPABASE_PROJECT_REF: ${{ secrets.SUPABASE_PROJECT_REF_E2E }}

e2e:
  env:
    NEXT_PUBLIC_SUPABASE_URL: ${{ secrets.SUPABASE_URL_E2E }}
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: ${{ secrets.SUPABASE_PUBLISHABLE_KEY_E2E }}
    SUPABASE_SECRET_KEY: ${{ secrets.SUPABASE_SECRET_KEY_E2E }}
```

`scripts/ci/apply-migrations.sh` 는 `SUPABASE_PROJECT_REF` 환경변수를 받아 `supabase link --project-ref "$SUPABASE_PROJECT_REF"` 후 `supabase db push` 하도록 수정한다.

### 4.6 운영 코드 변경 없음

- `src/app/(auth)/login/_actions.ts` — 변경 없음
- `tests/e2e/auth-login.spec.ts` — 변경 없음
- `tests/e2e/global-setup.ts` — 변경 없음 (이미 admin API로 발송 우회 중)

---

## 5. Track B 세부 — 완료 상태 기록

운영 project Auth SMTP를 Resend로 전환한 단계를 기록한다(재현·롤백·후속 환경 셋업용).

### 5.1 도메인 인증

- Resend → Domains → Add Domain 에 **`mail.<DOMAIN>`** 등록(루트 도메인 대신 서브도메인 — 메인 메일 인프라와 sender reputation 격리).
- Resend가 제공하는 3개 DNS 레코드(MX, SPF TXT, DKIM TXT)를 Vercel DNS에 추가.
- DMARC(Domain-based Message Authentication, Reporting, and Conformance) 레코드는 Resend가 제공하지 않으므로 수동 추가:
  - `_dmarc.mail` TXT `v=DMARC1; p=none;`
  - **왜 `p=none`**: 발송 자체에는 영향 없고 수신측 인증 점수만 올린다. 6개월 관찰 후 `p=quarantine` → `p=reject` 로 점진 강화.

### 5.2 Resend SMTP 자격증명 발급

- API Keys → Create API Key (Name: `supabase-auth`, Permission: **Sending access**)
- 키는 한 번만 표시되므로 Supabase Studio 입력 직후 안전한 곳에 보관.

### 5.3 Supabase Auth SMTP Settings 입력

| 필드 | 값 |
|---|---|
| Host | `smtp.resend.com` |
| Port | `465` (SSL) |
| Username | `resend` |
| Password | Resend API Key |
| Sender email | `noreply@mail.<DOMAIN>` |
| Sender name | `윗키` |

### 5.4 트러블슈팅 교훈

설계·구현 시 알아두면 시간을 아끼는 사실들:

1. **Sender email 도메인 일치** — Resend는 verified subdomain(`mail.<DOMAIN>`)에 속한 from 주소만 허용한다. `noreply@<DOMAIN>` 같이 서브도메인이 빠지면 "Error sending magic link email"로 거부된다. 초기 디버깅에서 이 함정으로 시간 소비.
2. **Sender email 칸은 풀 주소 입력** — Vercel DNS Name 필드의 자동 append와 다르게 Supabase는 통째로 입력해야 한다.
3. **Tracking Subdomain 사용 금지** — Resend가 매직링크 URL을 추적용 redirect URL로 재작성하면 (a) 토큰이 외부 redirect 서버 로그에 남고 (b) 기업 메일 보안 필터(Outlook Safe Links 등)가 클릭 전 prefetch로 1회용 토큰을 소진시켜 사용자가 "이미 사용된 링크" 오류를 만난다.
4. **Click/Open tracking 모두 OFF** — 위와 동일한 이유. 매직링크는 plain URL이 최선.
5. **Custom Return-Path 기본값 유지** — Resend 기본 envelope sender만으로도 SPF alignment 통과. 자체 도메인 추가 인증 비용 대비 이득 없음(DMARC `p=none` 정책 하에서).

### 5.5 운영 확인

- 운영 환경에서 본인 진짜 이메일로 발송 → from `noreply@mail.<DOMAIN>` 확인.
- Resend Dashboard Logs에 발송 기록 확인.
- 시간당 한도 회귀 검증(1시간 내 5건 연속 발송)은 §6.3 참조.

---

## 6. 검증 계획

운영 코드 변경이 없어 단위 테스트 변경은 없다. CI dry-run으로 회귀를 확인한다.

### 6.1 로컬 회귀

```bash
pnpm typecheck && pnpm lint && pnpm test
```

기존 통과 케이스가 그대로 통과해야 한다.

### 6.2 CI dry-run

작업 PR을 만들어 한 번 돌리며 확인:

- ✅ `integration` 잡 통과 — E2E project에서 RPC/RLS 검증
- ✅ `e2e` 잡 통과 — `auth-login.spec.ts` 가 errorToast 경로로 통과
- ✅ Supabase **운영** project Auth Logs → 해당 시간대 SignInWithOtp 호출 **0건**
- ✅ Supabase **E2E** project Auth Logs → 호출 발생 + SMTP error
- ✅ Migration apply step이 E2E project에 정상 적용

### 6.3 운영 dogfood (Track B 검증)

- 본인 진짜 이메일로 1시간 내 5건 연속 발송 → 모두 도착, rate limit 미발생
- Resend Dashboard Logs에 발송 5건 기록
- 받은편지함 도착(스팸함 아님 — DKIM 인증 성공 시)

---

## 7. 비채택안

| 안 | 비채택 사유 |
|---|---|
| `E2E_AUTH_BYPASS` env flag로 Server Action 분기 | 운영 코드에 test-only 분기 영구 잔류. flag가 운영 환경에 실수로 set 되면 누구나 `@test.local` 이메일로 로그인 가능 — 보안 표면 추가. |
| 로컬 Supabase 컨테이너 + Inbucket(메일 catcher) | 격리 수준은 최고이나 CI 시간 +2~3분, runner 메모리 +1GB. POC 2주 일정 대비 과투자. Phase 2/3에서 재검토. |
| Ports & Adapters(AuthProvider 인터페이스 도입) | Architecture로는 정답이나 사용처가 한 곳뿐 — YAGNI(You Aren't Gonna Need It). 카카오 OAuth 도입 시 함께 묶는 게 자연스러움. |
| 카카오 OAuth 우선 도입 | rate limit과 직접 연결 없음. 2~4일+ 작업에 카카오 비즈채널 승인 시간 추가. POC 마무리 후 별도 spec. |

---

## 8. 향후 확장 (참고)

이번 spec의 Track A가 만드는 `with-key-e2e` project는 그대로 유지되며, 환경이 늘어나도 폐기되지 않는다.

### Phase 1 — 현재(이번 spec)

```
production: with-key prod project
E2E:        with-key-e2e project (새로 생성)
```

### Phase 2 — POC 통과 후 베타 직전

```
production: with-key prod project
E2E:        with-key-e2e project (그대로)
staging:    self-hosted Supabase (Docker on VPS) 또는 paid project
local:      Supabase CLI 컨테이너(개발자별)
```

### Phase 3 — 정식 서비스

```
production: paid (모니터링/PITR/백업)
E2E:        free (그대로)
staging:    paid 또는 self-hosted
local:      개발자별 컨테이너
+ daily backup, read replica, observability
```

핵심 원칙: **migration이 단일 SoT(Source of Truth, 단일 원본)** 이며 모든 환경에 자동 적용된다. zod(런타임 검증 + 타입 도출 라이브러리) 스키마와 마찬가지로 코드는 환경 무관. 변하는 것은 환경별 secret뿐.

---

## 9. 비용

| 항목 | 비용 |
|---|---|
| Supabase E2E project 추가 | $0 (Free Tier 2개 한도 내) |
| Resend SMTP | $0 (100건/일, 3,000건/월 한도) |
| Vercel 도메인 | 이미 보유 |
| **합계** | **$0** |

Phase 2 staging이 추가되면 첫 paid project가 발생할 수 있으나(~$25/월) 자체 호스팅으로 회피 가능.

---

## 10. 영향 범위

| 파일/리소스 | 변경 |
|---|---|
| `src/app/(auth)/login/_actions.ts` | 변경 없음 |
| `tests/e2e/auth-login.spec.ts` | 변경 없음 |
| `tests/e2e/global-setup.ts` | 변경 없음 |
| `tests/e2e/helpers/auth-cookie.ts` | 변경 없음 |
| `.github/workflows/ci.yml` | env 매핑 변경(약 15줄) |
| `scripts/ci/apply-migrations.sh` | E2E project 인자 처리 |
| Supabase Cloud | 새 project 1개 생성, Auth SMTP 잘못된 설정 |
| Vercel DNS | (완료) Resend 인증용 MX/SPF/DKIM/DMARC 4건 |
| GitHub Secrets | 5개 추가 |
| `.env.example` | 변경 없음(운영 키 이름은 그대로) |
| `.env.local` (개인, gitignored) | 변경 없음 — Phase 1에서 로컬 dev는 운영 project 유지(§3.1) |
| `PROJECT_LOG.md` | Track B 완료를 `Decisions & Trade-offs` 와 `Security & Risk` 양쪽에 기록 |

---

## 11. 용어집

- **DKIM (DomainKeys Identified Mail)**: 도메인 단위 메일 본문 위변조 방지 서명.
- **DMARC (Domain-based Message Authentication, Reporting, and Conformance)**: SPF/DKIM 인증 실패 시 수신측이 어떻게 처리할지 정의하는 정책.
- **dogfood**: 자기 서비스를 본인이 직접 써보며 검증하는 활동.
- **OTP (One-Time Password)**: 1회만 유효한 인증 토큰. Supabase 매직링크는 OTP 기반.
- **PITR (Point-in-Time Recovery)**: 특정 시점으로 DB를 복원하는 백업 기법.
- **RLS (Row Level Security)**: Postgres 행 단위 접근 제어.
- **RPC (Remote Procedure Call)**: Supabase에서 Postgres 함수를 클라이언트가 호출하는 방식.
- **SMTP (Simple Mail Transfer Protocol)**: 메일 발송 프로토콜.
- **SoT (Source of Truth)**: 단일 원본.
- **SPF (Sender Policy Framework)**: 발송 서버 IP를 도메인이 인증하는 방식.
- **YAGNI (You Aren't Gonna Need It)**: 지금 필요 없는 기능을 미리 만들지 말라는 원칙.
