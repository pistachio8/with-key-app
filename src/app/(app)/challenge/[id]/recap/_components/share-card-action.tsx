// src/app/(app)/challenge/[id]/recap/_components/share-card-action.tsx
"use client";
import { useState } from "react";
import { Check, Clapperboard, Image as ImageIcon, Play, Share2, Ticket } from "lucide-react";
import { toast } from "sonner";

type Template = "clip" | "photo" | "ticket";
type PreviewKind = "photo" | "ticket";
type Props = { challengeId: string; shareMessage: string; seed: number };

const FORMATS: ReadonlyArray<{ value: Template; label: string; Icon: typeof Clapperboard }> = [
  { value: "ticket", label: "티켓", Icon: Ticket },
  { value: "photo", label: "사진", Icon: ImageIcon },
  { value: "clip", label: "영상", Icon: Clapperboard },
];

const PREVIEW_KIND: Record<Template, PreviewKind> = {
  clip: "photo",
  photo: "photo",
  ticket: "ticket",
};

const PREVIEW_ALT: Record<PreviewKind, string> = {
  photo: "사진형 공유 카드 미리보기",
  ticket: "티켓형 공유 카드 미리보기",
};

function ogCardSrc(challengeId: string, kind: PreviewKind, seed: number): string {
  return `/api/og/recap-card?${new URLSearchParams({
    challengeId,
    template: kind,
    seed: String(seed),
  }).toString()}`;
}

