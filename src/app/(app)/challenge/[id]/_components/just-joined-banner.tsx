// 모킹업 §7 흡수 — 별도 라우트 폐기, ?just_joined=1 진입 시 배너로 노출.

import { Card } from "@/components/ui/card";
import { Stamp } from "@/components/ui/stamp";

interface JustJoinedBannerProps {
  activated: boolean;
  totalSigned: number;
  totalMembers: number;
}

export function JustJoinedBanner({ activated, totalSigned, totalMembers }: JustJoinedBannerProps) {
  if (activated) {
    return (
      <Card tone="primary" padding="lg" className="flex items-center gap-4">
        <Stamp label="시작" tone="success" />
        <div>
          <div className="t-h3">챌린지 시작!</div>
          <div className="t-sub text-primary-foreground/85">
            전원 서명 완료 · 오늘부터 인증 시작
          </div>
        </div>
      </Card>
    );
  }
  return (
    <Card padding="lg" className="flex items-center gap-4">
      <Stamp label="참여" tone="primary" />
      <div>
        <div className="t-h3">참여 완료</div>
        <div className="t-sub">
          서명 {totalSigned}/{totalMembers} · 전원 서명 시 자동 시작돼요
        </div>
      </div>
    </Card>
  );
}
