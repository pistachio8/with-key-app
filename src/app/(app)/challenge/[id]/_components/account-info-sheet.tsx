"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Copy } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { BANK_NAMES, type BankCode } from "@/lib/bank/codes";
import { maskAccountNumber } from "@/lib/bank/format";
import { FALLBACK_ERROR_MESSAGE, makeUserMessage } from "@/lib/actions/error-messages";
import { revealAccountNumber } from "../_actions";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groupId: string;
  bankCode: string | null;
  accountHolder: string | null;
  accountNumberLast4: string | null;
};

const userMessage = makeUserMessage({
  not_found: "오너가 아직 계좌를 등록하지 않았어요.",
});

function bankDisplay(code: string | null): string | null {
  if (!code) return null;
  return BANK_NAMES[code as BankCode] ?? code;
}

// D-016: 정산 계좌 뷰. 기본은 마스킹된 last4 + 은행·예금주 표시. 복사 버튼 클릭 시
// Server Action 으로 암호문을 복호화해서 평문을 받아 즉시 clipboard 에 복사.
export function AccountInfoSheet({
  open,
  onOpenChange,
  groupId,
  bankCode,
  accountHolder,
  accountNumberLast4,
}: Props) {
  const [copying, setCopying] = useState(false);

  const hasAccount =
    bankCode !== null && accountHolder !== null && accountNumberLast4 !== null;
  const bankLabel = bankDisplay(bankCode);
  const masked = accountNumberLast4 ? maskAccountNumber(accountNumberLast4) : null;

  async function copy() {
    setCopying(true);
    try {
      const res = await revealAccountNumber({ groupId });
      if (!res.ok) {
        toast.error(userMessage(res.error));
        return;
      }
      try {
        await navigator.clipboard.writeText(res.data.accountNumber);
        toast.success("계좌번호가 복사되었어요");
      } catch {
        toast.error("복사에 실패했어요. 다시 시도해 주세요.");
      }
    } catch (err) {
      console.error("[AccountInfoSheet] revealAccountNumber threw", err);
      toast.error(FALLBACK_ERROR_MESSAGE);
    } finally {
      setCopying(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>정산 계좌</DialogTitle>
          <DialogDescription>
            벌금을 이 계좌로 보내주세요. 복사 버튼을 누르면 계좌번호가 클립보드에 복사됩니다.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3 py-2">
          {hasAccount ? (
            <>
              <p className="text-muted-foreground text-xs">은행 · 예금주</p>
              <p className="text-base font-semibold">
                {bankLabel} · {accountHolder}
              </p>
              <p className="text-muted-foreground mt-2 text-xs">계좌번호</p>
              <p className="font-mono text-base font-semibold tracking-wider">{masked}</p>
            </>
          ) : (
            <p
              role="status"
              className="text-muted-foreground rounded-xl border border-dashed p-4 text-center text-sm"
            >
              오너가 아직 계좌를 등록하지 않았어요.
            </p>
          )}
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <Button
            size="lg"
            className="h-12 w-full gap-2"
            onClick={copy}
            disabled={!hasAccount || copying}
          >
            <Copy className="size-4" aria-hidden="true" />
            {copying ? "복사 중..." : "계좌번호 복사"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
