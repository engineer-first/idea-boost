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

    expect(
      screen.getByRole("img", { name: "付箋の編集：可能" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: "付箋の移動：不可" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: "付箋の削除：可能" }),
    ).toBeInTheDocument();

    expect(screen.getByText("編集")).toBeInTheDocument();
    expect(screen.getByText("移動")).toBeInTheDocument();
    expect(screen.getByText("削除")).toBeInTheDocument();
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });

  it("可能な操作には丸、不可能な操作にはバツを重ねる", () => {
    render(
      <BoardOperationMatrix
        permissions={{
          canEditNote: true,
          canMoveNote: false,
          canDeleteNote: true,
        }}
      />,
    );

    expect(
      screen.getByTestId("board-operation-status-canEditNote"),
    ).toHaveAttribute("data-status", "allowed");
    expect(
      screen.getByTestId("board-operation-status-canMoveNote"),
    ).toHaveAttribute("data-status", "blocked");
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

    await user.hover(screen.getByRole("img", { name: "付箋の編集：可能" }));

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

    await user.hover(screen.getByRole("img", { name: "付箋の移動：不可" }));

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

    await user.hover(screen.getByRole("img", { name: "付箋の削除：可能" }));

    expect(await screen.findByRole("tooltip")).toHaveTextContent(
      "付箋の削除：可能",
    );
  });
});
