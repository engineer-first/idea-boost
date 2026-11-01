import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { NOTE_COLOR_PALETTE } from "@/contracts/room-protocol";
import { NOTE_COLOR_STYLES } from "@/features/room-members";
import { StickyNote } from "./sticky-note";

describe("StickyNote", () => {
  it("通常は枠線なしの紙面、候補外は影なしの灰色破線に切り替わる", () => {
    const { rerender } = render(
      <StickyNote noteId="normal" testId="sticky-note">
        本文
      </StickyNote>,
    );
    const paper = screen
      .getByTestId("sticky-note")
      .querySelector<HTMLElement>('[data-slot="sticky-note-paper"]');
    expect(paper?.style.border).toBe("");
    expect(paper?.style.boxShadow).not.toBe("");
    rerender(
      <StickyNote noteId="normal" testId="sticky-note" data-excluded>
        本文
      </StickyNote>,
    );
    expect(paper?.style.borderStyle).toBe("dashed");
    expect(paper?.style.boxShadow).toBe("none");
  });
  it.each(["decided", "focused"])(
    "%s と選択の枠を同時に描き、操作の箱は拡大しない",
    (state) => {
      render(
        <StickyNote
          noteId="state"
          testId="sticky-note"
          isSelected
          isDecided={state === "decided"}
          isAdoptionFocused={state === "focused"}
        >
          本文
        </StickyNote>,
      );
      const note = screen.getByTestId("sticky-note");
      const paper = note.querySelector<HTMLElement>(
        '[data-slot="sticky-note-paper"]',
      );
      expect(paper?.style.boxShadow).toContain("0 0 0 2px #035EDE");
      expect(note.style.transform).toBe("");
      expect(note).not.toHaveClass("overflow-hidden");
    },
  );
  it("決定のはんこと読み上げを表示し、解除後もフェード用の要素を残す", () => {
    const { rerender } = render(
      <StickyNote noteId="state" isDecided>
        本文
      </StickyNote>,
    );
    expect(
      screen.getByRole("status", { name: "取り組む課題に決定済み" }),
    ).toHaveTextContent("決定");
    rerender(<StickyNote noteId="state">本文</StickyNote>);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.getByText("決定")).toHaveAttribute("aria-hidden", "true");
  });
  it.each(NOTE_COLOR_PALETTE)(
    "%s の注目でも作者色を保ち、背景を重ねない",
    (color) => {
      render(
        <StickyNote
          noteId="color"
          color={color}
          isAdoptionFocused
          testId="sticky-note"
        >
          本文
        </StickyNote>,
      );
      const paper = screen
        .getByTestId("sticky-note")
        .querySelector('[data-slot="sticky-note-paper"]');
      expect(paper).toHaveStyle({
        backgroundColor: NOTE_COLOR_STYLES[color].backgroundColor,
      });
      expect(paper).toHaveStyle({ backgroundImage: "" });
      expect(screen.getByTestId("sticky-note")).toHaveStyle({
        color: NOTE_COLOR_STYLES[color].foregroundColor,
      });
    },
  );
});
