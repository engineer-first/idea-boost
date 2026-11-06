import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";
import { BoardCharacter } from "./board-character";

const meta = {
  title: "Room/BoardCharacter",
  component: BoardCharacter,
  decorators: [
    (Story) => (
      <div className="relative h-96">
        <div className="absolute top-1/2 left-3 -translate-y-1/2">
          <Story />
        </div>
      </div>
    ),
  ],
  args: { message: null, onReplay: fn() },
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
