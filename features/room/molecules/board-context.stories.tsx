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

// iPad 横のように帯の幅が狭く、本文の1文字と「…」も入らないときは、
// 見出しだけを1行に出し、本文の一部を見せない。
export const IdeaVotingNarrow: Story = {
  args: { phase: buildPhaseStep(4, 3), initialDisclosureId: null },
  decorators: [
    (Story) => (
      <div className="w-full max-w-[300px]">
        <Story />
      </div>
    ),
  ],
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
// ルームの状態が届く前は文言なしの枠で高さだけ保ち、「テーマ未設定」と仮表示しない。
export const ThemeLoading: Story = {
  args: { roomName: null, roomNameLoading: true },
};

// 2-1 で4行に折り返す長い課題。最後の行が下の票の段に隠れない。
export const LongIssueWithVotes: Story = {
  args: {
    phase: buildPhaseStep(1, 2),
    issueReference: buildCarryover({
      fontSize: 14,
      dotVotes: { subjective: 3, objective: 2 },
    }),
    hmwReference: null,
    hmwDecidedIssue:
      "部室の鍵の受け渡しがいつも面倒で、誰が持っているのか分からず待たされる。誰にも注意できない",
    decidedHmw: null,
  },
};
