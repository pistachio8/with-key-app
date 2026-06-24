# UI 모킹업

with-key 디자인 검토용 정적 HTML 모킹업을 보관합니다. 실제 구현은 `src/`에서 진행하며, 본 문서는 시안·리뷰 기록입니다.

> 이 폴더는 **시각 시안**(특정 화면을 어떻게 그릴지)입니다. 색·타이포·컴포넌트·보이스의 **재사용 가능한 디자인 기준**은 [`../DESIGN.md`](../DESIGN.md)(Design System)를 참조하세요. 시안은 그 기준의 적용 예시입니다.

## 현재 (latest)

- [`2026-05-14-ui-revision.html`](./2026-05-14-ui-revision.html) — 첨부 PDF "ui 수정 사항" + 검토 피드백 3회차 반영
  - 디자인 가이드: 색상 7종 · 아이콘 스타일 (lucide + emoji) · 카드/버튼/도넛/진행바 컴포넌트 · 타입 스타일
  - 13개 섹션 모킹업 (진입·홈·챌린지 생성·외부 공유·초대·상세·인증 결과·종료/정산·관리·알림)
  - 인터랙션: 도장 찍히는 애니메이션 (IntersectionObserver, 1회 재생) · 17일째 슬라이드 카운터 · 로딩 dot wave

## 화면 플로우 / IA (디자이너 공유용)

IA(Information Architecture, 화면 구조·흐름)를 정리한 자료입니다. 위 시안과 달리 "어떤 화면이 어떻게 이어지는가"가 목적이라 별도로 둡니다.

- [`2026-06-23-screen-flow.html`](./2026-06-23-screen-flow.html) — 실제 라우트(`apps/web/src/app/**`)·네비게이션 코드 스캔 기반
  - 전체 화면 전이 다이어그램 (Mermaid, CDN 렌더)
  - 화면 인벤토리 표 19종 (라우트·핵심 요소·진입/이탈·인증 게이트) + 폐기 redirect 6종
  - 화면 와이어프레임 19종 (모바일 mockup — 실제 `_components` 코드의 카피·레이아웃·기본값 반영, 인벤토리 전체와 1:1, 최종 타이포·일러스트는 디자인 영역)
  - 상태·역할 분기 variant 10종 (빈/에러: 초대 만료·정원 초과·정산 미달·빈 피드 / 운영자 vs 일반 멤버: 정보 탭·그룹 상세·관리 메뉴·나가기 — 분기 변수 `preview.expired`·`viewerAchieved`·`isOwner` 등 코드 추출)
  - Figma/FigJam 가져오기 안내 + 붙여넣기용 Mermaid 소스

## 기능별 와이어프레임 (feature 단위)

특정 기능 spec 의 신규·변경 화면만 추린 시안입니다. 전체 화면 인벤토리(위 screen-flow)와 달리 "이 기능이 더하는 화면"에 집중합니다.

- [`2026-06-24-feed-type-penalty-screens.html`](./2026-06-24-feed-type-penalty-screens.html) — 피드 타입(이미지/3초 영상) + 만회 찬스(Redemption) ([spec](../superpowers/specs/2026-06-23-feed-type-penalty-redesign-design.md) · WP `evals/tasks/0042~0046`)
  - UI 명칭은 "만회 찬스"(처벌 어감 완화) — spec·코드 식별자는 `penalty_*`·`/penalty` 유지
  - 신규/변경 화면 6종: 생성 폼(피드 타입·만회 찬스 입력) · 영상 실시간 캡처 인증 · 만회 찬스 녹화 제출(미달자) · 만회 찬스 판단(동료) · 영상 스토리 자동재생 · 홈 "만회 찬스" 섹션
  - 상태·역할 분기 6종: 면제 성공/실패 · 제출 자격 없음 · 2배 빚 carry-over 정산 · 합본 몽타주(fast-follow) · 이미지 recap 회귀(무변화)
  - 화면 ↔ 라우트 ↔ WP 매핑표 + 데이터 흐름 발췌. Phase 1(녹화 기반)만, 라이브 송출은 범위 밖
  - **인터랙티브 허브(2026-06-24 개선)**: 갤러리 시안의 ▶ 를 누르면 아래 고화질 목업 화면이 그 자리에서 iframe으로 열리고(↗ 전체=새 탭), 대응 화면이 없는 정적 분기(이월 정산·몽타주·이미지 회귀)는 '정적' 배지로 구분. iframe 미리보기는 로컬 서버(`python3 -m http.server`)에서 가장 안정적
