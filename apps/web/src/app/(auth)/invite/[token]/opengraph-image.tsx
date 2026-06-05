import { ImageResponse } from "next/og";
import { headers } from "next/headers";
import { fetchInvitePreview } from "@/lib/db/reads/invite";

// spec 2026-05-17-invite-og-preview C4 — 풀블리드 1200×630 OG (KakaoTalk 카드).
// 단일 템플릿: null/expired/full 도 폴백 데이터로 같은 레이아웃 렌더.
// 벌금·인원수는 의도적으로 제외 — OG 노출 최소화.
export const runtime = "edge";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "from. with 초대 카드";

type Params = { token: string };

const GRADIENT = "linear-gradient(135deg, #8AA4FF 0%, #BCA6FF 50%, #FFB6C6 100%)";

export default async function Image({ params }: { params: Promise<Params> }) {
  const { token } = await params;
  const preview = await fetchInvitePreview(token);

  const groupLabel = preview?.groupName ?? "친구";
  const challenge = preview?.pendingChallenge ?? null;
  const metaLine = challenge
    ? `${challenge.title} · ${challenge.durationDays}일 · 주 ${challenge.goalCount}회`
    : null;

  // Pretendard Variable 폰트 로딩 — Turbopack 이 import.meta.url 로 /public 경로를
  // 추적하지 못해, runtime 에 같은 origin 의 정적 자산을 fetch 한다. host 는
  // 프록시/리버스프록시 환경(X-Forwarded-*) 까지 고려해 합성.
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const fontData = await fetch(`${proto}://${host}/fonts/PretendardVariable.woff2`).then((res) =>
    res.arrayBuffer(),
  );

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "72px 88px",
        background: GRADIENT,
        color: "#FFFFFF",
        fontFamily: "Pretendard",
      }}
    >
      <div
        style={{
          fontSize: 28,
          fontWeight: 800,
          letterSpacing: "0.08em",
          opacity: 0.95,
        }}
      >
        FROM. WITH
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 24,
        }}
      >
        <div
          style={{
            fontSize: 96,
            fontWeight: 800,
            lineHeight: 1.15,
            letterSpacing: "-0.02em",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <span>{groupLabel}이 같이</span>
          <span>운동하자고 해요</span>
        </div>

        {metaLine ? (
          <div
            style={{
              fontSize: 32,
              fontWeight: 500,
              opacity: 0.92,
            }}
          >
            {metaLine}
          </div>
        ) : null}
      </div>
    </div>,
    {
      ...size,
      fonts: [
        {
          name: "Pretendard",
          data: fontData,
          style: "normal",
          weight: 700,
        },
      ],
      headers: {
        // C6 — 토큰이 unique key 라 적극 캐싱. TTL 72h 대비 s-maxage 1일 충분.
        "Cache-Control": "public, max-age=3600, s-maxage=86400",
      },
    },
  );
}
