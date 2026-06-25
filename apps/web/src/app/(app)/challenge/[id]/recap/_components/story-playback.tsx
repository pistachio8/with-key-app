// src/app/(app)/challenge/[id]/recap/_components/story-playback.tsx
// 영상 결과물 Phase 1 = 스토리 자동재생(spec §C6-A / EVAL-0043).
// 인증 클립(3초)을 시간순으로 클라이언트에서 순서 재생 — 인코딩·서버·외부 비용 0.
// 디자인 SoT: docs/mockups/2026-06-24-feed-type-penalty/recap-story.html
"use client";

import { useCallback, useState } from "react";
import type { RecapVideoView } from "@/lib/db/reads/challenge-videos";

type Props = {
  clips: ReadonlyArray<RecapVideoView>;
  durationDays: number;
  memberCount: number;
};

function initial(name: string): string {
  return name.trim().slice(0, 1) || "?";
}

// 새벽 기상 등 시각이 의미 있는 클립이라 KST(Asia/Seoul)로 표시 — UTC 표시는 9시간 어긋난다.
const DATETIME_FMT = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  month: "long",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

function fmtDateTime(iso: string): string {
  return DATETIME_FMT.format(new Date(iso));
}

export function StoryPlayback({ clips, durationDays, memberCount }: Props) {
  const [index, setIndex] = useState(0);
  const [finished, setFinished] = useState(false);
  const [progress, setProgress] = useState(0);

  const goTo = useCallback(
    (next: number) => {
      if (next < 0) return;
      if (next >= clips.length) {
        setFinished(true);
        return;
      }
      setProgress(0);
      setFinished(false);
      setIndex(next);
    },
    [clips.length],
  );

  const replay = useCallback(() => {
    setProgress(0);
    setFinished(false);
    setIndex(0);
  }, []);

  // state=empty — 이 챌린지엔 올라온 클립이 없음(시안 #emptyView).
  if (clips.length === 0) {
    return (
      <section
        aria-label="영상 회고 스토리"
        // w-[calc(100%+2rem)]: -mx-4 full-bleed 폭을 명시 고정. WebKit(iOS Safari)는 flex item 에서
        // max-h 가 aspect-ratio 높이를 자르면 9/16 유지를 위해 폭을 height×9/16 로 역산해 좁은 좌측
        // 칼럼으로 붕괴한다(feedback e6693fe2). 폭을 definite 로 박으면 aspect-ratio 는 높이만 좌우한다.
        className="-mx-4 flex aspect-[9/16] max-h-[70vh] w-[calc(100%+2rem)] flex-col items-center justify-center gap-3 bg-black px-8 text-center"
      >
        <h2 className="t-h3 text-white">아직 영상이 없어요</h2>
        <p className="t-sub max-w-[260px] text-white/65">
          이 챌린지엔 올라온 3초 클립이 없어요. 인증이 쌓이면 자동으로 스토리가 만들어져요.
        </p>
      </section>
    );
  }

  const active = clips[index]!;

  return (
    <section
      aria-label="영상 회고 스토리"
      // w-[calc(100%+2rem)] 폭 고정 — empty 섹션과 동일 사유(WebKit aspect-ratio 폭 역산 붕괴 방지).
      className="relative -mx-4 aspect-[9/16] max-h-[70vh] w-[calc(100%+2rem)] overflow-hidden bg-black"
    >
      {finished ? (
        // 종료 화면(시안 #closing) — 합본 몽타주(fast-follow)는 EVAL-0046, 여기선 다시보기만.
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 px-8 text-center">
          <h2 className="t-h2 text-white">
            완성! {memberCount}명의 {durationDays}일
          </h2>
          <p className="t-sub text-white/70">{clips.length}개의 3초 클립을 모았어요</p>
          <button
            type="button"
            onClick={replay}
            className="rounded-full bg-white/15 px-6 py-3 text-sm font-semibold text-white backdrop-blur transition hover:bg-white/25"
          >
            처음부터 다시 보기
          </button>
        </div>
      ) : (
        <>
          <video
            key={active.id}
            src={active.signedUrl}
            autoPlay
            muted
            playsInline
            onTimeUpdate={(e) => {
              const v = e.currentTarget;
              if (v.duration > 0) setProgress(v.currentTime / v.duration);
            }}
            onEnded={() => goTo(index + 1)}
            className="absolute inset-0 h-full w-full object-cover"
          />

          {/* 밝은 클립 위에서도 헤더·진행바 가독성 보장(시안 .grad-top/.grad-bot). */}
          <div className="pointer-events-none absolute inset-x-0 top-0 z-[1] h-40 bg-gradient-to-b from-black/70 to-transparent" />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[1] h-48 bg-gradient-to-t from-black/70 to-transparent" />

          {/* 진행바 — 클립당 1개(시안 .bars). 지난 클립=full, 현재=재생 비율, 다음=empty. */}
          <div className="absolute inset-x-3 top-3 z-10 flex gap-1">
            {clips.map((c, i) => (
              <div key={c.id} className="h-[3px] flex-1 overflow-hidden rounded-full bg-white/30">
                <div
                  className="h-full bg-white"
                  style={{ width: `${i < index ? 100 : i === index ? progress * 100 : 0}%` }}
                />
              </div>
            ))}
          </div>

          {/* 작성자 헤더(시안 .s-head) */}
          <div className="absolute inset-x-4 top-7 z-10 flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/20 text-sm font-bold text-white">
              {initial(active.ownerDisplayName)}
            </span>
            <div className="leading-tight">
              <div className="text-sm font-semibold text-white">{active.ownerDisplayName}</div>
              <div className="text-xs text-white/70">{fmtDateTime(active.takenAt)}</div>
            </div>
          </div>

          {/* 탭 네비(시안 .tap l/r) — 좌=이전, 우=다음 */}
          <button
            type="button"
            aria-label="이전 클립"
            onClick={() => goTo(index - 1)}
            className="absolute inset-y-0 left-0 z-10 w-1/3"
          />
          <button
            type="button"
            aria-label="다음 클립"
            onClick={() => goTo(index + 1)}
            className="absolute inset-y-0 right-0 z-10 w-1/3"
          />
        </>
      )}
    </section>
  );
}
