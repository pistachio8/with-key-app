// 마이페이지 약관·정책 그룹.

import Link from "next/link";
import { ChevronRight, FileText, Shield } from "lucide-react";
import { Card } from "@/components/ui/card";

const LINKS = [
  { href: "/legal/terms", label: "이용약관", icon: FileText },
  { href: "/legal/privacy", label: "개인정보처리방침", icon: Shield },
] as const;

export function LegalLinks() {
  return (
    <Card padding="none" className="overflow-hidden">
      <ul>
        {LINKS.map(({ href, label, icon: Icon }, i) => (
          <li key={href} className={i > 0 ? "border-border/60 border-t" : ""}>
            <Link
              href={href}
              className="hover:bg-muted/60 active:bg-muted focus-visible:bg-muted flex items-center gap-3 px-4 py-3.5 focus-visible:outline-none"
            >
              <Icon className="text-muted-foreground size-4" aria-hidden="true" />
              <span className="t-body flex-1">{label}</span>
              <ChevronRight className="text-muted-foreground size-4" aria-hidden="true" />
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}
