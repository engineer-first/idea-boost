import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FixedIdeaMap } from "./fixed-idea-map";

describe("FixedIdeaMap", () => {
  it("操作UI用の余白を残して表示領域いっぱいにマップを表示する", () => {
    render(<FixedIdeaMap />);

    expect(screen.getByTestId("idea-map-layout")).toHaveClass(
      "h-full",
      "w-full",
    );
    expect(screen.getByTestId("idea-map-layout")).not.toHaveAttribute("style");
    expect(screen.getByTestId("idea-map-fixed-board")).toHaveClass(
      "items-center",
      "justify-center",
    );
  });

  it("固定サイズの2軸マップと付箋の移動領域を表示する", () => {
    render(
      <FixedIdeaMap>
        <div
          data-testid="map-note"
          className="absolute bottom-[50%] left-[50%]"
        >
          idea
        </div>
      </FixedIdeaMap>,
    );

    expect(
      screen.getByRole("region", { name: "価値と実現のしやすさの2軸マップ" }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("idea-map-fixed-board")).toHaveClass(
      "absolute",
      "inset-0",
    );
    expect(screen.getByTestId("idea-value-feasibility-map-plane")).toHaveClass(
      "overflow-visible",
    );
    expect(screen.getByTestId("idea-value-feasibility-map-plane")).toHaveStyle({
      width: "100%",
      height: "100%",
    });
    expect(screen.getByTestId("idea-map-fixed-position-area")).toHaveAttribute(
      "data-coordinate-range",
      "0-100",
    );
    expect(screen.getByTestId("idea-map-fixed-position-area")).toHaveClass(
      "absolute",
      "inset-0",
    );
    expect(screen.getByTestId("map-note")).toBeInTheDocument();
    expect(
      screen.getByTestId("idea-value-feasibility-map-y-axis-label"),
    ).toHaveTextContent("価値");
    expect(
      screen.getByTestId("idea-value-feasibility-map-x-axis-label"),
    ).toHaveTextContent("実現のしやすさ");
  });

  it("マップの広さに合わせて固定マップの両軸ラベルも拡縮する", () => {
    render(<FixedIdeaMap workspace sizeLevel={15} />);

    expect(
      screen.getByTestId("idea-value-feasibility-map-y-axis-label"),
    ).toHaveStyle({ fontSize: "87px", lineHeight: "87px" });
    expect(
      screen.getByTestId("idea-value-feasibility-map-x-axis-label"),
    ).toHaveStyle({ fontSize: "87px", lineHeight: "87px" });
  });

  it("ワークスペースでは16:9の比率を保って利用領域に収める", () => {
    render(<FixedIdeaMap workspace />);

    const map = screen.getByTestId("idea-value-feasibility-map-plane");
    expect(map.style.aspectRatio).toBe("9 / 5");
    expect(map).toHaveAttribute(
      "style",
      expect.stringContaining("aspect-ratio: 9 / 5"),
    );
    expect(screen.getByTestId("idea-map-layout")).toHaveClass(
      "h-[min(100%,calc(55.5556cqw+3rem))]",
    );
  });
});
