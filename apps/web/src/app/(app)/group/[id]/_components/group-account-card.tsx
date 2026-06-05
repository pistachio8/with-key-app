// ADR-0003 — 그룹 정산용 계좌 카드. 운영자만 입력/변경 sheet 접근.

import { Wallet, ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { BANK_NAMES, type BankCode } from "@/lib/bank/codes";
import { AccountInputSheet } from "./account-input-sheet";

interface GroupAccountCardProps {
  groupId: string;
  bankCode: string | null;
  accountHolder: string | null;
  accountNumberLast4: string | null;
  isOwner: boolean;
}

function bankLabel(code: string | null): string | null {
  if (!code) return null;
  return BANK_NAMES[code as BankCode] ?? code;
}

export function GroupAccountCard({
  groupId,
  bankCode,
  accountHolder,
  accountNumberLast4,
  isOwner,
}: GroupAccountCardProps) {
  const hasAccount = !!(bankCode && accountHolder && accountNumberLast4);

  if (!hasAccount) {
    return (
      <Card padding="lg" className="flex items-center gap-4">
        <div className="bg-brand-secondary-soft flex size-10 items-center justify-center rounded-full">
          <Wallet className="size-5" aria-hidden="true" />
        </div>
        <div className="flex flex-1 flex-col">
          <div className="t-h3">정산용 계좌가 아직 없어요</div>
          <div className="t-sub">
            {isOwner ? "챌린지 종료 후 정산에 사용해요" : "그룹 운영자가 추가할 수 있어요"}
          </div>
        </div>
        {isOwner && (
          <AccountInputSheet
            groupId={groupId}
            initialBankCode={bankCode}
            initialAccountHolder={accountHolder}
            hasAccount={false}
          />
        )}
      </Card>
    );
  }

  return (
    <Card padding="lg" className="flex items-center gap-4">
      <div className="bg-brand-primary-soft flex size-10 items-center justify-center rounded-full">
        <Wallet className="text-primary size-5" aria-hidden="true" />
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="t-h3 truncate">
          {accountHolder} · {bankLabel(bankCode)}
        </div>
        <div className="t-sub tabular-nums">****-****-{accountNumberLast4}</div>
      </div>
      {isOwner ? (
        <AccountInputSheet
          groupId={groupId}
          initialBankCode={bankCode}
          initialAccountHolder={accountHolder}
          hasAccount={true}
        />
      ) : (
        <ChevronRight className="text-muted-foreground size-5" aria-hidden="true" />
      )}
    </Card>
  );
}
