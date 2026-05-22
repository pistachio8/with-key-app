"use client";

import { useState } from "react";
import Image from "next/image";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { KudosEmoji } from "@/lib/validators/kudos";
import { KudosBar } from "./kudos-bar";

interface FeedCardProps {
  authorName: string;
  photoSignedUrl: string | null;
  summary: string;
  keywords: ReadonlyArray<string>;
  kudosByEmoji: Readonly<Partial<Record<KudosEmoji, number>>>;
  viewerKudos?: ReadonlyArray<KudosEmoji>;
  onKudos: (emoji: KudosEmoji) => void;
  disabled?: boolean;
  // 솔로(1명)면 Kudos footer 미렌더. 본인 인증에 본인 Kudos 금지 (PRD §7.3 AC-4) 호응.
  participantCount: number;
  // 자기 글이면 muted 톤 + "편집" 링크 (#25 보류 — UI만, 편집 동작은 추후 PO 확인)
  isSelfAuthor?: boolean;
  createdAtLabel?: string;
  dayNumber?: number | null;
  // 종료(closed) 또는 만기 도달(active+past end_at) — 본인 글 "편집" 링크 hide.
  isEnded?: boolean;
}

// 모킹업 §8-A `.feed-card` — header(아바타·이름·시간·DAY) + 16:9 photo + 태그 Chip + body + KudosBar.
export function FeedCard({
  authorName,
  photoSignedUrl,
  summary,
  keywords,
  kudosByEmoji,
  viewerKudos = [],
  onKudos,
  disabled = false,
  participantCount,
  isSelfAuthor = false,
  createdAtLabel,
  dayNumber = null,
  isEnded = false,
}: FeedCardProps) {
  const showKudos = participantCount >= 2;
  const [imageFailed, setImageFailed] = useState(false);
  const hasImage = Boolean(photoSignedUrl) && !imageFailed;

  function handleEditClick() {
    toast("편집 기능은 곧 열어드릴게요");
  }

  return (
    <article>
      <Card
        tone={isSelfAuthor ? "muted" : "default"}
        padding="sm"
        className={cn("flex flex-col gap-2", isSelfAuthor && "border-transparent")}
      >
        <header className="text-muted-foreground flex items-center gap-2 text-[11px]">
          <span
            aria-hidden="true"
            className={cn(
              "bg-brand-secondary-soft flex size-[18px] items-center justify-center rounded-full text-[11px]",
              isSelfAuthor && "bg-brand-secondary",
            )}
          >
            {authorName.slice(0, 1)}
          </span>
          <span className="text-foreground font-semibold">
            {authorName}
            {isSelfAuthor && " (나)"}
          </span>
          {createdAtLabel && <span>· {createdAtLabel}</span>}
          {isSelfAuthor && !isEnded ? (
            <button
              type="button"
              onClick={handleEditClick}
              className="focus-visible:ring-ring ml-auto rounded text-[10px] underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1"
            >
              편집
            </button>
          ) : dayNumber != null ? (
            <Chip tone="primary" className="ml-auto text-[10px]">
              DAY {dayNumber}
            </Chip>
          ) : null}
        </header>
        {hasImage && photoSignedUrl ? (
          <div className="relative aspect-[16/9] w-full overflow-hidden rounded-[10px]">
            <Image
              src={photoSignedUrl}
              alt={`${authorName}의 인증 사진`}
              fill
              sizes="(max-width: 640px) 100vw, 640px"
              className="object-cover"
              onError={() => setImageFailed(true)}
              unoptimized
            />
          </div>
        ) : photoSignedUrl ? (
          <div
            aria-label={`${authorName}의 인증 사진 없음`}
            role="img"
            className="from-muted to-muted/60 aspect-[16/9] w-full rounded-[10px] bg-gradient-to-br"
          />
        ) : null}
        {keywords.length > 0 && (
          <ul className="flex flex-wrap gap-1.5">
            {keywords.map((k) => (
              <li key={k}>
                <Chip tone="neutral" className="text-[10px]">
                  #{k}
                </Chip>
              </li>
            ))}
          </ul>
        )}
        <p className="t-body break-keep">{summary}</p>
        {showKudos ? (
          <KudosBar
            counts={kudosByEmoji}
            viewerKudos={viewerKudos}
            onToggle={onKudos}
            disabled={disabled}
          />
        ) : null}
      </Card>
    </article>
  );
}
