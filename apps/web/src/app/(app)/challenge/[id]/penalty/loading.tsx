// 만회 찬스 화면 skeleton — 헤더 + 미션 카드 + 본문 1개 (challenge route loading 패턴).
export default function PenaltyLoading() {
  return (
    <div className="flex flex-col gap-4 p-4" aria-busy="true" aria-label="만회 찬스 로딩 중">
      <div className="bg-muted h-9 w-1/2 animate-pulse rounded-full" />
      <div className="bg-muted h-28 w-full animate-pulse rounded-2xl" />
      <div className="bg-muted aspect-[9/12] w-full animate-pulse rounded-2xl" />
      <div className="bg-muted h-12 w-full animate-pulse rounded-2xl" />
    </div>
  );
}
