import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";
import { RoomOutcomeView } from "./room-outcome-view";

const meta = {
  title: "Room/RoomOutcomeView",
  component: RoomOutcomeView,
  parameters: { layout: "fullscreen" },
  args: {
    connected: true,
    outcome: {
      issue: "空きコマに一緒に勉強する仲間が見つからない",
      hmw: "どうすれば、空きコマに気軽に学び合う仲間と出会えるだろう？",
      idea: "空きコマ勉強マッチ：科目・空き時間の募集にワンタップで参加",
    },
    onBackToBoard: fn(),
  },
  decorators: [
    (Story) => (
      <div style={{ height: "100vh" }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof RoomOutcomeView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Complete: Story = {};
export const LongContent: Story = {
  args: {
    outcome: {
      issue:
        "初めて参加する学生が意見を出しづらい。\n" +
        "発言の機会が限られ、自分の考えが十分に伝わらない。".repeat(40),
      hmw:
        "どうすれば全員が安心してアイデアを共有できるだろうか？\n" +
        "初めて参加した人の目線で考える。".repeat(40),
      idea: `${"最初の一分は匿名でアイデアを書く。気になる案から話し始める。\n".repeat(100).slice(0, 1996)}末尾確認`,
    },
  },
};
export const Disconnected: Story = { args: { connected: false } };
export const MissingDecision: Story = { args: { outcome: null } };
