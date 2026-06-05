// src/app/(app)/home/_components/pwa-gate.tsx
"use client";

import { useDisplayMode } from "@/components/pwa/use-display-mode";
import { InstallBanner } from "@/components/pwa/install-banner";
import { OpenInAppModal } from "@/components/pwa/open-in-app-modal";

export function PwaGate() {
  const { mode, everInstalled } = useDisplayMode();
  if (mode === null) return null;
  if (mode === "standalone") return null;
  if (everInstalled) return <OpenInAppModal />;
  return <InstallBanner />;
}
