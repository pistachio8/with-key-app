// 정보 탭 default skeleton — 가장 가벼움.
export default function InfoLoading() {
  return (
    <div
      className="bg-card flex flex-col gap-3 rounded-2xl border p-4"
      aria-busy="true"
      aria-label="정보 로딩 중"
    >
      <div className="bg-muted h-3 w-32 animate-pulse rounded" />
      <div className="bg-muted h-3 w-48 animate-pulse rounded" />
      <div className="bg-muted h-3 w-40 animate-pulse rounded" />
    </div>
  );
}
