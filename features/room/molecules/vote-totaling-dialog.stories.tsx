import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";
import {
  buildDecision,
  buildMembers,
  buildNotes,
} from "@/contracts/room-protocol.fixture";
import { VoteTotalingDialog } from "./vote-totaling-dialog";

const ME = "11111111-1111-4111-8111-111111111111";

const meta = {
  title: "Room/VoteTotalingDialog",
  component: VoteTotalingDialog,
  args: {
    open: true,
    onOpenChange: fn(),
    isVotingComplete: true,
    members: buildMembers(2, ME),
    decision: null,
    isHost: true,
    isDisconnected: false,
    onNoteDecide: fn(),
    notes: buildNotes(3).map((note, index) => ({
      ...note,
      dotVotes: {
        subjective: {
          count: index === 0 ? 2 : 0,
          votedByMe: false,
          ownCount: 0,
        },
        objective: {
          count: index === 0 ? 1 : 5,
          votedByMe: false,
          ownCount: 0,
        },
      },
    })),
  },
} satisfies Meta<typeof VoteTotalingDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

// phase4 で投票結果のランキングを重ねて表示している状態（success）。
export const Open: Story = {};

// まだ全員の投票が終わっていない状態の表示。
export const VotingIncomplete: Story = {
  args: {
    isVotingComplete: false,
  },
};

export const Decided: Story = {
  args: {
    decision: buildDecision({ noteId: "note-1", decidedBy: ME }),
  },
};
