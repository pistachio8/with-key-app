import { NextResponse } from "next/server";

// 외부 콜백용 Route Handler만 /api/* 아래에 둔다. (쓰기는 Server Action 통일)
// PRD §6 Web Push 구독 등록은 Server Action에서 처리 — 여기는 향후 푸시 콜백 자리.
export async function GET() {
  return NextResponse.json({ ok: true });
}
