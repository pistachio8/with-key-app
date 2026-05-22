// src/app/(app)/challenge/[id]/recap/_components/settlement-account.tsx
import { BANK_NAMES, type BankCode } from "@/lib/bank/codes";

type Props = {
  bankCode: string | null;
  holder: string | null;
  last4: string | null;
};

function bankLabel(code: string): string {
  return (BANK_NAMES as Record<string, string>)[code as BankCode] ?? code;
}

export function SettlementAccount({ bankCode, holder, last4 }: Props) {
  if (!bankCode || !holder || !last4) return null;
  return (
    <section aria-label="정산 계좌" className="bg-[var(--invite-bg,#FAF6EF)] -mx-4 px-6 pb-6">
      <p className="mt-3 rounded-[10px] border border-[var(--invite-line,#E5D8C2)] bg-white px-3 py-2 text-center text-[11px] text-[var(--invite-muted,#5E4838)]">
        {bankLabel(bankCode)} · ***-****{last4} ·{" "}
        <span className="font-semibold text-[var(--invite-ink,#2A221C)]">{holder}</span>
      </p>
    </section>
  );
}
