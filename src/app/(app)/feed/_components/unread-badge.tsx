// DESIGN_BRIEF §1.5 — 앱 내 빨간 배지는 최대 1곳. 피드 탭 '새 응원 N건'.

interface UnreadBadgeProps {
  count: number;
}

export function UnreadBadge({ count }: UnreadBadgeProps) {
  if (count <= 0) return null;
  const label = count >= 100 ? "새 응원 99+건" : `새 응원 ${count}건`;
  return (
    <span className="bg-primary/10 text-primary inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold tabular-nums">
      {label}
    </span>
  );
}
