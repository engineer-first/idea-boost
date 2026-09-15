import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DecideNoteAction } from "./decide-note-action";

describe("DecideNoteAction", () => {
  it("付箋右上にアイコンだけの決定操作を表示し、押下を親へ通知する", () => {
    const onDecide = vi.fn();
    render(<DecideNoteAction x={120} y={80} onDecide={onDecide} />);

    const button = screen.getByRole("button", {
      name: "この付箋を取り組む課題に決定",
    });
    expect(button).toHaveClass("absolute");
    expect(button).toHaveAttribute("data-size", "icon-lg");
    expect(button).toHaveStyle({ left: "120px", top: "80px" });
    expect(button.textContent).toBe("");

    fireEvent.click(button);
    expect(onDecide).toHaveBeenCalledTimes(1);
  });
});
