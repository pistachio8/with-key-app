type Member = { id: string; displayName: string; doneCount: number };
type Props = { goalCount: number; members: ReadonlyArray<Member> };

function progressPercent(doneCount: number, goalCount: number): number {
  if (goalCount <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((doneCount / goalCount) * 100)));
}

// Design Brief 화면 4: 그룹 진행률 스트립
export function MemberStrip({ goalCount, members }: Props) {
  if (members.length === 0) {
    return (
      <p className="text-muted-foreground rounded-xl border border-dashed p-4 text-sm">
        아직 참여한 멤버가 없어요.
      </p>
    );
  }
  return (
    <ul className="flex flex-wrap gap-3">
      {members.map((m) => {
        const progress = progressPercent(m.doneCount, goalCount);
        return (
          <li key={m.id} className="bg-card flex-1 rounded-xl border p-3">
            <p className="text-sm font-semibold">{m.displayName}</p>
            <p className="text-muted-foreground mt-1 text-xs tabular-nums">
              {m.doneCount}/{goalCount}회
            </p>
            <div
              role="progressbar"
              aria-label={`${m.displayName} 진행률`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progress}
              className="bg-muted mt-2 h-1.5 overflow-hidden rounded-full"
            >
              <div
                className="bg-primary h-full transition-[width]"
                style={{ width: `${progress}%` }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
