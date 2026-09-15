import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ProtocolNote } from "@/contracts/room-protocol";
import {
  buildDecision,
  buildMembers,
  buildNote,
  buildNotes,
} from "@/contracts/room-protocol.fixture";
import {
  calculateVoteTotaling,
  VoteTotalingPanel,
} from "./vote-totaling-panel";

const ME = "11111111-1111-4111-8111-111111111111";

function withVotes(
  note: ProtocolNote,
  subjective: number,
  objective: number,
): ProtocolNote {
  return {
    ...note,
    dotVotes: {
      subjective: { count: subjective, votedByMe: false, ownCount: 0 },
      objective: { count: objective, votedByMe: false, ownCount: 0 },
    },
  };
}

describe("calculateVoteTotaling", () => {
  it("主観5点・客観1点で集計し、同点なら主観票が多い順にランキングする", () => {
    const votes = [
      [2, 3],
      [2, 3],
      [2, 3],
      [1, 8],
      [0, 13],
      [1, 0],
      [1, 0],
      [1, 0],
    ];
    const notes = buildNotes(8).map((note, index) =>
      withVotes(note, votes[index][0], votes[index][1]),
    );
    const result = calculateVoteTotaling({ notes, memberCount: 10 });

    expect(result.isComplete).toBe(true);
    expect(result.rows.map((row) => row.score)).toEqual([
      13, 13, 13, 13, 13, 5, 5, 5,
    ]);
    expect(result).not.toHaveProperty("selectedChallenges");
    expect(result.rows.some((row) => "isSelectedChallenge" in row)).toBe(false);
  });

  it("全員分の投票が終わるまでは結果を確定しない", () => {
    const [note] = buildNotes(1);
    const result = calculateVoteTotaling({
      notes: [withVotes(note, 1, 3)],
      memberCount: 2,
    });

    expect(result.isComplete).toBe(false);
    expect(result).not.toHaveProperty("selectedChallenges");
  });

  it("主観票なしでも総合点が高い付箋をランキングの先頭に置く", () => {
    const votes = [
      [0, 20],
      [2, 3],
      [2, 0],
      [2, 0],
      [2, 0],
      [2, 0],
      [0, 7],
    ];
    const notes = buildNotes(7).map((note, index) =>
      withVotes(note, votes[index][0], votes[index][1]),
    );

    const result = calculateVoteTotaling({ notes, memberCount: 10 });

    expect(result.isComplete).toBe(true);
    expect(result.rows[0]).toMatchObject({
      noteId: "note-1",
      subjectiveCount: 0,
      score: 20,
    });
    expect(result).not.toHaveProperty("selectedChallenges");
  });

  it("合計1票以上の付箋だけをランキングに含める", () => {
    const votes = [
      [2, 0],
      [0, 3],
      [0, 2],
      [0, 1],
      [0, 0],
    ];
    const notes = buildNotes(5).map((note, index) =>
      withVotes(note, votes[index][0], votes[index][1]),
    );

    const result = calculateVoteTotaling({ notes, memberCount: 2 });

    expect(result.isComplete).toBe(true);
    expect(result.rows.map((row) => row.score)).toEqual([10, 3, 2, 1]);
    expect(result.rows.map((row) => row.noteId)).toEqual([
      "note-1",
      "note-2",
      "note-3",
      "note-4",
    ]);
  });

  it("count が未公開の付箋は投票結果に含めない", () => {
    const [note] = buildNotes(1);
    const result = calculateVoteTotaling({
      notes: [
        {
          ...note,
          dotVotes: {
            subjective: { votedByMe: false, ownCount: 0 },
            objective: { votedByMe: false, ownCount: 0 },
          },
        },
      ],
      memberCount: 1,
      isVotingComplete: true,
    });

    expect(result.rows).toEqual([]);
  });
});

