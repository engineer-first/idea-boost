import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { LobbyFlowGuide } from "./lobby-flow-guide";
import styles from "./lobby-flow-guide.stories.module.css";

const meta = {
  title: "Room/LobbyFlowGuide",
  component: LobbyFlowGuide,
  decorators: [
    (Story, context) => (
      <div
        style={{
          width: context.parameters.guideWidth ?? 560,
          height: context.parameters.guideHeight,
          display: "grid",
        }}
      >
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof LobbyFlowGuide>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Wide: Story = { name: "PC の左パネル幅" };
export const Narrow: Story = {
  name: "スマホ幅",
  parameters: { guideWidth: 328 },
};
// PC の低い画面では文字を小さくせず、パネルの中をスクロールして読む。
export const Short: Story = {
  name: "PC の低い画面",
  parameters: { guideWidth: 547, guideHeight: 482 },
  args: { className: styles.fixedHeight },
};
