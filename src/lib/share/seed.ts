import "server-only";

// 공유물 사진 선택용 per-request seed 를 만든다. Math.random 같은 impure 호출은 이
// 서버 전용 함수에 격리한다 — RSC 는 요청당 1회 렌더라 "방문마다 재추첨"이 의도된
// 동작이지만, 컴포넌트 렌더 본문에서 Math.random 을 직접 부르면 react-hooks/purity
// 규칙(클라이언트 재렌더 안정성 기준)이 차단한다. 페이지는 이 함수를 호출만 한다.
export function makeShareSeed(): number {
  return Math.floor(Math.random() * 2_147_483_647);
}
