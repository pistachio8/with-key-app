import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// base-ui Select 는 Portal 로 popup 을 body 에 렌더하므로 jsdom 환경에서
// popup 인터랙션은 e2e 에서 검증한다. 본 spec 은 trigger 외관(h-11 SoT) +
// placeholder + 컨트롤 가능 여부에 집중한다.
describe("Select", () => {
  it("Trigger 가 h-11 + Input 토큰을 차용 (border-input · rounded-lg)", () => {
    render(
      <Select>
        <SelectTrigger aria-label="은행 선택">
          <SelectValue placeholder="은행 선택" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="kb">국민은행</SelectItem>
        </SelectContent>
      </Select>,
    );
    const trigger = screen.getByLabelText("은행 선택");
    const cls = trigger.getAttribute("class") ?? "";
    expect(cls).toContain("h-11");
    expect(cls).toContain("rounded-lg");
    expect(cls).toContain("border-input");
    expect(cls).toContain("text-base");
    expect(cls).toContain("md:text-sm");
  });

  it("data-slot='select-trigger' 마커", () => {
    render(
      <Select>
        <SelectTrigger aria-label="은행 선택">
          <SelectValue placeholder="은행 선택" />
        </SelectTrigger>
      </Select>,
    );
    expect(screen.getByLabelText("은행 선택").getAttribute("data-slot")).toBe("select-trigger");
  });

  it("placeholder 텍스트가 Trigger 안에 노출", () => {
    render(
      <Select>
        <SelectTrigger aria-label="은행 선택">
          <SelectValue placeholder="은행 선택" />
        </SelectTrigger>
      </Select>,
    );
    expect(screen.getByLabelText("은행 선택").textContent).toContain("은행 선택");
  });

  it("items prop 으로 value→label 매핑 시 Trigger 가 label 표시", () => {
    // base-ui Select.Root 의 items prop 으로 value→label 사전을 주면
    // <Select.Value> 가 raw value 대신 label 을 렌더한다.
    render(
      <Select value="kb" items={{ kb: "국민은행", shinhan: "신한은행" }}>
        <SelectTrigger aria-label="은행 선택">
          <SelectValue placeholder="은행 선택" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="kb">국민은행</SelectItem>
          <SelectItem value="shinhan">신한은행</SelectItem>
        </SelectContent>
      </Select>,
    );
    expect(screen.getByLabelText("은행 선택").textContent).toContain("국민은행");
  });
});
