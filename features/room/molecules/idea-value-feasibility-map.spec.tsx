import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { IdeaValueFeasibilityMap } from "./idea-value-feasibility-map";

describe("IdeaValueFeasibilityMap", () => {
  it("価値と実現可能性の連続スケールを表示する", () => {
    render(<IdeaValueFeasibilityMap />);

    const map = screen.getByRole("region", {
      name: "価値と実現可能性の2軸マップ",
    });

    expect(map).toBeInTheDocument();
    expect(map).not.toHaveClass("aspect-square");
    expect(map).toHaveStyle({
      width: "1600px",
      height: "910px",
      gridTemplateRows: "minmax(0, 1fr) 74px",
    });
    expect(map).toHaveClass("grid-cols-[4rem_minmax(0,1fr)]");
    expect(map).toHaveClass("gap-3");
    expect(map).toHaveClass("z-10");
    expect(screen.getByTestId("idea-value-feasibility-map-plane")).toHaveClass(
      "relative",
    );
    expect(screen.getByTestId("idea-value-feasibility-map-plane")).toHaveClass(
      "bg-sky-50/90",
    );
    expect(
      screen.getByTestId("idea-value-feasibility-map-plane"),
    ).toHaveAttribute("data-coordinate-range", "0-100");
    const valueScale = screen.getByRole("group", {
      name: "価値: 低から高",
    });
    const feasibilityScale = screen.getByRole("group", {
      name: "実現可能性: 低から高",
    });

    expect(valueScale).toHaveTextContent(/^高[\s\S]*価値[\s\S]*低$/);
    expect(feasibilityScale).toHaveTextContent(
      /^低[\s\S]*実現可能性[\s\S]*高$/,
    );
    expect(
      screen.getByTestId("idea-value-feasibility-map-y-scale-bar"),
    ).toHaveClass("bg-linear-to-t");
    expect(
      screen.getByTestId("idea-value-feasibility-map-x-scale-bar"),
    ).toHaveClass("bg-linear-to-r");
    expect(
      screen.getByTestId("idea-value-feasibility-map-y-axis-label"),
    ).toHaveClass("right-0");

    expect(feasibilityScale).toHaveClass("h-full");
    expect(feasibilityScale).toHaveClass("z-10");
    expect(
      screen.getByTestId("idea-value-feasibility-map-plane-grid").style
        .backgroundImage,
    ).toContain("linear-gradient(to right");
    expect(
      screen.getByTestId("idea-value-feasibility-map-plane-grid").style
        .backgroundImage,
    ).toContain("linear-gradient(to bottom");
    expect(
      screen.getByTestId("idea-value-feasibility-map-plane-grid"),
    ).toHaveStyle({ backgroundSize: "10% 10%" });
    expect(
      screen.getByTestId("idea-value-feasibility-map-plane"),
    ).not.toContainElement(valueScale);
    expect(
      screen.getByTestId("idea-value-feasibility-map-plane"),
    ).not.toContainElement(feasibilityScale);
    expect(map).not.toHaveClass("h-[680px]");
    expect(map).not.toHaveClass("w-[1120px]");
  });

  it("共有されたサイズ段階を平面寸法へ反映する", () => {
    render(<IdeaValueFeasibilityMap sizeLevel={2} />);
    const map = screen.getByTestId("idea-value-feasibility-map");
    expect(map).toHaveStyle({
      width: "1936px",
      height: "1109px",
      left: "calc(50% - 800px)",
      bottom: "calc(50% - 450px - 20px)",
      gridTemplateRows: "minmax(0, 1fr) 84px",
    });
    expect(map).not.toHaveClass("-translate-x-1/2");
    expect(map).not.toHaveClass("-translate-y-1/2");
  });

  it.each([
    [0, "48px"],
    [2, "58px"],
    [4, "70px"],
    [15, "87px"],
  ])("サイズ段階 %i に応じて両軸ラベルを拡縮する", (sizeLevel, fontSize) => {
    render(<IdeaValueFeasibilityMap sizeLevel={sizeLevel} />);

    expect(
      screen.getByTestId("idea-value-feasibility-map-y-axis-label"),
    ).toHaveStyle({ fontSize, lineHeight: fontSize });
    expect(
      screen.getByTestId("idea-value-feasibility-map-x-axis-label"),
    ).toHaveStyle({ fontSize, lineHeight: fontSize });
  });

  it("大きいラベル分の下余白を確保し、マップ面の高さを保つ", () => {
    render(<IdeaValueFeasibilityMap sizeLevel={4} />);

    expect(screen.getByTestId("idea-value-feasibility-map")).toHaveStyle({
      height: "1350px",
      bottom: "calc(50% - 450px - 32px)",
      gridTemplateRows: "minmax(0, 1fr) 96px",
    });
  });
});
