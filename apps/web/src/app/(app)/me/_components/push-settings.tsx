"use client";

import { useEffect, useId, useState, useTransition } from "react";
import {
  clearMyPushSubscriptions,
  registerPushSubscription,
  updateNotificationPrefs,
} from "../_actions";
import {
  isPushSupported,
  syncBrowserSubscription,
  unsubscribeFromPush,
} from "@/lib/push/subscribe";
import type { NotificationPrefs } from "@withkey/domain";

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
    if (!vapidPublicKey) {
      setErrorMsg("알림 설정이 아직 준비되지 않았어요. 잠시 후 다시 시도해 주세요.");
      return false;
    }
    try {
      // 브라우저 PushManager 를 진실 원천으로 사용 — 기존 구독이 있으면 reuse(idempotent),
      // 없으면 새 subscribe. server `push_subscriptions` row 와 매 호출 시 자동 정합화되어
      // client `subscribed` state 가 stale (server 가 cleanup 했지만 mount 캐시가 남은 경우)
      // 인 상태에서도 토글 ON 우회를 차단한다.
      const sub = await syncBrowserSubscription(vapidPublicKey);
      const res = await registerPushSubscription(sub);
      if (!res.ok) return false;
      setSubscribed(true);
      return true;
    } catch {
      return false;
    }
  };

  const dropSubscription = async (): Promise<void> => {
    // browser unsubscribe 는 best-effort — 이미 만료됐거나 비어있어도 무관.
    // 서버 상태는 user_id 기준으로 전체 비워 누적을 방지한다.
    try {
      await unsubscribeFromPush();
    } catch {
      // noop
    }
    await clearMyPushSubscriptions();
    setSubscribed(false);
  };

  const handlePrefChange = (key: keyof NotificationPrefs, value: boolean) => {
    const prev = prefs;
    const next: NotificationPrefs = { ...prefs, [key]: value };
    setPrefs(next);
    setErrorMsg(null);
    start(async () => {
      const turningOn = value === true;
      const anyOn = next.start || next.deadline || next.kudos;
      // turn-on 클릭은 client subscribed state 와 무관하게 항상 ensureSubscription 을 호출.
      // syncBrowserSubscription 이 reuse-or-subscribe idempotent 라 매 호출 안전하고, server row
      // 가 비어 있던 경우(정합 깨짐) 도 토글 ON 한 번으로 자동 복원된다.
      if (turningOn) {
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
        label="그룹 활동 알림"
        description="챌린지 시작과 친구 인증을 알려드려요"
        checked={prefs.start}
        onChange={(v) => handlePrefChange("start", v)}
      />
      <Toggle
        label="마감 임박 알림"
        description="마감 24시간 전"
        checked={prefs.deadline}
        onChange={(v) => handlePrefChange("deadline", v)}
      />
      <Toggle
        label="응원 받음 알림"
        description="내 인증글에 응원이 달리면 알려드려요"
        checked={prefs.kudos}
        onChange={(v) => handlePrefChange("kudos", v)}
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
