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

export const LongContent: Story = {
  args: {
    notes: buildNotes(3).map((note, index) => ({
      ...note,
      content:
        index === 0
          ? "会議の前に論点を整理し、関係者がそれぞれの背景を理解したうえで、次の一歩を具体的に決められるようにする"
          : note.content,
      dotVotes: {
        subjective: {
          count: index === 0 ? 1 : 0,
          votedByMe: false,
          ownCount: 0,
        },
        objective: {
          count: index === 0 ? 1 : 0,
          votedByMe: false,
          ownCount: 0,
        },
      },
    })),
  },
  parameters: { viewport: { defaultViewport: "mobile1" } },
};

export const TiedRanking: Story = {
  args: {
    notes: buildNotes(3).map((note) => ({
      ...note,
      dotVotes: {
        subjective: { count: 1, votedByMe: false, ownCount: 0 },
        objective: { count: 0, votedByMe: false, ownCount: 0 },
      },
    })),
  },
};

export const ZeroVotes: Story = {
  args: {
    notes: buildNotes(2),
  },
};

export const ExcludedCandidate: Story = {
  args: {
    notes: buildNotes(3).map((note, index) => ({
      ...note,
      excluded: index === 0,
      dotVotes: {
        subjective: {
          count: index === 0 ? 3 : 1,
          votedByMe: false,
          ownCount: 0,
        },
        objective: {
          count: index === 0 ? 3 : 0,
          votedByMe: false,
          ownCount: 0,
        },
      },
    })),
  },
};

export const NoCandidates: Story = {
  args: {
    notes: buildNotes(2).map((note) => ({ ...note, excluded: true })),
  },
};

export const DarkMode: Story = {
  globals: { theme: "dark" },
};
