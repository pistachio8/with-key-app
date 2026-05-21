# 코딩 스타일

> **Karpathy 4원칙**(§1 생각 · §2 단순함 · §3 외과적 수정 · §4 목표 중심)의 본문은 **시스템 글로벌 `~/.claude/CLAUDE.md`** 에 SoT로 정의 — 출처 [forrestchang/andrej-karpathy-skills](https://github.com/forrestchang/andrej-karpathy-skills). 본 파일은 with-key 특화 보강(**불변성** · **파일 구성** · **에러/입력 검증**)만 다룹니다.
> 공통 품질 기준은 [`../../../docs/QUALITY_GATE.md`](../../../docs/QUALITY_GATE.md)를 우선합니다.

## 불변성

기존 객체를 변경하지 말고 새 객체를 만든다. 사이드 이펙트 방지·디버깅 용이·동시성 안전. (구체 패턴은 [`../typescript/patterns.md`](../typescript/patterns.md))

## 파일 구성·에러·입력 검증

- 작은 파일 다수 > 큰 파일 소수. 일반적 200~400줄, 최대 800줄. 기능/도메인별 분리.
- 에러는 모든 레벨에서 명시적으로. UI는 사용자 친화 메시지, 서버는 컨텍스트 로깅. 조용히 무시 금지.
- 입력은 시스템 경계에서 검증. 가능하면 schema 기반(zod). 명확한 메시지로 빠르게 실패. 외부 데이터(API/사용자/파일) 신뢰 금지.

(완료 전 체크리스트는 QUALITY_GATE §리뷰 기준 참조)
