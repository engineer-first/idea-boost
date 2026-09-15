import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { BoardOperationMatrix } from "./board-operation-matrix";

describe("BoardOperationMatrix", () => {
  it("各操作の状態を表示する", () => {
    render(
      <BoardOperationMatrix
        permissions={{
          canEditNote: true,
          canMoveNote: false,
          canDeleteNote: true,
        }}
      />,
    );

    expect(screen.getByLabelText("付箋の編集")).toBeInTheDocument();
    expect(screen.getByLabelText("付箋の移動")).toBeInTheDocument();
    expect(screen.getByLabelText("付箋の削除")).toBeInTheDocument();
  });

  it("編集のTooltipに可能を表示する", async () => {
    const user = userEvent.setup();

    render(
      <BoardOperationMatrix
        permissions={{
          canEditNote: true,
          canMoveNote: false,
          canDeleteNote: true,
        }}
      />,
    );

    await user.hover(screen.getByLabelText("付箋の編集"));

    expect(await screen.findByRole("tooltip")).toHaveTextContent(
      "付箋の編集：可能",
    );
  });

  it("移動のTooltipに不可を表示する", async () => {
    const user = userEvent.setup();

    render(
      <BoardOperationMatrix
        permissions={{
          canEditNote: true,
          canMoveNote: false,
          canDeleteNote: true,
        }}
      />,
    );

    await user.hover(screen.getByLabelText("付箋の移動"));

    expect(await screen.findByRole("tooltip")).toHaveTextContent(
      "付箋の移動：不可",
    );
  });

  it("削除のTooltipに可能を表示する", async () => {
    const user = userEvent.setup();

    render(
      <BoardOperationMatrix
        permissions={{
          canEditNote: true,
          canMoveNote: false,
          canDeleteNote: true,
        }}
      />,
    );

    await user.hover(screen.getByLabelText("付箋の削除"));

    expect(await screen.findByRole("tooltip")).toHaveTextContent(
      "付箋の削除：可能",
    );
  });
});
