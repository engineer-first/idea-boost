import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  getIdeaMapWorldLayout,
  IDEA_MAP_WORLD_X_AXIS_HEIGHT,
  IDEA_MAP_WORLD_Y_AXIS_WIDTH,
} from "../logic/idea-value-feasibility-map";
import { IdeaValueFeasibilityMap } from "./idea-value-feasibility-map";

describe("IdeaValueFeasibilityMap", () => {
  it("価値と実現のしやすさの軸を、マップ面の外側に置く", () => {
    render(<IdeaValueFeasibilityMap />);

    const map = screen.getByRole("region", {
      name: "価値と実現のしやすさの2軸マップ",
    });
    const plane = screen.getByTestId("idea-value-feasibility-map-plane");
    const valueScale = screen.getByRole("group", { name: "価値: 低から高" });
    const feasibilityScale = screen.getByRole("group", {
      name: "実現のしやすさ: 左ほどしにくく、右ほどしやすい",
    });

    expect(map).toContainElement(plane);
    expect(plane).toHaveAttribute("data-coordinate-range", "0-100");
    expect(plane).toHaveAttribute("data-canvas-background", "true");
    expect(valueScale).toHaveTextContent(/^高[\s\S]*価値[\s\S]*低$/);
    expect(feasibilityScale).toHaveTextContent(
      /^しにくい[\s\S]*実現のしやすさ[\s\S]*しやすい$/,
    );
    expect(plane).not.toContainElement(valueScale);
    expect(plane).not.toContainElement(feasibilityScale);
    expect(
      screen.getByTestId("idea-value-feasibility-map-plane-grid"),
    ).toHaveStyle({ backgroundSize: "10% 10%" });
  });

  it("共有されたサイズ段階で、ボード上のマップ面だけを中心から広げる", () => {
    const { rerender } = render(<IdeaValueFeasibilityMap sizeLevel={0} />);
    for (const sizeLevel of [0, 4]) {
      rerender(<IdeaValueFeasibilityMap sizeLevel={sizeLevel} />);
      const { plane } = getIdeaMapWorldLayout(sizeLevel);
      const map = screen.getByTestId("idea-value-feasibility-map");
      expect(map).toHaveStyle({
        left: `${plane.x - IDEA_MAP_WORLD_Y_AXIS_WIDTH}px`,
        top: `${plane.y}px`,
        width: `${plane.width + IDEA_MAP_WORLD_Y_AXIS_WIDTH}px`,
        height: `${plane.height + IDEA_MAP_WORLD_X_AXIS_HEIGHT}px`,
      });
      expect(
        screen.getByTestId("idea-value-feasibility-map-plane"),
      ).toHaveStyle({ width: `${plane.width}px`, height: `${plane.height}px` });
    }
  });

  it("縮小して見ても、軸の名前は画面上で読める大きさを保つ", () => {
    const { rerender } = render(<IdeaValueFeasibilityMap cameraZoom={1} />);
    const label = screen.getByTestId("idea-value-feasibility-map-x-axis-label");
    expect(label).toHaveStyle({ fontSize: "24px" });
    rerender(<IdeaValueFeasibilityMap cameraZoom={0.4} />);
    expect(label).toHaveStyle({ fontSize: "40px" });
  });

  it("縮小して見ても、軸の言葉と矢印の間と横軸の行の高さを文字に合わせて広げる", () => {
    const { rerender } = render(<IdeaValueFeasibilityMap cameraZoom={1} />);
    const row = screen.getByTestId("idea-value-feasibility-map-x-axis-row");
    const track = screen.getByTestId("idea-value-feasibility-map-y-scale-bar");
    expect(row).toHaveStyle({ gap: "12px", height: "32px" });
    expect(track).toHaveStyle({ top: "36px" });
    rerender(<IdeaValueFeasibilityMap cameraZoom={0.4} />);
    // 矢印の線の太さを除いても画面上で8px以上の間を保つ（0.4倍なら25px）。
    expect(Number.parseFloat(row.style.gap)).toBeGreaterThanOrEqual(25);
    // 横軸名（40px）の行の高さに合わせ、マップ面へはみ出さない。
    expect(Number.parseFloat(row.style.height)).toBeGreaterThanOrEqual(50);
    // 高・低（30px）の下に軸線を始める。
    expect(Number.parseFloat(track.style.top)).toBeGreaterThanOrEqual(
      30 * 1.25 + 20,
    );
  });
});
