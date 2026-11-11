import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn, userEvent, within } from "storybook/test";
import { HmwHintCharacter } from "./hmw-hint-character";

const meta = {
  title: "Hmw/HmwHintCharacter",
  component: HmwHintCharacter,
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <div className="relative min-h-screen bg-background">
        <div className="absolute bottom-6 left-6">
          <Story />
        </div>
      </div>
    ),
  ],
  args: {
    decidedIssue: "睡眠不足で眠たい",
    onUseQuestion: fn(),
    showNudge: true,
  },
} satisfies Meta<typeof HmwHintCharacter>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {
  name: "呼びかけ前",
  args: { showNudge: false },
};
export const Nudge: Story = { args: { showNudge: true } };
export const BubbleOpensWords: Story = {
  ...Nudge,
  play: async ({ canvasElement }) => {
    await userEvent.click(
      within(canvasElement).getByRole("button", {
        name: /こんな問い方も.*あるかも/,
      }),
    );
  },
};
export const Words: Story = {
  play: async ({ canvasElement }) => {
    await userEvent.click(
      within(canvasElement).getByRole("button", { name: "問いのヒントを開く" }),
    );
  },
};
export const Question: Story = {
  play: async (context) => {
    await Words.play?.(context);
    await userEvent.click(
      within(context.canvasElement.ownerDocument.body).getByRole("button", {
        name: "先回り",
      }),
    );
  },
};
export const ChooseAnotherWord: Story = {
  play: async (context) => {
    await Question.play?.(context);
    await userEvent.click(
      within(context.canvasElement.ownerDocument.body).getByRole("button", {
        name: "別のワードを選択する",
      }),
    );
  },
};
export const WriteTogether: Story = {
  play: async (context) => {
    await Question.play?.(context);
    await userEvent.click(
      within(context.canvasElement.ownerDocument.body).getByRole("button", {
        name: "この問いにする",
      }),
    );
  },
};
export const Waiting: Story = { ...Question, args: { pending: true } };
export const Disconnected: Story = { ...Question, args: { disabled: true } };
export const MissingIssue: Story = { ...Words, args: { decidedIssue: null } };
export const LongIssue: Story = {
  ...Question,
  args: { decidedIssue: "時間に余裕がなくて困る。".repeat(180) },
};
