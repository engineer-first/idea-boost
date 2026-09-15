import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";
import { VoteTotalingRow } from "./vote-totaling-row";

const meta = {
  title: "VoteTotaling/VoteTotalingRow",
  component: VoteTotalingRow,
  args: {
    rank: 1,
    canDecide: false,
    isDecided: false,
    onDecide: fn(),
    row: {
      noteId: "note-1",
      content: "初学者が作るものを決められない",
      subjectiveCount: 2,
      objectiveCount: 1,
      score: 11,
    },
  },
} satisfies Meta<typeof VoteTotalingRow>;
export default meta;
type Story = StoryObj<typeof meta>;
export const FirstPlace: Story = {};
export const Ranked: Story = {
  args: {
    rank: 2,
    row: {
      noteId: "note-2",
      content: "役割分担が曖昧になる",
      subjectiveCount: 0,
      objectiveCount: 5,
      score: 5,
    },
  },
};

export const ReadyToDecide: Story = {
  args: {
    canDecide: true,
  },
};

export const Decided: Story = {
  args: {
    canDecide: true,
    isDecided: true,
  },
};

export const Untitled: Story = {
  args: {
    canDecide: true,
    row: {
      noteId: "note-3",
      content: "",
      subjectiveCount: 0,
      objectiveCount: 0,
      score: 0,
    },
  },
};
