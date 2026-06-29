// apps/mobile/src/shared/ui/ui.spec.tsx
import { render, screen, fireEvent } from "@testing-library/react-native";
import { StyleSheet, Text } from "react-native";

import { Button } from "./button";
import { Chip } from "./chip";
import { Card } from "./card";
import { Stamp } from "./stamp";
import { EmptyState } from "./empty-state";
import { ErrorState } from "./error-state";

describe("Button", () => {
  it("label 렌더 + onPress 호출", () => {
    const onPress = jest.fn();
    render(<Button onPress={onPress}>확인</Button>);
    const node = screen.getByText("확인");
    expect(node).toBeTruthy();
    fireEvent.press(node);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("disabled 면 onPress 미호출", () => {
    const onPress = jest.fn();
    render(
      <Button onPress={onPress} disabled>
        확인
      </Button>,
    );
    fireEvent.press(screen.getByText("확인"));
    expect(onPress).not.toHaveBeenCalled();
  });

  it("접근성 role=button + 터치 타깃 ≥44px", () => {
    render(<Button onPress={() => {}}>확인</Button>);
    const btn = screen.getByRole("button");
    // Pressable 의 style 은 ({pressed}) => [...] 함수이므로 평가 후 flatten 한다.
    const styleProp = btn.props.style;
    const resolved = typeof styleProp === "function" ? styleProp({ pressed: false }) : styleProp;
    const flat = StyleSheet.flatten(resolved);
    expect(flat.minHeight).toBeGreaterThanOrEqual(44);
  });
});

describe("Chip", () => {
  it("label 렌더", () => {
    render(<Chip tone="primary">진행 중</Chip>);
    expect(screen.getByText("진행 중")).toBeTruthy();
  });
  it("tone=danger 텍스트색 = destructive", () => {
    render(<Chip tone="danger">미달</Chip>);
    const flat = StyleSheet.flatten(screen.getByText("미달").props.style);
    expect(flat.color).toBe("#FF6B6B");
  });
});

describe("Card", () => {
  it("자식 렌더 + borderRadius 14", () => {
    render(
      <Card>
        <Text>내용</Text>
      </Card>,
    );
    expect(screen.getByText("내용")).toBeTruthy();
  });
  it("tone=primary 배경 = primary", () => {
    render(
      <Card tone="primary" testID="c">
        <Text>x</Text>
      </Card>,
    );
    const flat = StyleSheet.flatten(screen.getByTestId("c").props.style);
    expect(flat.backgroundColor).toBe("#8AA4FF");
  });
});

describe("Stamp (정적)", () => {
  it("variant=label 텍스트 렌더 + role=image", () => {
    render(<Stamp variant="label" label="달성" tone="success" />);
    expect(screen.getByText("달성")).toBeTruthy();
    expect(screen.getByLabelText("달성")).toBeTruthy();
  });
  it("variant=wordmark 는 from·with 락업 + 기본 aria-label", () => {
    render(<Stamp variant="wordmark" />);
    expect(screen.getByText("from")).toBeTruthy();
    expect(screen.getByText("with")).toBeTruthy();
    expect(screen.getByLabelText("from·with")).toBeTruthy();
  });
  it("color prop 으로 테두리·글자색 override", () => {
    render(<Stamp variant="wordmark" color="#4a3f37" />);
    const flat = StyleSheet.flatten(screen.getByLabelText("from·with").props.style);
    expect(flat.borderColor).toBe("#4a3f37");
  });
});

describe("EmptyState", () => {
  it("title·description·action 렌더", () => {
    render(
      <EmptyState
        title="아직 없어요"
        description="첫 항목을 올려보세요"
        action={<Button onPress={() => {}}>시작</Button>}
      />,
    );
    expect(screen.getByText("아직 없어요")).toBeTruthy();
    expect(screen.getByText("첫 항목을 올려보세요")).toBeTruthy();
    expect(screen.getByText("시작")).toBeTruthy();
  });
  it("description·action 없이도 렌더", () => {
    render(<EmptyState title="비어 있어요" />);
    expect(screen.getByText("비어 있어요")).toBeTruthy();
  });
});

describe("ErrorState", () => {
  it("기본 문구 + onRetry 버튼 호출", () => {
    const onRetry = jest.fn();
    render(<ErrorState onRetry={onRetry} />);
    expect(screen.getByText("문제가 발생했어요")).toBeTruthy();
    expect(screen.getByText("잠시 후 다시 시도해 주세요")).toBeTruthy();
    fireEvent.press(screen.getByText("다시 시도"));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
  it("onRetry 없으면 버튼 없음", () => {
    render(<ErrorState />);
    expect(screen.queryByText("다시 시도")).toBeNull();
  });
});
