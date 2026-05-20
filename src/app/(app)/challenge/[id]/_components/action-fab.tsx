"use client";

// RSC → Client 경계에서 forwardRef 컴포넌트(Camera 등) 를 prop 으로 전달할 수 없으므로
// Fab 호출을 client wrapper 로 캡슐화. 각 segment page (server) 는 href 만 넘긴다.

import { Camera } from "lucide-react";
import { Fab } from "@/components/ui/fab";

interface ActionFabProps {
  href?: string;
}

export function ActionFab({ href }: ActionFabProps) {
  if (!href) return null;
  return (
    <Fab
      href={href}
      label="인증하기"
      icon={Camera}
      className="fixed bottom-6 left-1/2 z-20 -translate-x-1/2"
    />
  );
}
