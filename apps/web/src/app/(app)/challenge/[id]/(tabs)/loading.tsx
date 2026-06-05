// 피드 탭의 default skeleton. 카드 3개 + 헤더 1줄.
export default function FeedLoading() {
  return (
    <div className="flex flex-col gap-3" aria-busy="true" aria-label="피드 로딩 중">
      <div className="bg-muted h-4 w-32 animate-pulse rounded" />
      {[0, 1, 2].map((i) => (
        <div key={i} className="bg-card flex flex-col gap-3 rounded-2xl border p-4">
          <div className="bg-muted h-3 w-24 animate-pulse rounded" />
          <div className="bg-muted aspect-square w-full animate-pulse rounded-xl" />
          <div className="bg-muted h-3 w-3/4 animate-pulse rounded" />
        </div>
      ))}
    </div>
  );
}
