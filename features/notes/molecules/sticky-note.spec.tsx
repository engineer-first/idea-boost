import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { NOTE_COLOR_PALETTE } from "@/contracts/room-protocol";
import { NOTE_COLOR_STYLES } from "@/features/room-members";
import { StickyNote } from "./sticky-note";

describe("StickyNote", () => {
  it.each(NOTE_COLOR_PALETTE)("%s の背景色を直接適用する", (color) => {
    render(
      <StickyNote noteId={`note-${color}`} color={color} testId="sticky-note">
        本文
      </StickyNote>,
    );

    expect(screen.getByTestId("sticky-note")).toHaveStyle({
      backgroundColor: NOTE_COLOR_STYLES[color].backgroundColor,
      color: NOTE_COLOR_STYLES[color].foregroundColor,
    });
  });

  it.each(
    NOTE_COLOR_PALETTE,
  )("%s の採用フォーカス表示でも作者色の前景を保つ", (color) => {
    render(
      <StickyNote
        noteId={`note-${color}`}
        color={color}
        isAdoptionFocused
        testId="sticky-note"
      >
        本文
      </StickyNote>,
    );

    expect(screen.getByTestId("sticky-note")).toHaveStyle({
      backgroundColor: NOTE_COLOR_STYLES[color].backgroundColor,
      color: NOTE_COLOR_STYLES[color].foregroundColor,
      backgroundImage: expect.stringContaining("16 185 129"),
    });
  });

  it("isDecided の付箋を強調する", () => {
    render(
      <StickyNote noteId="note-1" isDecided testId="sticky-note">
        本文
      </StickyNote>,
    );

    expect(screen.getByTestId("sticky-note")).toHaveAttribute(
      "data-decided",
      "true",
    );
    expect(screen.getByTestId("sticky-note")).toHaveClass(
      "outline-4",
      "outline-solid",
      "outline-emerald-600",
      "outline-offset-2",
    );
    expect(screen.getByTestId("sticky-note")).toHaveClass(
      "border-slate-700",
      "dark:border-slate-300",
    );
  });

  it("共有採用フォーカスは文言なしの緑点線枠と薄緑で示し、確定表示を優先する", () => {
    const { rerender } = render(
      <StickyNote noteId="note-1" isAdoptionFocused testId="sticky-note">
        本文
      </StickyNote>,
    );

    const note = screen.getByTestId("sticky-note");
    expect(note).toHaveAttribute("data-adoption-focused", "true");
    expect(note).toHaveClass("outline-dashed", "outline-emerald-500");
    expect(note).toHaveStyle({
      backgroundImage: expect.stringContaining("16 185 129"),
    });
    expect(screen.queryByText(/検討|フォーカス/)).not.toBeInTheDocument();

    rerender(
      <StickyNote
        noteId="note-1"
        isAdoptionFocused
        isDecided
        testId="sticky-note"
      >
        本文
      </StickyNote>,
    );
    expect(note).toHaveClass("outline-solid", "outline-4");
    expect(note).not.toHaveClass("outline-dashed");
  });
});
