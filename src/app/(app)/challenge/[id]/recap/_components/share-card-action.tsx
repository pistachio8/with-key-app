// src/app/(app)/challenge/[id]/recap/_components/share-card-action.tsx
"use client";
import { toast } from "sonner";

type Props = { challengeId: string; shareMessage: string };

async function shareResult(message: string): Promise<void> {
  if (typeof navigator === "undefined") return;
  if (typeof navigator.share === "function") {
    try {
      await navigator.share({ title: "with-key 결과", text: message });
      return;
    } catch {
      return;
    }
  }
  try {
    await navigator.clipboard.writeText(message);
    toast.success("결과 메시지를 복사했어요");
  } catch {
    toast.error("공유에 실패했어요. 다시 시도해 주세요.");
  }
}

async function downloadCard(challengeId: string): Promise<void> {
  try {
    const res = await fetch(`/api/og/recap-card?challengeId=${challengeId}`);
    if (!res.ok) throw new Error(`status ${res.status}`);
    const blob = await res.blob();
    const file = new File([blob], `recap-${challengeId}.png`, { type: "image/png" });

    if (
      typeof navigator !== "undefined" &&
      typeof navigator.canShare === "function" &&
      navigator.canShare({ files: [file] }) &&
      typeof navigator.share === "function"
    ) {
      await navigator.share({ files: [file] });
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
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") return;
    toast.error("공유 카드 생성에 실패했어요.");
  }
}

export function ShareCardAction({ challengeId, shareMessage }: Props) {
  return (
    <div className="mt-2 flex gap-2">
      <button
        type="button"
        onClick={() => void shareResult(shareMessage)}
        className="border-border/60 bg-card flex-1 rounded-full border py-3 text-[13px] font-semibold transition-transform active:scale-95"
      >
        결과 공유
      </button>
      <button
        type="button"
        onClick={() => void downloadCard(challengeId)}
        className="bg-primary text-primary-foreground flex-1 rounded-full py-3 text-[13px] font-semibold transition-transform active:scale-95"
      >
        공유 카드 저장
      </button>
    </div>
  );
}
