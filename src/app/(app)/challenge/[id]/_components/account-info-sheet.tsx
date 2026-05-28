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
import type { ErrorCode } from "@/lib/actions/response";
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

  const hasAccount = bankCode !== null && accountHolder !== null && accountNumberLast4 !== null;
  const bankLabel = bankDisplay(bankCode);
  const masked = accountNumberLast4 ? maskAccountNumber(accountNumberLast4) : null;

  function copy() {
    setCopying(true);

    // reveal 결과를 promise 바깥에 기록 — clipboard write 의 reject 사유 전파에 의존하지 않고
    // 3갈래(액션 실패 / 액션 throw / clipboard 실패) 토스트를 정확히 구분하기 위함.
    let revealError: ErrorCode | null = null;
    let revealThrew = false;

    const text = revealAccountNumber({ groupId }).then(
      (res) => {
        if (!res.ok) {
          revealError = res.error;
          throw new Error("reveal-failed");
        }
        return res.data.accountNumber;
      },
      (err) => {
        revealThrew = true;
        console.error("[AccountInfoSheet] revealAccountNumber threw", err);
        throw err;
      },
    );

    const finish = (write: Promise<unknown>) =>
      write
        .then(() => toast.success("계좌번호가 복사되었어요"))
        .catch((err) => {
          if (revealError) {
            toast.error(userMessage(revealError));
          } else if (revealThrew) {
            toast.error(FALLBACK_ERROR_MESSAGE);
          } else {
            console.error("[AccountInfoSheet] clipboard write failed", err);
            toast.error("복사에 실패했어요. 다시 시도해 주세요.");
          }
        })
        .finally(() => setCopying(false));

    // iOS Safari/PWA: transient user activation 을 유지하려면 write() 를 제스처 핸들러 안에서
    // 동기 호출해야 한다 — ClipboardItem 에 넘긴 Promise 가 나중에 resolve 돼도 활성화가 유지된다.
    // 기존처럼 await revealAccountNumber() 뒤에 writeText 하면 네트워크 await 가 활성화를 소비해
    // iOS 가 NotAllowedError 로 거부한다.
    if (typeof ClipboardItem !== "undefined" && typeof navigator.clipboard?.write === "function") {
      try {
        const blob = text.then((n) => new Blob([n], { type: "text/plain" }));
        blob.catch(() => {}); // 구형 Chrome 생성자 throw 시 orphan unhandled rejection 방지
        finish(navigator.clipboard.write([new ClipboardItem({ "text/plain": blob })]));
        return;
      } catch {
        // 구형 Chrome(76–115): ClipboardItem 은 있으나 Promise 값을 거부(생성자 throw) → 구 경로로.
      }
    }

    // 구 경로 (Firefox<127 · 비-secure context · 데스크톱 비엄격): reveal 후 writeText.
    finish(text.then((n) => navigator.clipboard.writeText(n)));
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85svh] overflow-y-auto sm:max-w-sm">
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
            className="h-11 w-full gap-2"
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
