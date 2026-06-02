import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";

import { Textarea } from "@/components/ui/textarea";

describe("Textarea", () => {
  it("default 로 min-h-11 + text-base 클래스 포함 (h-11 SoT)", () => {
    render(<Textarea placeholder="메모" />);
    const el = screen.getByPlaceholderText("메모");
    const cls = el.getAttribute("class") ?? "";
    expect(cls).toContain("min-h-11");
    expect(cls).toContain("text-base");
    expect(cls).toContain("md:text-sm");
  });

  it("호출처 className override 가능 (예: min-h-20 메모용)", () => {
    render(<Textarea placeholder="메모" className="min-h-20" />);
    const cls = screen.getByPlaceholderText("메모").getAttribute("class") ?? "";
    expect(cls).toContain("min-h-20");
  });

  it("controlled value + onChange 동작", () => {
    function Wrap() {
      const [v, setV] = useState("");
      return (
        <Textarea
          placeholder="메모"
          value={v}
          onChange={(e) => setV(e.target.value.slice(0, 100))}
        />
      );
    }
    render(<Wrap />);
    const el = screen.getByPlaceholderText("메모") as HTMLTextAreaElement;
    fireEvent.change(el, { target: { value: "오늘 운동 30분" } });
    expect(el.value).toBe("오늘 운동 30분");
  });

  it("data-slot='textarea' 마커 (디자인 시스템 식별자)", () => {
    render(<Textarea placeholder="메모" />);
    expect(screen.getByPlaceholderText("메모").getAttribute("data-slot")).toBe("textarea");
  });
});
