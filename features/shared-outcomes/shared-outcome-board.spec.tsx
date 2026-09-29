import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { buildSharedOutcome } from "@/contracts/shared-outcomes.fixture";
import { SharedOutcomeBoard } from "./shared-outcome-board";

describe("成果の2軸盤面", () => {
  it("採用結果と公開された票数を表示し、未確定の票数は表示しない", () => {
    const snapshot = buildSharedOutcome().snapshot;
    if (!snapshot) throw new Error("snapshot required");
    snapshot.notes[0].votes = { subjective: 2, objective: 3 };
    const { rerender } = render(
      <SharedOutcomeBoard label="課題" phase={1} snapshot={snapshot} />,
    );
    const list = within(screen.getByRole("list"));
    expect(list.getByText("採用済み")).toBeInTheDocument();
    expect(
      list.getByText("主観 2票 / 客観 3票 / 合計 5票"),
    ).toBeInTheDocument();
    snapshot.notes[0].votes = null;
    snapshot.decisions = [];
    rerender(<SharedOutcomeBoard label="課題" phase={1} snapshot={snapshot} />);
    expect(list.queryByText("採用済み")).not.toBeInTheDocument();
    expect(list.queryByText(/合計.*票/)).not.toBeInTheDocument();
  });
  it("3-2の共有時点でも中心座標を元の盤面と同じ配置へ変換する", () => {
    const snapshot = buildSharedOutcome().snapshot;
    if (!snapshot) throw new Error("snapshot required");
    snapshot.phase = { kind: "step", phase: 3, step: 2 };
    snapshot.notes = [
      { ...snapshot.notes[0], id: "map-note", phase: 3, x: 50, y: 50 },
    ];
    snapshot.groups = [];
    render(
      <SharedOutcomeBoard label="アイデア" phase={3} snapshot={snapshot} />,
    );
    expect(screen.getByText(/縦軸：価値/)).toBeInTheDocument();
    const note = screen.getByRole("img").querySelector("rect");
    expect(note).toHaveAttribute("x", "700");
    expect(note).toHaveAttribute("y", "375");
  });
});

it("保存した色と重なり順を盤面に再現する", () => {
  const snapshot = buildSharedOutcome().snapshot;
  if (!snapshot) throw new Error("snapshot required");
  snapshot.notes = [
    { ...snapshot.notes[0], id: "front", color: "blue", stackOrder: 2 },
    { ...snapshot.notes[0], id: "back", color: "pink", stackOrder: 1 },
  ];
  snapshot.groups = [];
  render(<SharedOutcomeBoard label="課題" phase={1} snapshot={snapshot} />);
  const rectangles = screen.getByRole("img").querySelectorAll("rect");
  expect(rectangles[0]).toHaveAttribute("fill", "#F39AB5");
  expect(rectangles[1]).toHaveAttribute("fill", "#88BDF2");
});
