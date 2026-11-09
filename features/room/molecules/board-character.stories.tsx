import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { BoardCharacter } from "./board-character";

const meta = {
  title: "Room/BoardCharacter",
  component: BoardCharacter,
  decorators: [
    (Story) => (
      <div className="relative h-96">
        <div className="absolute top-3 left-3">
          <Story />
        </div>
      </div>
    ),
  ],
  args: { message: null },
} satisfies Meta<typeof BoardCharacter>;
export default meta;
type Story = StoryObj<typeof meta>;

// 通信しないローカルUIなので loading / error は持たない。
export const Empty: Story = {};
export const FirstNote: Story = {
  args: { message: "思いついたことを、まず1枚書いてみよう。" },
};
export const TimeRemaining: Story = {
  args: { message: "残り30秒、今の考えをまとめよう。" },
};
export const TimeEnded: Story = {
  args: { message: "時間になったよ、次の工程をみんなで確認しよう。" },
};

export const Opening: Story = {
  args: { message: "最近困ったことを、1枚に1つずつ書こう。" },
};
export const Tip: Story = {
  args: { message: "『誰が』『いつ』困るかを入れると伝わりやすいよ。" },
};

export const BubbleBelowWhenCrowded: Story = {
  args: { message: "最近困ったことを、1枚に1つずつ書こう。" },
  decorators: [
    (Story) => (
      <div className="[--board-character-bubble-top:100%] [--board-character-bubble-left:0px] [--board-character-bubble-gap:0px]">
        <Story />
      </div>
    ),
  ],
};
