import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { buildSharedOutcome } from "@/contracts/shared-outcomes.fixture";
import { SharedOutcomeBoard } from "./shared-outcome-board";

const snapshot = buildSharedOutcome().snapshot;
if (!snapshot) throw new Error("snapshot required");
const meta = {
  title: "SharedOutcomes/SharedOutcomeBoard",
  component: SharedOutcomeBoard,
  args: { label: "課題", phase: 1, snapshot },
} satisfies Meta<typeof SharedOutcomeBoard>;
export default meta;
export const Grouped: StoryObj<typeof meta> = {};
export const AdoptedWithVotes: StoryObj<typeof meta> = {
  args: {
    snapshot: {
      ...snapshot,
      notes: snapshot.notes.map((note) => ({
        ...note,
        votes: { subjective: 2, objective: 3 },
      })),
    },
  },
};
export const IdeaMap: StoryObj<typeof meta> = {
  args: { label: "アイデア", phase: 3 },
};
