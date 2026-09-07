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
    expect(map).toHaveStyle({ width: "1600px", height: "900px" });
    expect(map).toHaveClass("grid-cols-[4rem_minmax(0,1fr)]");
    expect(map).toHaveClass("grid-rows-[minmax(0,1fr)_4rem]");
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
    ).toHaveClass("left-0");
    expect(
      screen.getByTestId("idea-value-feasibility-map-x-axis-label"),
    ).toHaveClass("top-9");
    expect(feasibilityScale).toHaveClass("h-16");
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
});
