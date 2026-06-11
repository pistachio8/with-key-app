// 마이페이지 알림 설정 — PushSettings 를 Card + Bell 헤더로 래핑.

import { Bell } from "lucide-react";
import { Card } from "@/components/ui/card";
import { PushSettings } from "./push-settings";
import type { NotificationPrefs } from "@withkey/domain";

interface NotificationCardProps {
  initialPrefs: NotificationPrefs;
  initialSubscribedEndpoint: string | null;
  vapidPublicKey: string;
}

export function NotificationCard(props: NotificationCardProps) {
  return (
    <Card padding="lg" className="flex flex-col gap-3">
      <header className="flex items-center gap-2">
        <Bell className="text-primary size-4" aria-hidden="true" />
        <h3 className="t-h3">알림 설정</h3>
      </header>
      <PushSettings {...props} />
    </Card>
  );
}
