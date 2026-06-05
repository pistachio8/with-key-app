// 모킹업 §5-B (line 748) — 5점 wave loading.
// keyframe + utility 는 src/app/globals.css 의 `.animate-invite-dot`.
// reduced-motion 사용자는 globals.css 의 글로벌 룰로 animation-duration: 1ms 가 강제돼 정지된 점만 보인다.
export function InviteLoadingDots() {
  return (
    <div aria-hidden="true" className="flex items-center justify-center gap-1.5">
      {[0, 1, 2, 3, 4].map((i) => (
        <span
          key={i}
          className="bg-primary block size-2 rounded-full motion-safe:animate-invite-dot"
          style={{ animationDelay: `${i * 120}ms` }}
        />
      ))}
    </div>
  );
}
