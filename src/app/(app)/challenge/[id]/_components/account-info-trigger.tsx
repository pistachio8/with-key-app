"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { AccountInfoSheet } from "./account-info-sheet";

type Props = {
  groupId: string;
  bankCode: string | null;
  accountHolder: string | null;
  accountNumberLast4: string | null;
};

// Server Component (page.tsx) 에서 Client Component 로 넘어가는 얇은 boundary —
// useState 만 가져가고 데이터는 props 로 내려받음.
export function AccountInfoTrigger(props: Props) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>계좌 보기</Button>
      <AccountInfoSheet open={open} onOpenChange={setOpen} {...props} />
    </>
  );
}
