import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";
import {
  buildDecision,
  buildMembers,
  buildNotes,
} from "@/contracts/room-protocol.fixture";
import { VoteTotalingPanel } from "./vote-totaling-panel";

const ME = "11111111-1111-4111-8111-111111111111";
const meta = {
  title: "VoteTotaling/VoteTotalingPanel",
  component: VoteTotalingPanel,
  args: {
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
} satisfies Meta<typeof VoteTotalingPanel>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Complete: Story = {};
export const Waiting: Story = { args: { notes: buildNotes(1) } };

export const Decided: Story = {
  args: {
    decision: buildDecision({ noteId: "note-1", decidedBy: ME }),
  },
};
