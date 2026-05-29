/* eslint-disable @next/next/no-img-element */
import type { ReactElement } from "react";

export type CardData = {
  groupName: string;
  period: string;
  doneCount: number;
  crew: number;
  heroUrl: string | null;
  allAchieved: boolean;
};

const CREAM = "#FAF6EF";
const INK = "#2A221C";
const TERRA = "#C2683D";
const SUB = "#5E4838";
const SUBTEXT = "#8E8579";
const DASHLINE = "#C9C0B0";

function wordmark(): ReactElement {
  return (
    <div
      style={{
        position: "absolute",
        top: 40,
        left: 44,
        display: "flex",
        fontSize: 26,
        letterSpacing: 3,
        color: "#fff",
        background: "rgba(0,0,0,0.32)",
        padding: "10px 22px",
        borderRadius: 999,
      }}
    >
      from.with
    </div>
  );
}

function photoOverlay(): ReactElement {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        background:
          "linear-gradient(180deg, rgba(42,34,28,0.12) 0%, rgba(42,34,28,0.04) 54%, rgba(42,34,28,0.34) 100%)",
      }}
    />
  );
}

export function renderPhotoCard(d: CardData): ReactElement {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        background: CREAM,
        fontFamily: "Pretendard",
      }}
    >
      <div style={{ display: "flex", position: "relative", width: 1080, height: 1110 }}>
        {d.heroUrl ? (
          <img alt="" src={d.heroUrl} width={1080} height={1110} style={{ objectFit: "cover" }} />
        ) : (
          <div style={{ display: "flex", width: "100%", height: "100%", background: TERRA }} />
        )}
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            background: "rgba(194,104,61,0.16)",
          }}
        />
        {photoOverlay()}
        {wordmark()}
        {d.allAchieved ? (
          <div
            style={{
              position: "absolute",
              top: 40,
              right: 44,
              display: "flex",
              fontSize: 26,
              fontWeight: 700,
              color: "#fff",
              background: TERRA,
              padding: "10px 22px",
              borderRadius: 999,
            }}
          >
            전원 달성
          </div>
        ) : null}
        <div
          style={{
            position: "absolute",
            left: 56,
            bottom: 46,
            display: "flex",
            flexDirection: "column",
            gap: 10,
            color: "#fff",
          }}
        >
          <div style={{ display: "flex", fontSize: 34, letterSpacing: 6 }}>ROUTINE TRACE</div>
          <div style={{ display: "flex", fontSize: 82, fontWeight: 700, lineHeight: 1.02 }}>
            {d.doneCount} DAYS
          </div>
        </div>
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          flex: 1,
          justifyContent: "center",
          padding: "0 60px",
          gap: 18,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", fontSize: 54, fontWeight: 700, color: INK }}>
            {d.groupName}
          </div>
          <div style={{ display: "flex", fontSize: 38, fontWeight: 700, color: TERRA }}>
            {d.period}
          </div>
        </div>
        <div style={{ display: "flex", fontSize: 34, color: SUB }}>
          {d.doneCount}일 인증 · {d.crew}명 함께
        </div>
      </div>
    </div>
  );
}

function field(label: string, value: string, color: string): ReactElement {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", fontSize: 22, letterSpacing: 4, color: SUBTEXT }}>{label}</div>
      <div style={{ display: "flex", fontSize: 46, fontWeight: 700, color }}>{value}</div>
    </div>
  );
}

function barcode(): ReactElement {
  const bars = [10, 4, 16, 6, 6, 18, 8, 12, 4, 20, 6, 10, 14, 4, 16, 8];
  return (
    <div style={{ display: "flex", gap: 6, alignItems: "flex-end", height: 60 }}>
      {bars.map((w, i) => (
        <div key={i} style={{ display: "flex", width: w, height: 60, background: INK }} />
      ))}
    </div>
  );
}

export function renderTicketCard(d: CardData): ReactElement {
  const dashes = Array.from({ length: 24 }, (_, i) => (
    <div
      key={i}
      style={{ display: "flex", width: 18, height: 3, borderRadius: 3, background: DASHLINE }}
    />
  ));

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        background: "#FBF7EF",
        fontFamily: "Pretendard",
      }}
    >
      <div style={{ display: "flex", height: 1090, padding: 64, gap: 48 }}>
        <div
          style={{
            display: "flex",
            position: "relative",
            width: 380,
            borderRadius: 28,
            overflow: "hidden",
          }}
        >
          {d.heroUrl ? (
            <img alt="" src={d.heroUrl} width={380} height={962} style={{ objectFit: "cover" }} />
          ) : (
            <div style={{ display: "flex", width: 380, height: 962, background: TERRA }} />
          )}
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            flex: 1,
            justifyContent: "center",
            gap: 48,
          }}
        >
          {field("ROUTINE", d.groupName, INK)}
          {field("PERIOD", d.period, TERRA)}
          {field("CREW", `${d.crew}명 함께`, INK)}
          {d.allAchieved ? field("RESULT", "전원 달성", TERRA) : null}
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "0 40px" }}>
        <div
          style={{ display: "flex", width: 16, height: 16, borderRadius: 16, background: DASHLINE }}
        />
        <div style={{ display: "flex", flex: 1, justifyContent: "space-between" }}>{dashes}</div>
        <div
          style={{ display: "flex", width: 16, height: 16, borderRadius: 16, background: DASHLINE }}
        />
      </div>
      <div
        style={{
          display: "flex",
          flex: 1,
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 64px",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontSize: 24, letterSpacing: 4, color: SUBTEXT }}>
            인증
          </div>
          <div style={{ display: "flex", fontSize: 110, fontFamily: "Anton", color: TERRA }}>
            {d.doneCount}일
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 12 }}>
          {barcode()}
          <div style={{ display: "flex", fontSize: 24, letterSpacing: 3, color: SUBTEXT }}>
            from.with
          </div>
        </div>
      </div>
    </div>
  );
}
