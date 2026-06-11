# Code Review Standards

> 공통 리뷰 기준 원본: [`../../../docs/QUALITY_GATE.md`](../../../docs/QUALITY_GATE.md) §리뷰 기준. 이 파일은 트리거·심각도·에이전트 매핑만 추가.

## 리뷰 트리거 (필수)

- 코드 작성/수정 후
- 공유 브랜치 커밋 전
- 보안 민감 코드(인증·결제·사용자 데이터) 변경
- 아키텍처 변경
- PR 머지 전

리뷰 요청 전: CI/CD 통과 · 충돌 해결 · target 브랜치와 최신 동기화.

## 심각도 / 머지 결정

| Level    | 의미                       | 조치                     |
| -------- | -------------------------- | ------------------------ |
| CRITICAL | 보안 취약점/데이터 손실    | BLOCK — 머지 전 수정     |
| HIGH     | 버그 또는 중대한 품질 이슈 | WARN — 머지 전 수정 권장 |
| MEDIUM   | 유지보수 우려              | INFO — 가능하면 수정     |
| LOW      | 스타일/사소한 제안         | NOTE — 선택              |

승인: CRITICAL/HIGH 없으면 Approve. CRITICAL이면 Block.

## 보안 트리거 → 즉시 보안 점검 강화

아래 변경은 [`security.md`](./security.md) 체크리스트 + [`../typescript/security.md`](../typescript/security.md)를 우선 적용한다.

- 인증/인가, 사용자 입력, DB 쿼리, 파일 시스템, 외부 API, 암호화, 결제

## 리뷰 어댑터

| 상황                  | 어댑터                                                                                    |
| --------------------- | ----------------------------------------------------------------------------------------- |
| 단일 파일 리뷰        | [`../../commands/review.md`](../../commands/review.md)                                    |
| 브랜치 전체 자가 리뷰 | `withkey-review` 스킬                                                                     |
| 보안 집중 점검        | [`security.md`](./security.md) · [`../typescript/security.md`](../typescript/security.md) |

## 자주 잡히는 이슈

- **보안**: 하드코딩된 credential, SQL 인젝션, XSS, path traversal, CSRF 미보호, 인증 우회
- **품질**: 50줄 초과 함수, 800줄 초과 파일, 4단계 초과 중첩, 미처리 에러, 변이 패턴, 누락 테스트
- **성능**: N+1 쿼리, 미페이지네이션, 무제한 쿼리, 캐싱 누락
