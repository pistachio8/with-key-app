# 배포 & Preview 런북

## 환경 매트릭스

| 환경 | Supabase | Vercel scope | URL 패턴 |
|---|---|---|---|
| local | `with-key` (공유) | — | http://localhost:3000 |
| preview | `with-key` (공유) | Preview | https://with-key-git-<branch>-<team>.vercel.app |
| production | `with-key-prod` (v1 컷오버 시 신규 생성) | Production | TBD |

POC 스케일 결정: local/CI/preview 모두 동일한 `with-key` 프로젝트 사용.
`truncate_test_data` 가 `@test.local` 이메일로 스코핑되어 수동 검증 데이터가 보호됨.
자세한 배경은 [DECISIONS D-014](./TEAM_SHARE_DECISIONS.md).

## Preview 가 뜨지 않을 때

1. Vercel → Deployments → 해당 커밋의 build log.
2. 대부분은 env 누락. Settings → Environment Variables → **Preview** scope 확인.
3. Build 성공 후 런타임 에러면 Preview URL 의 `/login` 에 직접 접속 → 브라우저 Network 탭.

## Secrets rotation

Supabase publishable 키는 공개 가능. secret 키가 노출된 경우:
1. Supabase → Settings → API → "Generate new secret key".
2. **4곳 동시 교체**: GitHub secrets(`SUPABASE_SECRET_KEY`) · Vercel Preview env · 로컬 `.env.local` · 팀원 공유 비밀번호 관리자.
3. 배포된 preview 는 dummy commit 으로 재빌드 유도.

## Production 컷오버 체크리스트 (v1)

별도 ADR 예정. 최소한:
- `with-key-prod` Supabase 프로젝트 생성 + `pnpm db:push`.
- Vercel Production scope env 를 prod 키로 채움 (Preview 와 분리).
- `main` 에 branch protection 강화 (approvals=2, required checks 포함).
- Sentry DSN 등록 (`NEXT_PUBLIC_SENTRY_DSN`).
- CI secrets 를 prod/ci 로 분리 (단일 공유 모델 해제).
