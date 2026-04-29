"use client";

import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import { toast } from "sonner";
import { Copy, Send } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import { buildKakaoPayLink } from "@/lib/kakaopay/link";
import { formatKRW } from "@/lib/challenge/penalty";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  amount: number;
  memo?: string;
};

type QrState =
  | { status: "loading" }
  | { status: "ready"; dataUrl: string }
  | { status: "failed" };

// PRD §11 주간 정산 · Design Brief §1.4 — 완곡 톤 유지.
// Kakaopay 실결제 연동은 BE_SCHEMA §13.2 로 이연.
export function SettlementSheet({ open, onOpenChange, amount, memo }: Props) {
  // buildKakaoPayLink 는 amount<=0 / host 오염 시 throw — useMemo 내부 throw 는 page crash 유발.
  // error state 로 흡수하고 안전한 fallback UI 렌더.
  const linkResult = useMemo((): { ok: true; link: string } | { ok: false; reason: string } => {
    try {
      return { ok: true, link: buildKakaoPayLink({ amount, memo }) };
    } catch (err) {
      console.error("[SettlementSheet] buildKakaoPayLink failed", err);
      return { ok: false, reason: err instanceof Error ? err.message : "unknown" };
    }
  }, [amount, memo]);

  const [qr, setQr] = useState<QrState>({ status: "loading" });

  useEffect(() => {
    if (!linkResult.ok) {
      setQr({ status: "failed" });
      return;
    }
    setQr({ status: "loading" });
    let cancelled = false;
    QRCode.toDataURL(linkResult.link, { margin: 1, width: 256 })
      .then((url) => {
        if (!cancelled) setQr({ status: "ready", dataUrl: url });
      })
      .catch((err) => {
        console.error("[SettlementSheet] QR generation failed", err);
        if (!cancelled) setQr({ status: "failed" });
      });
    return () => {
      cancelled = true;
    };
  }, [linkResult]);

  async function copyLink() {
    if (!linkResult.ok) {
      toast.error("링크 생성에 실패했어요.");
      return;
    }
    try {
      await navigator.clipboard.writeText(linkResult.link);
      toast.success("링크를 복사했어요");
    } catch {
      toast.error("복사에 실패했어요. 링크를 길게 눌러 직접 복사해주세요.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>벌금 보내기</DialogTitle>
          <DialogDescription>
            친구에게 카카오페이로{" "}
            <span className="font-semibold tabular-nums">{formatKRW(amount)}</span>{" "}
            을 보낼 수 있어요.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center gap-3">
          {qr.status === "ready" ? (
            // eslint-disable-next-line @next/next/no-img-element -- data: URL 은 next/image remotePatterns 불필요
            <img
              src={qr.dataUrl}
              alt="카카오페이 송금 QR 코드"
              className="bg-background h-48 w-48 rounded-xl border p-2"
            />
          ) : qr.status === "loading" ? (
            <div
              className="bg-muted h-48 w-48 animate-pulse rounded-xl"
              aria-hidden="true"
            />
          ) : (
            <p
              role="status"
              className="text-muted-foreground flex h-48 w-48 items-center justify-center rounded-xl border border-dashed p-4 text-center text-xs"
            >
              QR 생성에 실패했어요. 아래 링크를 이용해주세요.
            </p>
          )}
          {linkResult.ok ? (
            <p
              className="text-muted-foreground w-full truncate rounded-lg border bg-transparent px-3 py-2 text-center text-xs"
              title={linkResult.link}
            >
              {linkResult.link}
            </p>
          ) : (
            <p className="text-destructive w-full rounded-lg border px-3 py-2 text-center text-xs">
              송금 링크를 만들 수 없어요.
            </p>
          )}
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-col">
          {linkResult.ok ? (
            <a
              href={linkResult.link}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(buttonVariants({ size: "lg" }), "h-12 w-full gap-2")}
            >
              <Send className="size-4" aria-hidden="true" /> 카카오페이로 보내기
            </a>
          ) : (
            <Button size="lg" className="h-12 w-full gap-2" disabled>
              <Send className="size-4" aria-hidden="true" /> 카카오페이로 보내기
            </Button>
          )}
          <Button
            variant="outline"
            size="lg"
            className="h-12 w-full gap-2"
            onClick={copyLink}
            disabled={!linkResult.ok}
          >
            <Copy className="size-4" aria-hidden="true" /> 링크 복사
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
