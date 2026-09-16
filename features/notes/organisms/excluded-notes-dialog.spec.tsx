import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { buildGroup, buildNote } from "@/contracts/room-protocol.fixture";
import { ExcludedNotesDialog } from "./excluded-notes-dialog";

const AUTHOR_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_ID = "22222222-2222-4222-8222-222222222222";

function setup(
  overrides: Partial<Parameters<typeof ExcludedNotesDialog>[0]> = {},
) {
  const props = {
    open: true,
    onOpenChange: vi.fn(),
    notes: [
      buildNote({
        id: "note-1",
        authorId: AUTHOR_ID,
        excluded: true,
        content: "長い本文を読むための候補\n2行目の説明",
        dotVotes: {
          subjective: { count: 1, votedByMe: false, ownCount: 0 },
          objective: { count: 2, votedByMe: false, ownCount: 0 },
        },
      }),
    ],
    groups: [buildGroup({ name: "課題のグループ" })],
    currentUserId: AUTHOR_ID,
    isHost: false,
    isDisconnected: false,
    onRestore: vi.fn(),
    ...overrides,
  };
  render(<ExcludedNotesDialog {...props} />);
  return props;
}

describe("ExcludedNotesDialog", () => {
  it("色付きカードに長文・投票数・グループを表示し、作者は復元できる", () => {
    const props = setup();

    expect(screen.getByTestId("excluded-note-note-1")).toHaveStyle({
      backgroundColor: "#FFE299",
    });
    expect(screen.getByText(/長い本文を読むための候補/)).toBeInTheDocument();
    expect(screen.getByText("投票 3票")).toBeInTheDocument();
    expect(screen.getByText(/課題のグループ/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "元に戻す" }));
    expect(props.onRestore).toHaveBeenCalledWith("note-1");
  });

  it("作者でもホストでもない参加者には復元ボタンを出さず、切断中は無効化する", () => {
    const props = setup({ currentUserId: OTHER_ID, isDisconnected: true });

    expect(screen.queryByRole("button", { name: "元に戻す" })).toBeNull();
    expect(
      screen.getByText("作者またはホストが復元できます"),
    ).toBeInTheDocument();
    expect(props.onRestore).not.toHaveBeenCalled();
  });

  it("空状態を説明する", () => {
    setup({ notes: [] });

    expect(screen.getByTestId("excluded-notes-empty")).toHaveTextContent(
      "除外した候補はありません。",
    );
  });
});
