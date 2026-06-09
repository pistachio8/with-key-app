// src/lib/challenge/resolve-verify-target.spec.ts
import { describe, it, expect } from "vitest";
import { resolveVerifyTarget } from "./resolve-verify-target";

const a = (id: string) => ({ id, title: `챌린지 ${id}`, groupName: null });

describe("resolveVerifyTarget", () => {
  it("현재 챌린지가 active 목록에 있으면 그 챌린지 action 으로 navigate", () => {
    expect(resolveVerifyTarget("c2", [a("c1"), a("c2")])).toEqual({
      kind: "navigate",
      href: "/challenge/c2/action",
    });
  });

  it("active 0개면 none", () => {
    expect(resolveVerifyTarget(null, [])).toEqual({ kind: "none" });
  });

  it("active 1개면(현재 챌린지 아님) 그 1개로 navigate", () => {
    expect(resolveVerifyTarget(null, [a("c9")])).toEqual({
      kind: "navigate",
      href: "/challenge/c9/action",
    });
  });

  it("active 2개+ 이고 현재 챌린지가 목록에 없으면 picker", () => {
    expect(resolveVerifyTarget("other", [a("c1"), a("c2")])).toEqual({ kind: "picker" });
  });

  it("현재 챌린지가 목록에 없고 active 1개면 그 1개로 navigate", () => {
    expect(resolveVerifyTarget("not-active", [a("c1")])).toEqual({
      kind: "navigate",
      href: "/challenge/c1/action",
    });
  });
});
