"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

// 모킹업 §3-C sign-area. 손가락/펜 입력 → 캔버스 stroke. PNG dataURL 부모 전달.
// 서버에는 boolean 서명 사실만 기록(plan PR5 §5.1 Step 7b 정책).

interface PledgeSigningCanvasProps {
  onChange: (dataUrl: string | null) => void;
  className?: string;
}

export function PledgeSigningCanvas({ onChange, className }: PledgeSigningCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const [hasInk, setHasInk] = useState(false);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = c.getBoundingClientRect();
    c.width = rect.width * dpr;
    c.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#22262E";
  }, []);

  function getPoint(e: React.PointerEvent): { x: number; y: number } {
    const c = canvasRef.current;
    if (!c) return { x: 0, y: 0 };
    const rect = c.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function start(e: React.PointerEvent) {
    e.currentTarget.setPointerCapture(e.pointerId);
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const p = getPoint(e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    drawingRef.current = true;
  }
  function move(e: React.PointerEvent) {
    if (!drawingRef.current) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const p = getPoint(e);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    if (!hasInk) setHasInk(true);
  }
  function end() {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    const c = canvasRef.current;
    if (!c || !hasInk) return;
    onChange(c.toDataURL("image/png"));
  }
  function clear() {
    const c = canvasRef.current;
    if (!c) return;
    c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
    setHasInk(false);
    onChange(null);
  }

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <div className="flex items-center justify-between">
        <span className="t-caption">전자 서명</span>
        <button
          type="button"
          onClick={clear}
          disabled={!hasInk}
          className="t-sub focus-visible:ring-ring rounded hover:underline focus-visible:outline-none focus-visible:ring-2 disabled:opacity-40"
        >
          지우기
        </button>
      </div>
      <canvas
        ref={canvasRef}
        className="border-border bg-card h-24 w-full touch-none rounded-[10px] border"
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
        aria-label="전자 서명 캔버스"
        role="img"
      />
      <p className="text-muted-foreground text-[10px]">손가락 또는 펜으로 서명해주세요</p>
    </div>
  );
}
