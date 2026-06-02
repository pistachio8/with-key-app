// 모킹업 §11-B — 정산 시점에 그룹 계좌 미설정이면 inline prompt.
// 운영자는 즉시 입력 sheet 진입. 멤버는 안내만.

import { Wallet } from "lucide-react";
import { Card } from "@/components/ui/card";
import { AccountInputSheet } from "@/app/(app)/group/[id]/_components/account-input-sheet";

interface AccountInlinePromptProps {
  groupId: string;
  isOwner: boolean;
  bankCode: string | null;
  accountHolder: string | null;
}

export function AccountInlinePrompt({
  groupId,
  isOwner,
  bankCode,
  accountHolder,
}: AccountInlinePromptProps) {
  return (
    <Card
      tone="muted"
      padding="lg"
      className="flex items-center gap-3 border-[var(--invite-line,#E5D8C2)] bg-white text-[var(--invite-muted,#5E4838)]"
    >
      <Wallet className="size-5 text-[var(--invite-accent,#B07A4D)]" aria-hidden="true" />
      <div className="flex-1">
        <div className="t-body font-semibold">정산용 계좌가 아직 없어요</div>
        <div className="t-sub">
          {isOwner
            ? "지금 계좌를 추가하면 정산할 수 있어요"
            : "운영자가 그룹 설정에서 계좌를 추가하면 정산할 수 있어요"}
        </div>
      </div>
      {isOwner && (
        <AccountInputSheet
          groupId={groupId}
          initialBankCode={bankCode}
          initialAccountHolder={accountHolder}
          hasAccount={false}
          trigger={
            <button
              type="button"
              className="bg-primary text-primary-foreground rounded-full px-3 py-1.5 text-[12px] font-semibold transition-transform active:scale-95"
            >
              지금 추가
            </button>
          }
        />
      )}
    </Card>
  );
}
