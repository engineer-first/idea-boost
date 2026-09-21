import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { NOTE_COLOR_STYLES } from "@/features/room-members";
import { RemoteCursor } from "./remote-cursor";

describe("RemoteCursor", () => {
  it("ドラッグ中は通常の名前だけを表示し、idle でも薄くしない", () => {
    const cursor = {
      userId: "22222222-2222-4222-8222-222222222222",
      name: "Taro",
      color: "green" as const,
      x: 100,
      y: 200,
      draggingNoteId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      lastSeenAt: 1_000,
    };
    render(<RemoteCursor cursor={cursor} isIdle />);

    expect(screen.getByText(cursor.name)).toBeVisible();
    expect(screen.queryByText("付箋を移動中")).not.toBeInTheDocument();
    expect(
      screen.getByTestId(`remote-cursor-${cursor.userId}`),
    ).not.toHaveClass("opacity-40");
  });

  it("名前・色・操作対象を色だけに依存せず表示し、操作を妨げない", () => {
    render(
      <RemoteCursor
        cursor={{
          userId: "22222222-2222-4222-8222-222222222222",
          name: "Very Long Participant Name That Must Be Truncated",
          color: "green",
          x: 100,
          y: 200,
          draggingNoteId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          lastSeenAt: 1_000,
        }}
        isIdle
        labelOffset={1}
      />,
    );

    const cursor = screen.getByTestId(
      "remote-cursor-22222222-2222-4222-8222-222222222222",
    );
    expect(cursor).toHaveClass("pointer-events-none", "size-0");
    expect(cursor).not.toHaveClass("opacity-40");
    expect(cursor).toHaveAttribute(
      "data-dragging-note-id",
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    );
    expect(screen.getByText(/Very Long Participant Name/)).toBeInTheDocument();
    expect(screen.queryByText("付箋を移動中")).not.toBeInTheDocument();
  });

  it("停止中も名前ラベルのコントラストを保ち、操作対象を表示しない", () => {
    render(
      <RemoteCursor
        cursor={{
          userId: "22222222-2222-4222-8222-222222222222",
          name: "Hanako",
          color: "green",
          x: 10,
          y: 20,
          draggingNoteId: null,
          lastSeenAt: 1_000,
        }}
        isIdle
        labelOffset={1}
      />,
    );

    const cursor = screen.getByTestId(
      "remote-cursor-22222222-2222-4222-8222-222222222222",
    );
    expect(cursor).toHaveAttribute("data-idle", "true");
    expect(cursor).not.toHaveClass("opacity-40");
    expect(cursor.querySelector("svg")).toHaveClass("opacity-40");
    expect(cursor).not.toHaveAttribute("data-dragging-note-id");
    expect(screen.queryByText("付箋を移動中")).not.toBeInTheDocument();
  });

  it("カーソルと名前ラベルにメンバーの付箋色を適用する", () => {
    render(
      <RemoteCursor
        cursor={{
          userId: "22222222-2222-4222-8222-222222222222",
          name: "Taro",
          color: "green",
          x: 100,
          y: 200,
          draggingNoteId: null,
          lastSeenAt: 1_000,
        }}
        isIdle={false}
      />,
    );

    const expectedColor = NOTE_COLOR_STYLES.green.backgroundColor;
    const cursor = screen.getByTestId(
      "remote-cursor-22222222-2222-4222-8222-222222222222",
    );
    expect(cursor.querySelector("svg")).toHaveClass(
      "text-slate-900",
      "dark:text-white",
    );
    expect(cursor.querySelector("svg")).toHaveStyle({
      fill: expectedColor,
    });
    expect(screen.getByText("Taro").parentElement).toHaveStyle({
      backgroundColor: expectedColor,
      color: NOTE_COLOR_STYLES.green.foregroundColor,
    });
  });
});
