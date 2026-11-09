import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { buildNote } from "@/contracts/room-protocol.fixture";
import { SharedNotePreview } from "./shared-note-preview";

describe("共有付箋の全文確認", () => {
  it("フォーカスを奪わず全文を表示し、マイ付箋の入力では閉じない", () => {
    const viewport = document.createElement("div");
    viewport.getBoundingClientRect = () => new DOMRect(0, 80, 1280, 640);
    const anchor = document.createElement("div");
    anchor.dataset.testid = "note-card";
    anchor.getBoundingClientRect = () => new DOMRect(100, 100, 200, 150);
    viewport.append(anchor);
    const panel = document.createElement("div");
    panel.getBoundingClientRect = () => new DOMRect(20, 376, 1240, 260);
    const editor = document.createElement("textarea");
    panel.append(editor);
    document.body.append(viewport, panel);
    editor.focus();
    const onClose = vi.fn();
    const note = buildNote({ content: "共有付箋の長い本文を最後まで確認する" });
    const view = render(
      <SharedNotePreview
        note={note}
        anchor={anchor}
        viewport={viewport}
        panel={panel}
        layoutVersion="0"
        onClose={onClose}
      />,
    );
    expect(
      screen.getByRole("region", { name: "共有付箋の全文" }),
    ).toHaveTextContent(note.content);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(editor).toHaveFocus();
    fireEvent.pointerDown(editor);
    fireEvent.input(editor, { target: { value: "追加する考え" } });
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.keyDown(editor, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
    onClose.mockClear();
    fireEvent.pointerDown(viewport);
    expect(onClose).toHaveBeenCalledOnce();
    view.unmount();
    viewport.remove();
    panel.remove();
  });
});
