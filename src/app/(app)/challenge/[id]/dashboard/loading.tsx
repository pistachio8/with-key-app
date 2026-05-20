// 현황판 탭 default skeleton — 4 stats + member rank 4행.
export default function DashboardLoading() {
  return (
    <div className="flex flex-col gap-3" aria-busy="true" aria-label="현황판 로딩 중">
      <div className="bg-card grid grid-cols-4 gap-2 rounded-2xl border p-3">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex flex-col items-center gap-1">
            <div className="bg-muted h-6 w-10 animate-pulse rounded" />
            <div className="bg-muted h-2 w-8 animate-pulse rounded" />
          </div>
        ))}
      </div>
      <div className="bg-card flex flex-col gap-2 rounded-2xl border p-3">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-3 p-2">
            <div className="bg-muted size-8 animate-pulse rounded-full" />
            <div className="bg-muted h-3 flex-1 animate-pulse rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}
