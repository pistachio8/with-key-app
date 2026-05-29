/* eslint-disable @next/next/no-img-element */
import type { ReactElement } from "react";
import { CREAM, INK, SUBTEXT, TERRA } from "@/app/api/og/recap-card/templates";

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

export function renderMontageFrame(photoUrl: string | null): ReactElement {
  return (
    <div
      style={{
        width: W,
        height: H,
        display: "flex",
        position: "relative",
        background: CREAM,
      }}
    >
      {photoUrl ? (
        <img alt="" src={photoUrl} width={W} height={H} style={{ objectFit: "cover" }} />
      ) : (
        <div style={{ display: "flex", width: W, height: H, background: TERRA }} />
      )}
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          background: "linear-gradient(180deg, rgba(42,34,28,0.10) 0%, rgba(42,34,28,0.34) 100%)",
        }}
      />
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
    </div>
  );
}
