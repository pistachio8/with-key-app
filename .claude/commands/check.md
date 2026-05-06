---
description: 타입체크 + 린트 + 테스트 실행
agent: build
---

> **전제**: `with-key` 저장소 루트에서 실행한다.
> 풀 빌드까지 포함한 검증이 필요하면 `./build-check.md`를 사용한다.

아래 순서로 실행해줘. 오류가 있으면 원인을 요약하고 가능한 범위에서 모두 수정해줘.

1. 타입 체크
   - `pnpm typecheck`
2. 린트
   - `pnpm lint`
   - 실패 시 자동 수정이 가능한 항목은 `./lint-fix.md` 기준으로 보완한다.
3. 단위 테스트
   - `pnpm test`
   - 테스트가 없는 범위면 SKIP하고 이유를 보고한다.

## 보고 형식

- 실행한 단계 / 결과(OK, FAIL, SKIP)
- 실패한 경우: 에러 요약(최대 10줄) + 수정 여부
- 변경한 파일 목록

## 금지

- zod 스키마 시그니처(타입 SoT) 임의 변경 금지 — 도메인 타입은 `src/lib/validators/`에서 `z.infer`로만 도출
- `src/lib/analytics/track.ts`의 `AnalyticsEvent` 유니온 임의 확장 금지 (PO 승인 필요)
- `any` 추가로 타입 오류를 무마하지 말 것 — `unknown` + 좁히기 우선
- ESLint disable 주석 남용 금지
