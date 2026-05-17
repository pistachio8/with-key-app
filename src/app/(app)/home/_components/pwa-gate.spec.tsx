// src/app/(app)/home/_components/pwa-gate.spec.tsx
// @vitest-environment jsdom
import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/pwa/use-display-mode", () => ({
  useDisplayMode: vi.fn(),
}));
vi.mock("@/components/pwa/install-banner", () => ({
  InstallBanner: () => <div data-testid="install-banner" />,
}));
vi.mock("@/components/pwa/open-in-app-modal", () => ({
  OpenInAppModal: () => <div data-testid="open-in-app-modal" />,
}));

import { useDisplayMode } from "@/components/pwa/use-display-mode";
import { PwaGate } from "./pwa-gate";

const mockedHook = vi.mocked(useDisplayMode);

describe("PwaGate", () => {
  afterEach(() => {
    cleanup();
    mockedHook.mockReset();
  });

  it("mode=null (아직 측정 전) 이면 아무것도 렌더하지 않는다", () => {
    mockedHook.mockReturnValue({ mode: null, everInstalled: false });
    const { container } = render(<PwaGate />);
    expect(container.firstChild).toBeNull();
  });

  it("standalone 이면 아무것도 렌더하지 않는다", () => {
    mockedHook.mockReturnValue({ mode: "standalone", everInstalled: true });
    const { container } = render(<PwaGate />);
    expect(container.firstChild).toBeNull();
  });

  it("browser + everInstalled=true 면 OpenInAppModal 만 렌더", () => {
    mockedHook.mockReturnValue({ mode: "browser", everInstalled: true });
    render(<PwaGate />);
    expect(screen.getByTestId("open-in-app-modal")).toBeInTheDocument();
    expect(screen.queryByTestId("install-banner")).toBeNull();
  });

  it("browser + everInstalled=false 면 InstallBanner 만 렌더", () => {
    mockedHook.mockReturnValue({ mode: "browser", everInstalled: false });
    render(<PwaGate />);
    expect(screen.getByTestId("install-banner")).toBeInTheDocument();
    expect(screen.queryByTestId("open-in-app-modal")).toBeNull();
  });
});