async function shareCard(
  challengeId: string,
  template: Template,
  text: string,
  seed: number,
): Promise<void> {
  const isClip = template === "clip";
  const endpoint = isClip
    ? `/api/share/recap-clip?challengeId=${encodeURIComponent(challengeId)}&seed=${seed}`
    : `/api/og/recap-card?${new URLSearchParams({
        challengeId,
        template,
        seed: String(seed),
      }).toString()}`;
  const res = await fetch(endpoint);
  if (!res.ok) throw new Error(`status ${res.status}`);
  const blob = await res.blob();
  const file = new File([blob], `recap-${challengeId}-${template}.${isClip ? "mp4" : "png"}`, {
    type: isClip ? "video/mp4" : "image/png",
  });

  if (
    typeof navigator !== "undefined" &&
    typeof navigator.canShare === "function" &&
    navigator.canShare({ files: [file] }) &&
    typeof navigator.share === "function"
  ) {
    await navigator.share({ files: [file], text });
    return;
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function SharePreview({
  challengeId,
  seed,
  seen,
  template,
}: {
  challengeId: string;
  seed: number;
  seen: ReadonlySet<PreviewKind>;
  template: Template;
}) {
  const kind = PREVIEW_KIND[template];
  const [status, setStatus] = useState<Record<PreviewKind, "loading" | "loaded" | "error">>({
    photo: "loading",
    ticket: "loading",
  });

  return (
    <div
      className="bg-muted relative mx-auto w-[160px] overflow-hidden rounded-xl"
      style={{ aspectRatio: "4 / 5" }}
    >
      {status[kind] === "loading" && (
        // 크림 톤 shimmer — 배경 없는 pulse 가 '공백'으로 읽히던 문제 보완(D-B).
        <div
          data-testid="share-preview-skeleton"
          className="absolute inset-0 animate-pulse bg-gradient-to-br from-[#FAF6EF] to-[#EFE7D8]"
        />
      )}
      {status[kind] === "error" && (
        <div className="text-muted-foreground absolute inset-0 flex items-center justify-center px-3 text-center text-[11px]">
          미리보기를 불러오지 못했어요
        </div>
      )}
      {(["photo", "ticket"] as const).map((previewKind) =>
        seen.has(previewKind) ? (
          // eslint-disable-next-line @next/next/no-img-element -- same-origin OG 라우트 미리보기는 인증 쿠키 전달이 필요하다.
          <img
            key={previewKind}
            src={ogCardSrc(challengeId, previewKind, seed)}
            alt={PREVIEW_ALT[previewKind]}
            loading="lazy"
            decoding="async"
            onLoad={() => setStatus((prev) => ({ ...prev, [previewKind]: "loaded" }))}
            onError={() => setStatus((prev) => ({ ...prev, [previewKind]: "error" }))}
            // D-B: display:none(hidden) 대신 opacity 로 숨긴다 — hidden+lazy 는 영영 로드 안 됨.
            className={`absolute inset-0 size-full object-cover transition-opacity ${
              previewKind === kind && status[previewKind] === "loaded" ? "opacity-100" : "opacity-0"
            }`}
          />
        ) : null,
      )}
      {template === "clip" && status[kind] === "loaded" && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="absolute right-2 top-2 rounded bg-black/65 px-1.5 py-0.5 text-[10px] font-semibold text-white">
            MP4
          </span>
          <span className="flex size-9 items-center justify-center rounded-full bg-white/90 shadow">
            <Play
              className="text-foreground size-4 translate-x-px"
              fill="currentColor"
              aria-hidden="true"
            />
          </span>
        </div>
      )}
    </div>
  );
}

export function ShareCardAction({ challengeId, shareMessage, seed }: Props) {
  const [template, setTemplate] = useState<Template>("ticket");
  const [seenPreviewKinds, setSeenPreviewKinds] = useState<ReadonlySet<PreviewKind>>(
    () => new Set([PREVIEW_KIND.ticket]),
  );
  const [pending, setPending] = useState(false);

  async function onShare(): Promise<void> {
    if (pending) return;
    setPending(true);
    try {
      await shareCard(challengeId, template, shareMessage, seed);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      toast.error(
        template === "clip"
          ? "공유 영상 생성에 실패했어요. 다시 시도해 주세요."
          : "공유 카드 생성에 실패했어요. 다시 시도해 주세요.",
      );
    } finally {
      setPending(false);
    }
  }

  function selectTemplate(value: Template): void {
    setTemplate(value);
    const previewKind = PREVIEW_KIND[value];
    setSeenPreviewKinds((prev) => (prev.has(previewKind) ? prev : new Set(prev).add(previewKind)));
  }

  return (
    <div className="mt-2 flex flex-col gap-3">
      <SharePreview
        challengeId={challengeId}
        seed={seed}
        seen={seenPreviewKinds}
        template={template}
      />

      <div role="radiogroup" aria-label="공유 형식" className="mt-1 grid grid-cols-3 gap-2">
        {FORMATS.map(({ value, label, Icon }) => {
          const checked = template === value;
          return (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={checked}
              tabIndex={checked ? 0 : -1}
              onClick={() => selectTemplate(value)}
              className={`relative flex flex-col items-center gap-1.5 rounded-xl border-[1.5px] py-3 text-[13px] font-semibold transition-colors ${
                checked
                  ? "border-secondary bg-secondary text-secondary-foreground"
                  : "border-border/60 bg-card text-foreground/85 hover:bg-muted"
              }`}
            >
              {checked && (
                <span className="bg-foreground absolute right-1.5 top-1.5 flex size-4 items-center justify-center rounded-full">
                  <Check className="size-2.5 text-white" strokeWidth={3} aria-hidden="true" />
                </span>
              )}
              <Icon className="size-[22px]" aria-hidden="true" />
              {label}
            </button>
          );
        })}
      </div>

      <button
        type="button"
        onClick={() => void onShare()}
        disabled={pending}
        className="bg-primary text-primary-foreground flex items-center justify-center gap-1.5 rounded-xl py-3 text-[13px] font-semibold transition-transform active:scale-95 disabled:opacity-60"
      >
        <Share2 className="size-4" aria-hidden="true" />
        {pending ? (template === "clip" ? "영상 만드는 중..." : "카드 만드는 중...") : "공유하기"}
      </button>
    </div>
  );
}
