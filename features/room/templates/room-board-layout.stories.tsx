import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { userEvent, within } from "storybook/test";
import { buildPhaseStep } from "@/contracts/phase.fixture";
import {
  buildDecision,
  buildMembers,
  buildNotes,
} from "@/contracts/room-protocol.fixture";
import { RoomBoardView } from "./room-board-view";
import boardMeta from "./room-board-view.stories";

const LONG_ISSUE =
  "チームで何を作るか決めるとき、発言が得意な人の意見だけで進んでしまい、初めて参加する学生が自分の困りごとや案を出せない。全員が自分の考えを伝え、互いの案を比べられるようにしたい。";
const LONG_HMW =
  "どうすれば私たちは、初参加の学生も安心して自分の考えを書き出し、全員の案を根拠とともに比較して、納得できるアイデアを選べるだろうか？";
const PRIVATE_NOTES = buildNotes(20).map((note, index) => ({
  ...note,
  visibility: "private" as const,
  content: `${index + 1}. 参加者全員が安心して書ける時間をつくり、困っている場面と解決案を一つずつ比べる。`,
}));

const VOTED_NOTES = buildNotes(3).map((note) => ({
  ...note,
  dotVotes: {
    ...note.dotVotes,
    subjective: { ...note.dotVotes.subjective, count: 1 },
  },
}));

const meta = {
  ...boardMeta,
  title: "Room/RoomBoardLayout",
  component: RoomBoardView,
  parameters: { layout: "fullscreen", chromatic: { viewports: [1280] } },
  decorators: [
    (Story) => (
      <div style={{ height: 720, overflow: "hidden" }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof RoomBoardView>;
export default meta;
type Story = StoryObj<typeof meta>;

function step(phase: 1 | 2 | 3, value: number): Story {
  return {
    name: `${phase}-${value}`,
    args: {
      phase: buildPhaseStep(value, phase),
      notes: value === 1 ? [] : buildNotes(3),
      hmwDecidedIssue: phase >= 2 ? LONG_ISSUE : null,
      decidedHmw: phase === 3 ? LONG_HMW : null,
      members: buildMembers(12, boardMeta.args.currentUserId),
      interactions: {
        ...boardMeta.args.interactions,
        privateNotes: PRIVATE_NOTES,
      },
      timer: { status: "paused", remainingMs: 138_000, durationMs: 180_000 },
    },
  };
}
export const Phase1Step1: Story = step(1, 1);
export const Phase1Step2: Story = step(1, 2);
export const Phase1Step3: Story = step(1, 3);
export const Phase1Step4: Story = step(1, 4);
export const Phase1Step5: Story = step(1, 5);
export const Phase2Step1: Story = step(2, 1);
export const Phase2Step2: Story = step(2, 2);
export const Phase2Step3: Story = step(2, 3);
export const Phase2Step4: Story = step(2, 4);
export const Phase3Step1: Story = step(3, 1);
export const Phase3Step2: Story = step(3, 2);
export const Phase3Step3: Story = step(3, 3);
export const Phase3Step4: Story = step(3, 4);
export const Phase3Step5: Story = step(3, 5);
export const ReferenceAndNotes: Story = {
  ...step(3, 1),
  name: "支援とマイ付箋を同時表示",
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole("button", { name: "マイ付箋を開く" }),
    );
    await userEvent.click(canvas.getByRole("tab", { name: "発想を広げる" }));
  },
};
export const Focused: Story = {
  ...step(3, 1),
  name: "補助情報を閉じて作業",
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole("button", { name: "考えるヒントを閉じる" }),
    );
    await userEvent.click(
      canvas.getByRole("button", {
        name: "ファシリテーションガイドを折り畳む",
      }),
    );
  },
};
export const Reconnecting: Story = {
  ...step(3, 1),
  name: "再接続中",
  args: { ...step(3, 1).args, connectionStatus: "closed" },
};
export const Participant: Story = {
  ...step(3, 1),
  name: "参加者",
  args: { ...step(3, 1).args, isHost: false },
};

export const Completed: Story = {
  ...step(3, 5),
  name: "アイデア決定後",
  args: {
    ...step(3, 5).args,
    notes: VOTED_NOTES,
    decision: buildDecision({ phase: 3, noteId: VOTED_NOTES[0].id }),
  },
};

// 各1幅だけを追加するため、全件撮影時の増分は2スナップショット。
export const LaptopWidth: Story = {
  ...ReferenceAndNotes,
  name: "1024pxの上部と左右パネル",
  parameters: { chromatic: { viewports: [1024] } },
};
export const NarrowWidth: Story = {
  ...ReferenceAndNotes,
  name: "768pxの上部2段表示",
  parameters: { chromatic: { viewports: [768] } },
};
