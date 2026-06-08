---
description: 프로덕션 빌드까지 포함한 풀 검증 (배포 직전 · 설정 변경 시 필수)
---

> **역할**: 이 파일은 [`../../docs/QUALITY_GATE.md`](../../docs/QUALITY_GATE.md)의 build-sensitive 검증을 Claude Code에서 실행하는 어댑터다.
> **전제**: `with-key` 저장소 루트에서 실행.
> 이 명령은 **`next.config.ts` / `middleware.ts` / `eslint.config.mjs` / `tsconfig.json` / Tailwind·PostCSS 설정 / Supabase migration 추가** 시 사용한다. 일반 변경은 `./check.md`로 충분하다.

## 절차

1. 타입 체크
   - `pnpm typecheck`
2. 린트
   - `pnpm lint`
3. 단위 테스트
   - `pnpm test`
4. 프로덕션 빌드 (Turbopack 빌드 포함)
   - `pnpm build`
5. (선택) 런타임 sanity 체크
   - `pnpm start` 로 기동 후 `/`, `/login`, `/home` 응답 확인
   - 장시간 실행 명령이므로 기동 확인 후 중단해도 된다.

## 확인 포인트

- `middleware.ts`의 matcher가 정적 자산·이미지를 누락 없이 제외하는지
- `@supabase/ssr` 기반 `createServerClient`가 RSC/Route Handler 양쪽에서 쿠키를 정상 갱신하는지 (빌드 로그상 `cookies()` 관련 경고 없음)
- `src/app/api/push/route.ts`가 Node 런타임에서 빌드되는지 (Edge 런타임으로 잘못 선언되어 있지 않은지)
- RSC에서만 쓰여야 할 server-only 모듈(`OPENAI_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `VAPID_PRIVATE_KEY` 참조 파일)이 클라이언트 번들로 유입되지 않는지

## 보고 형식

- 각 단계 결과(OK, FAIL, SKIP)
- 발견된 경고/에러(원문 인용)
- 영향 가능한 route 목록
- 수동 확인 필요 여부 (shadcn 컴포넌트 렌더·Server Action 경로 등)

## 금지

- `../../docs/QUALITY_GATE.md` 의 금지 사항과 아키텍처 가드레일을 우선한다.
- `middleware.ts`의 auth 가드 예외 경로(`/`, `/login`, `/invite/*`) 임의 변경 금지
- `supabase/migrations/*.sql` 파일 재정렬·삭제 금지 (append-only)
- `NEXT_PUBLIC_` 접두를 서버 전용 키(`SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`, `VAPID_PRIVATE_KEY`)에 붙이는 수정 금지
- 실패를 우회하기 위한 임시 타입 단언/ESLint disable 남용 금지
