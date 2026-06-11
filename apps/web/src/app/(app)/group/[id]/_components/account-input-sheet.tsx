"use client";

// ADR-0003 lazy 입력. 운영자가 그룹 설정/정산 prompt 에서 계좌를 추가/변경하는 sheet.
// 평문 accountNumber 는 submit 직후 setState("")로 메모리 제거. 서버에서 AES-256-GCM 암호화.

import { useId, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { BANK_CODES, BANK_NAMES, type BankCode } from "@withkey/domain";
import { FALLBACK_ERROR_MESSAGE, makeUserMessage } from "@/lib/actions/error-messages";
import { updateGroupAccount } from "../_actions";

interface AccountInputSheetProps {
  groupId: string;
  initialBankCode?: string | null;
  initialAccountHolder?: string | null;
  hasAccount: boolean;
  trigger?: React.ReactElement;
}

const userMessage = makeUserMessage({
  forbidden: "운영자만 계좌를 등록할 수 있어요.",
  invalid_input: "모든 필드를 정확히 입력해주세요.",
});

function isBankCode(value: string): value is BankCode {
  return (BANK_CODES as readonly string[]).includes(value);
}

export function AccountInputSheet({
  groupId,
  initialBankCode,
  initialAccountHolder,
  hasAccount,
  trigger,
}: AccountInputSheetProps) {
  const bankId = useId();
  const holderId = useId();
  const numberId = useId();
  const [open, setOpen] = useState(false);
  const [bankCode, setBankCode] = useState<BankCode | "">(
    initialBankCode && isBankCode(initialBankCode) ? initialBankCode : "",
  );
  const [accountHolder, setAccountHolder] = useState(initialAccountHolder ?? "");
  const [accountNumber, setAccountNumber] = useState("");
  const [pending, start] = useTransition();
  const isEdit = hasAccount;

  function submit() {
    if (!bankCode || !accountHolder.trim() || !/^[0-9]{8,16}$/.test(accountNumber)) {
      toast.error("모든 필드를 정확히 입력해주세요");
      return;
    }
    start(async () => {
      try {
        const res = await updateGroupAccount({
          groupId,
          bankCode,
          accountHolder: accountHolder.trim(),
          accountNumber,
        });
        if (!res.ok) {
          toast.error(userMessage(res.error));
          return;
        }
        toast.success("계좌 정보가 저장됐어요");
        setOpen(false);
        // 평문은 메모리 즉시 제거 — 서버에서 AES-256-GCM 암호화 완료.
        setAccountNumber("");
      } catch (err) {
        console.error("[AccountInputSheet] updateGroupAccount threw", err);
        toast.error(FALLBACK_ERROR_MESSAGE);
      }
    });
  }

  const defaultTrigger = (
    <button
      type="button"
      className="bg-primary text-primary-foreground rounded-full px-3 py-1.5 text-[12px] font-semibold transition-transform active:scale-95"
    >
      {isEdit ? "변경" : "추가"}
    </button>
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger ?? defaultTrigger} />
      <DialogContent className="max-h-[85svh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>정산용 계좌</DialogTitle>
          <DialogDescription>챌린지 종료 후 멤버들이 벌금을 송금할 계좌예요.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <label htmlFor={bankId} className="t-caption">
              은행
            </label>
            <Select
              id={bankId}
              value={bankCode}
              onValueChange={(v) => setBankCode(v && isBankCode(v) ? v : "")}
              items={BANK_NAMES}
            >
              <SelectTrigger>
                <SelectValue placeholder="선택" />
              </SelectTrigger>
              <SelectContent>
                {BANK_CODES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {BANK_NAMES[c]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor={holderId} className="t-caption">
              예금주
            </label>
            <Input
              id={holderId}
              value={accountHolder}
              onChange={(e) => setAccountHolder(e.target.value)}
              maxLength={30}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor={numberId} className="t-caption">
              계좌번호
            </label>
            <Input
              id={numberId}
              value={accountNumber}
              onChange={(e) => setAccountNumber(e.target.value.replace(/\D/g, ""))}
              inputMode="numeric"
              maxLength={16}
              placeholder="숫자만 8~16자리"
            />
            <p className="text-muted-foreground text-[10px]">
              계좌번호는 서버에서 암호화되어 저장돼요
            </p>
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button
            variant="ghost"
            size="lg"
            className="h-11 text-sm"
            onClick={() => setOpen(false)}
            disabled={pending}
          >
            취소
          </Button>
          <Button size="lg" className="h-11 text-sm" onClick={submit} disabled={pending}>
            {pending ? "저장 중..." : isEdit ? "변경 저장" : "계좌 추가"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
