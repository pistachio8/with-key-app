"use client";

import { useState } from "react";
import Image from "next/image";
import { KUDOS_EMOJIS, type KudosEmoji } from "@/lib/validators/kudos";

type Props = {
  authorName: string;
  photoSignedUrl: string | null;
  summary: string;
  keywords: ReadonlyArray<string>;
  kudosByEmoji: Readonly<Partial<Record<KudosEmoji, number>>>;
  onKudos: (emoji: KudosEmoji) => void;
  disabled?: boolean;
  // PR-2: 솔로 챌린지(1명)면 Kudos footer 미렌더. 본인 인증에 본인 Kudos 금지
  // (PRD §7.3 AC-4) 와 호응 — 솔로엔 응원 대상이 없음. 친구 합류로 ≥2 가
  // 되면 자동 노출 (과거 솔로 카드에도 소급 응원 가능).
  participantCount: number;
};

// PRD §7 · Design Brief 화면 6 — Kudos 3 이모지 피드 카드.
export function FeedCard({
  authorName,
  photoSignedUrl,
  summary,
  keywords,
  kudosByEmoji,
  onKudos,
  disabled = false,
  participantCount,
}: Props) {
  const showKudos = participantCount >= 2;
  // Chrome/Firefox can't decode HEIC — fall back to the no-photo placeholder
  // when <Image> fails to load so the card doesn't show a broken icon.
  const [imageFailed, setImageFailed] = useState(false);
  const hasImage = Boolean(photoSignedUrl) && !imageFailed;

  return (
    <article className="bg-card flex flex-col gap-3 rounded-2xl border p-4 shadow-sm">
      <header className="flex items-center gap-2">
        <span className="font-semibold">{authorName}</span>
      </header>
      <div className="relative aspect-square w-full overflow-hidden rounded-xl">
        {hasImage && photoSignedUrl ? (
          <Image
            src={photoSignedUrl}
            alt={`${authorName}의 인증 사진`}
            fill
            sizes="(max-width: 640px) 100vw, 640px"
            className="object-cover"
            onError={() => setImageFailed(true)}
            unoptimized
          />
        ) : (
          <div
            aria-label={`${authorName}의 인증 사진 없음`}
            role="img"
            className="from-muted to-muted/60 absolute inset-0 bg-gradient-to-br"
          />
        )}
      </div>
      <p className="text-sm leading-relaxed break-keep">{summary}</p>
      <ul className="text-muted-foreground flex flex-wrap gap-1.5 text-xs">
        {keywords.map((k) => (
          <li key={k} className="bg-muted rounded-full px-2 py-0.5">
            #{k}
          </li>
        ))}
      </ul>
      {showKudos ? (
        <footer className="flex gap-2">
          {KUDOS_EMOJIS.map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => onKudos(e)}
              disabled={disabled}
              aria-label={`${e} 응원 (${kudosByEmoji[e] ?? 0}개)`}
              className="bg-muted hover:bg-muted/80 focus-visible:ring-ring flex items-center gap-1 rounded-full px-3 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span aria-hidden="true">{e}</span>
              <span className="tabular-nums">{kudosByEmoji[e] ?? 0}</span>
            </button>
          ))}
        </footer>
      ) : null}
    </article>
  );
}