- [`2026-06-24-feed-type-penalty/`](./2026-06-24-feed-type-penalty/) — 위 와이어프레임의 **인터랙티브 고화질 목업** (실 with-key 토큰 `2026-06-24-feed-type-penalty/css/withkey.css` 적용 · 화면별 분리 HTML + `index.html` 링크 런처)
  - 화면 8종 단독 실행: 영상 캡처 인증 · 스토리 재생 · 만회 제출/판정/결과 · 인증 피드 · 생성 폼 · 홈. 상태 변형(빈/미제출 대기/2배 이월)은 쿼리스트링(`?state=empty`·`?r=rejected`)으로 진입
  - 인터랙션 동작: 3초 캡처 타이머·스토리 자동재생·판정 토글·폼 검증 등 (더미 데이터, 실 구현은 `apps/web/src/app/**`)
  - 단일 합본 대신 분리 파일: 화면별 단독 `open`이 file://에서 확실히 렌더되고 개발 중 참조에 편리. 화면 카피는 컨벤션 용어 '만회 찬스'로 통일(2026-06-24 · 금액 '벌금'은 유지 · 코드 식별자 `penalty_*`·`/penalty` 유지). 위 screens 허브에서 ▶ 로 임베드됨

## 보는 법

```bash
open docs/mockups/2026-05-14-ui-revision.html
```

폰트(Pretendard)는 CDN에서 로드합니다. 오프라인 환경에서는 폴백 system font로 렌더링됩니다.

## Archive

이전 검토 회차 산출물 — 참고용.

| 파일                                                                                 | 단계             | 비고                                                    |
| ------------------------------------------------------------------------------------ | ---------------- | ------------------------------------------------------- |
| [`archive/2026-05-14-ui-revision-v2.html`](./archive/2026-05-14-ui-revision-v2.html) | 1차 피드백 반영  | lucide icon 도입 · 컬러 통계 · 슬라이드/로딩 애니메이션 |
| [`archive/2026-05-14-ui-revision-v3.html`](./archive/2026-05-14-ui-revision-v3.html) | 2차 피드백 반영  | 도장 디자인 · 6-A/6-B 메인컬러 · 17일째 슬라이드        |
| [`archive/ui-sample.html`](./archive/ui-sample.html)                                 | 이전 별개 작업물 | 본 revision 이전, 참고용                                |

## 원본 자료

원본 디자인 가이드 PDF는 저장소에 포함되지 않습니다. 작업 시점 로컬 경로 (참고):

```
~/Downloads/3541141d-4e77-4ccc-b9ab-46e835be229a_ui_수정_사항.pdf
```

## 운영 규칙

- 새 검토 회차가 들어오면 latest 파일을 덮어쓰지 말고 `archive/`로 옮긴 뒤 새 파일 생성.
- 파일명 규칙: `YYYY-MM-DD-<topic>.html`. archive 내부는 `-v2`, `-v3` 등 회차 suffix 부여.
- 실제 구현이 모킹업과 달라질 경우, latest 파일의 frame-note에 "deprecated — 실 구현: src/app/.../page.tsx 참조" 추가.

## 용어집

- **lucide icon**: `https://lucide.dev` 오픈소스 SVG 아이콘 세트. 파일 내부에 `<symbol>`로 인라인됨.
- **IntersectionObserver**: 요소가 뷰포트에 들어오는 시점을 감지하는 브라우저 API. 도장 애니메이션 트리거에 사용.
- **모킹업(mockup)**: 실제 동작하지 않는 정적 디자인 시안. 코드 구현 전 시각적 합의용.
