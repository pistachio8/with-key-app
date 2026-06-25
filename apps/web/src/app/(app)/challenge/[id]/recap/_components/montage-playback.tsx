// src/app/(app)/challenge/[id]/recap/_components/montage-playback.tsx
// 영상 결과물 fast-follow = 합본 몽타주(spec §C6-B / EVAL-0046 · ADR-0040).
// 클립을 한 편의 mp4 로 이어붙인 결과물. montage URL 이 있을 때만 렌더 —
// 없으면 page.tsx 가 StoryPlayback(스토리 자동재생)으로 fallback 한다.
"use client";

type Props = {
  src: string;
};

export function MontagePlayback({ src }: Props) {
  return (
    <section
      aria-label="합본 영상"
      // w-[calc(100%+2rem)] 폭 고정 — StoryPlayback 과 동일 사유(WebKit/iOS Safari 가 flex item 에서
      // aspect-ratio 높이를 max-h 로 자를 때 9/16 유지를 위해 폭을 역산해 좌측으로 붕괴, feedback e6693fe2).
      className="-mx-4 aspect-[9/16] max-h-[70vh] w-[calc(100%+2rem)] overflow-hidden bg-black"
    >
      <video
        src={src}
        controls
        autoPlay
        muted
        playsInline
        className="h-full w-full object-contain"
      />
    </section>
  );
}
