import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { userEvent, within } from "storybook/test";
import { buildPhaseStep } from "@/contracts/phase.fixture";
import { buildCarryover } from "@/contracts/room-protocol.fixture";
import { BoardContext } from "./board-context";

const phase = buildPhaseStep(1, 3);
const meta = {
  title: "Room/BoardContext",
  component: BoardContext,
  decorators: [
    (Story) => (
      <div className="w-full max-w-[360px]">
        <Story />
      </div>
    ),
  ],
  args: {
    phase,
    issueReference: buildCarryover({
      color: "pink",
      fontSize: 18,
      dotVotes: { subjective: 3, objective: 2 },
    }),
    hmwReference: buildCarryover({
      phase: 2,
      color: "blue",
      fontSize: 16,
      dotVotes: { subjective: 4, objective: 1 },
    }),
    hmwDecidedIssue: buildCarryover().content,
    decidedHmw: buildCarryover({
      phase: 2,
      content: "どうすれば全員が安心してアイデアを共有できるだろうか？",
    }).content,
  },
} satisfies Meta<typeof BoardContext>;
export default meta;
type Story = StoryObj<typeof meta>;
export const CurrentStep: Story = {};
export const IssueExpanded: Story = {
  play: async ({ canvasElement }) => {
    await userEvent.click(
      within(canvasElement).getByRole("button", { name: "決定した課題" }),
    );
  },
};
export const HmwExpanded: Story = {};
export const NoDecisions: Story = {
  args: { hmwDecidedIssue: null, decidedHmw: null },
};

export const HmwWriting: Story = {
  args: {
    phase: buildPhaseStep(1, 2),
    decidedHmw: null,
  },
};
export const AfterWriting: Story = {
  args: {
    phase: buildPhaseStep(2, 3),
  },
};

export const MissingSource: Story = {
  args: { issueReference: null, hmwReference: null },
};
export const LongQuestion: Story = {
  args: { decidedHmw: "問いを読み返しながら考える。".repeat(150) },
};
