// 마이페이지 프로필 헤더. 사용자 이니셜 + 이름 + 이메일 + 누적 챌린지 칩.

import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";

interface ProfileCardProps {
  displayName: string;
  email: string;
  joinedAt: string;
  challengeCount: number;
}

export function ProfileCard({ displayName, email, joinedAt, challengeCount }: ProfileCardProps) {
  const initial = displayName.slice(0, 1).toUpperCase();
  return (
    <Card padding="lg" className="flex items-center gap-4">
      <div className="bg-brand-primary-soft text-primary flex size-14 shrink-0 items-center justify-center rounded-full text-xl font-bold">
        {initial}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="t-h3 truncate">{displayName}</div>
        <div className="t-sub truncate">{email}</div>
        <div className="mt-1 flex items-center gap-1.5">
          <Chip tone="primary">{joinedAt}부터 함께</Chip>
          {challengeCount > 0 && <Chip tone="neutral">챌린지 {challengeCount}회</Chip>}
        </div>
      </div>
    </Card>
  );
}
