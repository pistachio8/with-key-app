"use client";

import { useState } from "react";
import Image from "next/image";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { KudosEmoji } from "@withkey/domain";
import { KudosBar } from "./kudos-bar";
import { PeerRejectButton } from "./peer-reject-button";
import { Stamp } from "@/components/ui/stamp";

interface FeedCardProps {
  authorName: string;
  photoSignedUrl: string | null;
  summary: string;
  keywords: ReadonlyArray<string>;
  kudosByEmoji: Readonly<Partial<Record<KudosEmoji, number>>>;
  viewerKudos?: ReadonlyArray<KudosEmoji>;
  onKudos: (emoji: KudosEmoji) => void;
  // 🟨 익명 피어 반려(ADR-0038). 카운트만 — 누가 눌렀는지는 미노출. 본인 인증엔 미렌더(본인 반려 불가).
  peerRejectCount?: number;
  viewerRejected?: boolean;
  onPeerReject?: () => void;
  disabled?: boolean;
  // 솔로(1명)면 Kudos footer 미렌더. 본인 인증에 본인 Kudos 금지 (PRD §7.3 AC-4) 호응.
  participantCount: number;
  // 자기 글이면 muted 톤 + "편집" 링크 (#25 보류 — UI만, 편집 동작은 추후 PO 확인)
  isSelfAuthor?: boolean;
  createdAtLabel?: string;
  dayNumber?: number | null;
  // 종료(closed) 또는 만기 도달(active+past end_at) — 본인 글 "편집" 링크 hide.
  isEnded?: boolean;
  // 🟨 과반 반려로 무효 처리됨(ADR-0038). 우표 + 내용 톤다운 + 응원 차단.
  isPeerRejected?: boolean;
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
  peerRejectCount = 0,
  viewerRejected = false,
  onPeerReject,
  disabled = false,
  participantCount,
  isSelfAuthor = false,
  createdAtLabel,
  dayNumber = null,
  isEnded = false,
  isPeerRejected = false,
}: FeedCardProps) {
  // 무효(peer_rejected) 인증엔 응원 미렌더 — "거부된 인증에 응원" 모순 제거.
  const showKudos = participantCount >= 2 && !isPeerRejected;
  // 🟨 반려는 그룹(≥2)에서 타인 인증에만. 본인 인증은 반려 불가(미렌더). 종료 후에도 48h 내 가능(RPC 가 시간창 강제).
  const showPeerReject = participantCount >= 2 && !isSelfAuthor && onPeerReject != null;
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
        className={cn("relative flex flex-col gap-2", isSelfAuthor && "border-transparent")}
      >
        {isPeerRejected && (
          <>
            <span className="sr-only">그룹 반려로 무효 처리된 인증입니다</span>
            <Stamp label="반려" tone="danger" className="absolute right-2 top-2 z-10 size-14" />
          </>
        )}
        <div className={cn("flex flex-col gap-2", isPeerRejected && "opacity-55")}>
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
            {createdAtLabel && <span className="ml-auto whitespace-nowrap">{createdAtLabel}</span>}
            {isSelfAuthor && !isEnded ? (
              <button
                type="button"
                onClick={handleEditClick}
                className={cn(
                  "focus-visible:ring-ring rounded text-[10px] underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1",
                  !createdAtLabel && "ml-auto",
                )}
              >
                편집
              </button>
            ) : dayNumber != null ? (
              <Chip tone="primary" className={cn("text-[10px]", !createdAtLabel && "ml-auto")}>
                DAY {dayNumber}
              </Chip>
            ) : null}
          </header>
          {hasImage && photoSignedUrl ? (
            <div
              className={cn(
                "relative aspect-[16/9] w-full overflow-hidden rounded-[10px]",
                isPeerRejected && "grayscale",
              )}
            >
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
        </div>
        {showPeerReject && onPeerReject ? (
          // 🟨 익명 반려는 종료 후에도 48h 내 가능 → isEnded 로 disable 하지 않는다(RPC 가 시간창 강제).
          // 무효(peer_rejected) 후에도 토글(복원) 가능해야 하므로 톤다운 wrapper 밖에 또렷이 유지.
          <div className="mt-1 flex justify-end">
            <PeerRejectButton
              count={peerRejectCount}
              active={viewerRejected}
              onToggle={onPeerReject}
            />
          </div>
        ) : null}
      </Card>
    </article>
  );
}
