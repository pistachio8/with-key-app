// src/app/(app)/challenge/[id]/recap/_components/account-copy-button.tsx
"use client";

import { Copy } from "lucide-react";
import { useCopyAccountNumber } from "../../_components/use-copy-account-number";

// 정산 영수증 ACCOUNT 줄 인라인 텍스트 버튼 — 탭 1회로 전체 계좌번호 복사.
export function AccountCopyButton({ groupId }: { groupId: string }) {
  const { copy, copying } = useCopyAccountNumber(groupId);
  return (
    <button
      type="button"
      onClick={copy}
      disabled={copying}
      className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--invite-accent,#B07A4D)] underline-offset-2 hover:underline disabled:opacity-60"
    >
      <Copy className="size-3" aria-hidden="true" />
      {copying ? "복사 중..." : "계좌번호 복사"}
    </button>
  );
}
