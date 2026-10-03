import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { buildPhaseStep } from "@/contracts/phase.fixture";
import { buildNotes } from "@/contracts/room-protocol.fixture";
import type { RoomBoardView } from "./room-board-view";
import baseMeta from "./room-board-view.stories";

// 本人向け射影のみを使い、他者の個別票や集計 count は fixture に含めない。
function notesWithOwnVotes(subjective: number, objective: number) {
  return buildNotes(3).map((note, index) => ({
    ...note,
    dotVotes: {
      subjective: {
        votedByMe: index === 0 && subjective > 0,
        ownCount: index === 0 ? subjective : 0,
      },
      objective: {
        votedByMe: index === 0 && objective > 0,
        ownCount: index === 0 ? objective : 0,
      },
    },
  }));
}

const meta = {
  ...baseMeta,
  title: "Room/RoomBoardVoteFeedback",
  args: {
    ...baseMeta.args,
    phase: buildPhaseStep(4),
    isHost: false,
    hostUserId: baseMeta.args.members[1]?.userId ?? baseMeta.args.hostUserId,
  },
} satisfies Meta<typeof RoomBoardView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Available: Story = {
  args: { notes: notesWithOwnVotes(0, 0) },
};
export const SubjectiveExhausted: Story = {
  args: { notes: notesWithOwnVotes(1, 0) },
};
export const ObjectiveExhausted: Story = {
  args: { notes: notesWithOwnVotes(0, 3) },
};
export const AllPending: Story = {
  args: {
    notes: notesWithOwnVotes(1, 3),
    pendingVoteOperations: [
      { noteId: "note-1", kind: "subjective" },
      { noteId: "note-1", kind: "objective" },
    ],
  },
};
export const Exhausted: Story = {
  args: { notes: notesWithOwnVotes(1, 3) },
};
