// 개발자에게 건의하기 진입점 — legal-links 와 동일한 행 스타일.

import Link from "next/link";
import { ChevronRight, MessageSquarePlus } from "lucide-react";
import { Card } from "@/components/ui/card";

export function FeedbackLink() {
  return (
    <Card padding="none" className="overflow-hidden">
      <Link
        href="/me/feedback"
        className="hover:bg-muted/60 active:bg-muted focus-visible:bg-muted flex items-center gap-3 px-4 py-3.5 focus-visible:outline-none"
      >
        <MessageSquarePlus className="text-muted-foreground size-4" aria-hidden="true" />
        <span className="t-body flex-1">개발자에게 건의하기</span>
        <ChevronRight className="text-muted-foreground size-4" aria-hidden="true" />
      </Link>
    </Card>
  );
}
