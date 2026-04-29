"use client";

import { useId, useState } from "react";

// PRD §6.3 AC-6 · Design Brief §1.5 · 화면 9
export default function SettingsPage() {
  // TODO(Day 2): Supabase 에 user.notification_prefs JSON 저장. Web Push 구독도 배선.
  const [startNoti, setStartNoti] = useState(true);
  const [deadlineNoti, setDeadlineNoti] = useState(true);

  return (
    <div className="flex flex-col gap-6 p-4">
      <h1 className="text-xl font-semibold">설정</h1>

      <section
        aria-labelledby="push-heading"
        className="bg-card flex flex-col gap-3 rounded-2xl border p-4"
      >
        <h2 id="push-heading" className="text-sm font-semibold">
          푸시 알림
        </h2>
        <Toggle
          label="시작 알림"
          description="그룹원이 운동을 시작하면 알려드려요"
          checked={startNoti}
          onChange={setStartNoti}
        />
        <Toggle
          label="마감 임박 알림"
          description="이번 주 마감 24시간 전"
          checked={deadlineNoti}
          onChange={setDeadlineNoti}
        />
        <p className="text-muted-foreground text-xs">새벽 2~7시(KST)는 자동 차단돼요.</p>
      </section>
    </div>
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
        className="accent-primary focus-visible:ring-ring size-6 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
      />
    </label>
  );
}
