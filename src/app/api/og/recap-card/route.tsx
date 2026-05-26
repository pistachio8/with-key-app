// src/app/api/og/recap-card/route.ts
import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fetchRecap } from "@/lib/db/reads/recap";
import { BANK_NAMES, type BankCode } from "@/lib/bank/codes";

let fontCache: ArrayBuffer | null = null;
async function loadFont(): Promise<ArrayBuffer | null> {
  if (fontCache) return fontCache;
  try {
    const buf = await readFile(path.join(process.cwd(), "public/fonts/PretendardVariable.woff2"));
    fontCache = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
    return fontCache;
  } catch {
    return null;
  }
}

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const challengeId = url.searchParams.get("challengeId");
  if (!challengeId) return NextResponse.json({ error: "missing challengeId" }, { status: 400 });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const recap = await fetchRecap(user.id, { challengeId });
  if (!recap || recap.status !== "closed") {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const font = await loadFont();
  const bankLabel = recap.group?.bankCode
    ? ((BANK_NAMES as Record<string, string>)[recap.group.bankCode as BankCode] ??
      recap.group.bankCode)
    : null;

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        background: "#FAF6EF",
        color: "#2A221C",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "80px 64px",
      }}
    >
      {/* Satori: 모든 div 는 display: flex 필수. text-only div 도 명시. */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
        <div style={{ display: "flex", fontSize: 24, letterSpacing: 12, color: "#B07A4D" }}>
          WITH-KEY
        </div>
        <div style={{ display: "flex", fontSize: 28, marginTop: 24, color: "#5E4838" }}>
          {recap.group?.name ?? "우리 그룹"}
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 56,
            marginTop: 16,
            textAlign: "center",
            lineHeight: 1.2,
          }}
        >
          {recap.title}
        </div>
        <div style={{ display: "flex", fontSize: 24, marginTop: 24, color: "#5E4838" }}>
          그 {recap.durationDays}일의 기록
        </div>
      </div>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "16px 36px",
          justifyContent: "center",
          fontSize: 36,
        }}
      >
        {recap.members.map((m) => (
          <div key={m.id} style={{ display: "flex" }}>
            {m.displayName}
            {m.isMvp ? " ♛" : ""}
          </div>
        ))}
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          fontSize: 22,
          color: "#5E4838",
        }}
      >
        {bankLabel && recap.group?.accountNumberLast4 && (
          <div style={{ display: "flex" }}>
            {bankLabel} ***-****{recap.group.accountNumberLast4} · {recap.group.accountHolder}
          </div>
        )}
        <div style={{ display: "flex", color: "#B07A4D", marginTop: 8 }}>
          {recap.startAt?.slice(0, 10).replaceAll("-", " · ")} —{" "}
          {recap.endAt?.slice(5, 10).replace("-", " · ")}
        </div>
      </div>
    </div>,
    {
      width: 1080,
      height: 1080,
      fonts: font
        ? [{ name: "Pretendard", data: font, weight: 400, style: "normal" as const }]
        : undefined,
      headers: { "Cache-Control": "private, max-age=300" },
    },
  );
}
