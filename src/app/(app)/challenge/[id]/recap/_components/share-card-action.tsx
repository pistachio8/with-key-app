// src/app/(app)/challenge/[id]/recap/_components/share-card-action.tsx
"use client";
import { useState } from "react";
import { toast } from "sonner";

type Template = "photo" | "ticket";
type Props = { challengeId: string; shareMessage: string };

async function shareCard(challengeId: string, template: Template, text: string): Promise<void> {
  const qs = new URLSearchParams({ challengeId, template });
  const res = await fetch(`/api/og/recap-card?${qs.toString()}`);
  if (!res.ok) throw new Error(`status ${res.status}`);
  const blob = await res.blob();
  const file = new File([blob], `recap-${challengeId}-${template}.png`, { type: "image/png" });

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

export function ShareCardAction({ challengeId, shareMessage }: Props) {
  const [template, setTemplate] = useState<Template>("photo");
  const [pending, setPending] = useState(false);

  async function onShare(): Promise<void> {
    if (pending) return;
    setPending(true);
    try {
      await shareCard(challengeId, template, shareMessage);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      toast.error("공유 카드 생성에 실패했어요. 다시 시도해 주세요.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mt-2 flex flex-col gap-2">
      <div
        className="bg-muted flex gap-1 rounded-full p-1"
        role="tablist"
        aria-label="공유 카드 종류"
      >
        {(["photo", "ticket"] as const).map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={template === t}
            onClick={() => setTemplate(t)}
            className={`flex-1 rounded-full py-2 text-[13px] font-semibold transition ${
              template === t ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
            }`}
          >
            {t === "photo" ? "사진형" : "티켓형"}
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={() => void onShare()}
        disabled={pending}
        className="bg-primary text-primary-foreground rounded-full py-3 text-[13px] font-semibold transition-transform active:scale-95 disabled:opacity-60"
      >
        {pending ? "카드 만드는 중..." : "공유하기"}
      </button>
    </div>
  );
}