describe("VoteTotalingPanel", () => {
  it("phase4 で確定済みなら、参加者が離脱しても結果を表示し続ける", () => {
    const [note] = buildNotes(1);

    render(
      <VoteTotalingPanel
        isVotingComplete
        members={[]}
        notes={[withVotes(note, 1, 3)]}
        decision={null}
        isHost={false}
        isDisconnected={false}
        onNoteDecide={vi.fn()}
      />,
    );

    expect(screen.getByTestId("vote-result-ranking")).toBeInTheDocument();
  });

  it("1票以上の付箋だけを総合ポイント順に表示する", () => {
    const notes = buildNotes(5).map((note, index) =>
      withVotes(note, [2, 0, 0, 0, 0][index], [0, 3, 2, 1, 0][index]),
    );

    render(
      <VoteTotalingPanel
        members={buildMembers(2, ME)}
        notes={notes}
        decision={null}
        isHost={false}
        isDisconnected={false}
        onNoteDecide={vi.fn()}
      />,
    );

    expect(screen.getByTestId("vote-result-ranking")).toHaveClass("mx-auto");
    expect(screen.getByText("総合ポイントが高い順")).toBeInTheDocument();
    expect(screen.queryByText("取り組む課題")).not.toBeInTheDocument();
    expect(
      screen
        .getAllByTestId(/vote-totaling-row-/)
        .map((row) => row.dataset.testid),
    ).toEqual([
      "vote-totaling-row-note-1",
      "vote-totaling-row-note-2",
      "vote-totaling-row-note-3",
      "vote-totaling-row-note-4",
    ]);
    expect(screen.queryByTestId("vote-totaling-row-note-5")).toBeNull();
    expect(screen.getByText("4位")).toBeInTheDocument();
    expect(
      within(screen.getByTestId("vote-totaling-row-note-1")).getByText("10点"),
    ).toBeInTheDocument();
  });

  it("ホストが接続中なら未決定のランキング行から決定を通知する", () => {
    const notes = buildNotes(2).map((note) => withVotes(note, 1, 0));
    const onNoteDecide = vi.fn();

    render(
      <VoteTotalingPanel
        isVotingComplete
        members={buildMembers(2, ME)}
        notes={notes}
        decision={null}
        isHost
        isDisconnected={false}
        onNoteDecide={onNoteDecide}
      />,
    );

    const decideButton = within(
      screen.getByTestId("vote-totaling-row-note-1"),
    ).getByRole("button", { name: "付箋 1を取り組む課題に決定" });
    expect(decideButton).toHaveTextContent("決定する");

    fireEvent.click(decideButton);

    expect(onNoteDecide).toHaveBeenCalledWith("note-1");
  });

  it("付箋が無題（本文が空）のときは決定ボタンのaria-labelにフォールバック文言を使う", () => {
    render(
      <VoteTotalingPanel
        isVotingComplete
        members={buildMembers(1, ME)}
        notes={[withVotes(buildNote({ id: "note-1", content: "" }), 1, 0)]}
        decision={null}
        isHost
        isDisconnected={false}
        onNoteDecide={vi.fn()}
      />,
    );

    expect(
      within(screen.getByTestId("vote-totaling-row-note-1")).getByRole(
        "button",
        { name: "無題の付箋を取り組む課題に決定" },
      ),
    ).toBeInTheDocument();
  });

  it.each([
    { isHost: false, isDisconnected: false },
    { isHost: true, isDisconnected: true },
  ])("非ホストまたは切断中はランキング行に決定操作を出さない", ({
    isHost,
    isDisconnected,
  }) => {
    render(
      <VoteTotalingPanel
        isVotingComplete
        members={buildMembers(2, ME)}
        notes={buildNotes(2).map((note) => withVotes(note, 1, 0))}
        decision={null}
        isHost={isHost}
        isDisconnected={isDisconnected}
        onNoteDecide={vi.fn()}
      />,
    );

    expect(
      screen.queryByRole("button", {
        name: "付箋 1を取り組む課題に決定",
      }),
    ).not.toBeInTheDocument();
  });

  it("決定済み行はstatusを表示し、別の行から決定し直せる", () => {
    const notes = buildNotes(2).map((note) => withVotes(note, 1, 0));
    const onNoteDecide = vi.fn();

    render(
      <VoteTotalingPanel
        isVotingComplete
        members={buildMembers(2, ME)}
        notes={notes}
        decision={buildDecision({ noteId: "note-1", decidedBy: ME })}
        isHost
        isDisconnected={false}
        onNoteDecide={onNoteDecide}
      />,
    );

    const decidedRow = screen.getByTestId("vote-totaling-row-note-1");
    expect(
      within(decidedRow).getByRole("status", {
        name: "取り組む課題に決定済み",
      }),
    ).toHaveTextContent("決定済み");
    expect(
      within(decidedRow).queryByRole("button", {
        name: "付箋 1を取り組む課題に決定",
      }),
    ).not.toBeInTheDocument();

    fireEvent.click(
      within(screen.getByTestId("vote-totaling-row-note-2")).getByRole(
        "button",
        { name: "付箋 2を取り組む課題に決定" },
      ),
    );
    expect(onNoteDecide).toHaveBeenCalledWith("note-2");
  });
});
