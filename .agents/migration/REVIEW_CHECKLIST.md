# Migration PR 리뷰 체크리스트 (포팅 트랙)

> 03 전환 규칙의 *적용*을 PR에서 확인하는 체크박스. 03 규칙 본문 복제가 아니다(ADR-0031).

- [ ] PR에 `Track=port` 태그 노출
- [ ] 보존 eval pass^k = 100% (회귀 0)
- [ ] feature가 `expo-*` 를 직접 import하지 않음 (도메인 격리)
- [ ] RSC · cache · hydration 잔재 없음 (RN 타깃에 무의미한 PWA 잔재 제거)
- [ ] `docs/migration/03-rn-migration-rules.md` 레이어 매핑 준수
- [ ] Parent 인용(PRD AC → Test Scenario → Job Story → Engineering Story → Work Package) 모두 resolve

읽는 workflow: review-agent-task(port).
업데이트 시점: 전환 규칙 변경 시 (Level 2).
