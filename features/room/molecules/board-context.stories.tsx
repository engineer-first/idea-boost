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
  // 3-2は閉じて入るため、問いの付箋の見た目を確かめるよう開いた状態を指定する。
  args: {
    phase: buildPhaseStep(2, 3),
    initialDisclosureId: "hmw",
  },
};

export const IdeaVoting: Story = {
  args: { phase: buildPhaseStep(4, 3), initialDisclosureId: null },
};

export const IdeaResult: Story = {
  args: { phase: buildPhaseStep(5, 3), initialDisclosureId: null },
};

export const MissingSource: Story = {
  args: { issueReference: null, hmwReference: null },
};
export const LongQuestion: Story = {
  args: { decidedHmw: "問いを読み返しながら考える。".repeat(150) },
};

// 作業中もメニューを開かずにテーマを確かめられる。最大30文字は2行まで折り返して全文を見せる。
export const WithTheme: Story = {
  args: { roomName: "通学路を安全にするには" },
};
export const WithLongTheme: Story = {
  args: {
    roomName: "通学路で自転車と歩行者がぶつかりそうになる問題をなくすには",
  },
};
export const WithoutTheme: Story = {
  args: { roomName: null },
};
