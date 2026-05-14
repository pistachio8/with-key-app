# UI 모킹업

with-key 디자인 검토용 정적 HTML 모킹업을 보관합니다. 실제 구현은 `src/`에서 진행하며, 본 문서는 시안·리뷰 기록입니다.

## 현재 (latest)

- [`2026-05-14-ui-revision.html`](./2026-05-14-ui-revision.html) — 첨부 PDF "ui 수정 사항" + 검토 피드백 3회차 반영
  - 디자인 가이드: 색상 7종 · 아이콘 스타일 (lucide + emoji) · 카드/버튼/도넛/진행바 컴포넌트 · 타입 스타일
  - 13개 섹션 모킹업 (진입·홈·챌린지 생성·외부 공유·초대·상세·인증 결과·종료/정산·관리·알림)
  - 인터랙션: 도장 찍히는 애니메이션 (IntersectionObserver, 1회 재생) · 17일째 슬라이드 카운터 · 로딩 dot wave

## 보는 법

```bash
open docs/mockups/2026-05-14-ui-revision.html
```

폰트(Pretendard)는 CDN에서 로드합니다. 오프라인 환경에서는 폴백 system font로 렌더링됩니다.

## Archive

이전 검토 회차 산출물 — 참고용.

| 파일 | 단계 | 비고 |
|------|------|------|
| [`archive/2026-05-14-ui-revision-v2.html`](./archive/2026-05-14-ui-revision-v2.html) | 1차 피드백 반영 | lucide icon 도입 · 컬러 통계 · 슬라이드/로딩 애니메이션 |
| [`archive/2026-05-14-ui-revision-v3.html`](./archive/2026-05-14-ui-revision-v3.html) | 2차 피드백 반영 | 도장 디자인 · 6-A/6-B 메인컬러 · 17일째 슬라이드 |
| [`archive/ui-sample.html`](./archive/ui-sample.html) | 이전 별개 작업물 | 본 revision 이전, 참고용 |

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
