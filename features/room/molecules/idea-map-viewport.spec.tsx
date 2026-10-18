import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { IdeaMapViewport } from "./idea-map-viewport";

describe("IdeaMapViewport", () => {
  it("操作UI用の余白を残して表示領域いっぱいにマップを表示する", () => {
    render(<IdeaMapViewport />);

    expect(screen.getByTestId("idea-map-layout")).toHaveClass(
      "h-full",
      "w-full",
    );
    expect(screen.getByTestId("idea-map-layout")).not.toHaveAttribute("style");
    expect(screen.getByTestId("idea-map-viewport")).toHaveClass(
      "items-center",
      "justify-center",
    );
  });

  it("固定サイズの2軸マップと付箋の移動領域を表示する", () => {
    render(
      <IdeaMapViewport>
        <div
          data-testid="map-note"
          className="absolute bottom-[50%] left-[50%]"
        >
          idea
        </div>
      </IdeaMapViewport>,
    );

    expect(
      screen.getByRole("region", { name: "価値と実現のしやすさの2軸マップ" }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("idea-map-viewport")).toHaveClass(
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
    expect(screen.getByTestId("idea-map-viewport-plane")).toHaveAttribute(
      "data-coordinate-range",
      "0-100",
    );
    expect(screen.getByTestId("idea-map-viewport-plane")).toHaveClass(
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
});
