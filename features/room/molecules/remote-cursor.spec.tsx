import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RemoteCursor } from "./remote-cursor";

describe("RemoteCursor", () => {
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
    expect(cursor).toHaveClass("pointer-events-none", "size-0", "opacity-40");
    expect(cursor).toHaveAttribute(
      "data-dragging-note-id",
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    );
    expect(screen.getByText(/Very Long Participant Name/)).toBeInTheDocument();
    expect(screen.getByText("付箋を移動中")).toBeInTheDocument();
  });
});
