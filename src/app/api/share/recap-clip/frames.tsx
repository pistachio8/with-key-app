import type { ReactElement } from "react";
import { CREAM, INK, SUBTEXT } from "@/app/api/og/recap-card/templates";

const W = 1080;
const H = 1350;

export function renderIntroFrame(groupName: string): ReactElement {
  return (
    <div
      style={{
        width: W,
        height: H,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: CREAM,
        fontFamily: "Pretendard",
      }}
    >
      <div style={{ display: "flex", fontSize: 30, letterSpacing: 4, color: SUBTEXT }}>
        from.with
      </div>
      <div
        style={{
          display: "flex",
          maxWidth: 880,
          textAlign: "center",
          fontSize: 84,
          fontWeight: 700,
          color: INK,
          marginTop: 24,
        }}
      >
        {groupName}
      </div>
    </div>
  );
}
