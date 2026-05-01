"use client";

import { useEffect, useId, useState, useTransition } from "react";
import {
  registerPushSubscription,
  unregisterPushSubscription,
  updateNotificationPrefs,
} from "@/app/(app)/settings/_actions";
import { isPushSupported, subscribeToPush, unsubscribeFromPush } from "@/lib/push/subscribe";
import type { NotificationPrefs } from "@/lib/validators/push";

type Props = {
  initialPrefs: NotificationPrefs;
  initialSubscribedEndpoint: string | null;
  vapidPublicKey: string;
};

export function PushSettings({ initialPrefs, initialSubscribedEndpoint, vapidPublicKey }: Props) {
  const [prefs, setPrefs] = useState<NotificationPrefs>(initialPrefs);
  const [subscribed, setSubscribed] = useState(!!initialSubscribedEndpoint);
  const [supported, setSupported] = useState<boolean | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [, start] = useTransition();

  useEffect(() => {
    // SSR 이 끝난 뒤에만 navigator/window 를 참조할 수 있어 effect 에서 1 회 해결한다.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSupported(isPushSupported());
  }, []);

  if (supported === null) {
    return (
      <section
        aria-labelledby="push-heading"
        className="bg-card flex flex-col gap-3 rounded-2xl border p-4"
      >
        <h2 id="push-heading" className="text-sm font-semibold">
          푸시 알림
        </h2>
        <p className="text-muted-foreground text-xs">지원 여부 확인 중…</p>
      </section>
    );
  }

  if (!supported) {
    return (
      <section
        aria-labelledby="push-unsupported"
        className="bg-card flex flex-col gap-2 rounded-2xl border p-4"
      >
        <h2 id="push-unsupported" className="text-sm font-semibold">
          푸시 알림
        </h2>
        <p className="text-muted-foreground text-xs">
          이 브라우저는 푸시 알림을 지원하지 않아요. 크롬/엣지/사파리 16.4+ 에서 다시 시도해 주세요.
        </p>
      </section>
    );
  }

  const ensureSubscription = async (): Promise<boolean> => {
    if (subscribed) return true;
    if (!vapidPublicKey) {
      setErrorMsg("알림 설정이 아직 준비되지 않았어요. 잠시 후 다시 시도해 주세요.");
      return false;
    }
    try {
      const sub = await subscribeToPush(vapidPublicKey);
      const res = await registerPushSubscription(sub);
      if (!res.ok) return false;
      setSubscribed(true);
      return true;
    } catch {
      return false;
    }
  };

  const dropSubscription = async (): Promise<void> => {
    const endpoint = await unsubscribeFromPush();
    if (endpoint) {
      await unregisterPushSubscription({ endpoint });
    }
    setSubscribed(false);
  };

  const handlePrefChange = (key: keyof NotificationPrefs, value: boolean) => {
    const prev = prefs;
    const next: NotificationPrefs = { ...prefs, [key]: value };
    setPrefs(next);
    setErrorMsg(null);
    start(async () => {
      const turningOn = value === true;
      const anyOn = next.start || next.deadline;
      if (turningOn && !subscribed) {
        const ok = await ensureSubscription();
        if (!ok) {
          setPrefs(prev);
          setErrorMsg("알림 권한을 받지 못했어요. 브라우저 설정을 확인해 주세요.");
          return;
        }
      }
      if (!anyOn && subscribed) {
        await dropSubscription();
      }
      const res = await updateNotificationPrefs(next);
      if (!res.ok) {
        setPrefs(prev);
        setErrorMsg("저장에 실패했어요. 잠시 후 다시 시도해 주세요.");
      }
    });
  };

  return (
    <section
      aria-labelledby="push-heading"
      className="bg-card flex flex-col gap-3 rounded-2xl border p-4"
    >
      <h2 id="push-heading" className="text-sm font-semibold">
        푸시 알림
      </h2>
      <Toggle
        label="시작 알림"
        description="모두 서명하면 챌린지 시작을 알려드려요"
        checked={prefs.start}
        onChange={(v) => handlePrefChange("start", v)}
      />
      <Toggle
        label="마감 임박 알림"
        description="마감 24시간 전"
        checked={prefs.deadline}
        onChange={(v) => handlePrefChange("deadline", v)}
      />
      <p className="text-muted-foreground text-xs">새벽 2~7시(KST)는 자동 차단돼요.</p>
      {errorMsg && (
        <p role="alert" className="text-destructive text-xs">
          {errorMsg}
        </p>
      )}
    </section>
  );
}

type ToggleProps = {
  label: string;
  description: string;
  checked: boolean;
  onChange: (value: boolean) => void;
};

function Toggle({ label, description, checked, onChange }: ToggleProps) {
  const id = useId();
  return (
    <label htmlFor={id} className="flex items-center justify-between gap-4">
      <span className="flex-1">
        <span className="block text-sm font-semibold">{label}</span>
        <span className="text-muted-foreground block text-xs">{description}</span>
      </span>
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        role="switch"
        aria-checked={checked}
        aria-label={label}
        className="accent-primary focus-visible:ring-ring size-6 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
      />
    </label>
  );
}
