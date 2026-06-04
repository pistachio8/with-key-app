# Product Context (싱글톤)

> 제품 맥락을 정규화한 요약. create-prd 워크플로가 첫 입력으로 읽는다. 본문 복제 금지 — 기존 SoT를 인용·요약만 한다(ADR-0031).

## 한 줄 정의

fromwith — 그룹 운동 각서(서약) 앱. 모바일 웹 PWA POC → React Native 전환.

## 정규화 요약 (인용 SoT — 본문은 아래 파일이 진실)

- 아이디어 / 배경: `docs/IDEATION.md`
- 전략: `docs/strategy/`
- 제품 정의 SoT: `docs/PRD.md` §1 (POC) · `docs/migration/01-rn-mvp-prd.md` (RN MVP — P0 포팅 + P1 정산 + P2 자동검증)

## 제품 방향 변경 시

이 파일 수정은 Level 3(PO 전용 — `harness/UPDATE_POLICY.md`). 하네스 자율 변경 금지. 제품 방향 drift는 항상 "코드 의심"이 아니라 PO 의식적 갱신으로만 해소(05 §5·§6).

## 읽는 workflow / 업데이트 시점

read: create-prd.
update: 제품 방향 변경 시(Level 3 — PO).
