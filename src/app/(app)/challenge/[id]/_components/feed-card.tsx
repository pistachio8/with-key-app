"use client";

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
}: Props) {
  return (
    <article className="bg-card flex flex-col gap-3 rounded-2xl border p-4 shadow-sm">
      <header className="flex items-center gap-2">
        <span className="font-semibold">{authorName}</span>
      </header>
      <div className="relative aspect-square w-full overflow-hidden rounded-xl">
        {photoSignedUrl ? (
          <Image
            src={photoSignedUrl}
            alt={`${authorName}의 인증 사진`}
            fill
            sizes="(max-width: 640px) 100vw, 640px"
            className="object-cover"
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
    </article>
  );
}
