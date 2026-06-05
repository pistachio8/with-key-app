"use client";

// Next.js 16 의 layout.tsx 는 searchParams props 를 받지 못한다.
// layout 에서 ?just_joined / ?joined_late 같은 URL 의존 banner 를 표시하려면
// 이 client wrapper 가 useSearchParams 로 직접 읽어 visibility 를 결정한다.

import { useSearchParams } from "next/navigation";
import { Card } from "@/components/ui/card";
import { JustJoinedBanner } from "./just-joined-banner";

interface JustJoinedSlotProps {
  totalSigned: number;
  totalMembers: number;
}

export function JustJoinedBannerSlot({ totalSigned, totalMembers }: JustJoinedSlotProps) {
  const sp = useSearchParams();
  if (sp.get("just_joined") !== "1") return null;
  return (
    <JustJoinedBanner
      activated={sp.get("activated") === "1"}
      totalSigned={totalSigned}
      totalMembers={totalMembers}
    />
  );
}

export function JoinedLateCard() {
  const sp = useSearchParams();
  if (sp.get("joined_late") !== "1") return null;
  return (
    <Card padding="sm" className="bg-muted/50 border-transparent">
      <p className="text-muted-foreground break-keep text-xs">
        이미 시작된 챌린지예요. 그룹에는 합류했고, 다음 챌린지부터 함께할 수 있어요.
      </p>
    </Card>
  );
}
