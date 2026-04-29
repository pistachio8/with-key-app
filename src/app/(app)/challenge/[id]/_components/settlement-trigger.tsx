"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { SettlementSheet } from "./settlement-sheet";

type Props = { amount: number; memo?: string };

// Server Component (page.tsx) 에서 Client Component 로 넘어가는 얇은 boundary —
// useState 만 가져가고 데이터는 props 로 내려받음.
export function SettlementTrigger({ amount, memo }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>벌금 보내기</Button>
      <SettlementSheet open={open} onOpenChange={setOpen} amount={amount} memo={memo} />
    </>
  );
}
