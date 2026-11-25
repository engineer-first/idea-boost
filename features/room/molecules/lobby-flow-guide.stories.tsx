import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { LobbyFlowGuide } from "./lobby-flow-guide";

const meta = {
  title: "Room/LobbyFlowGuide",
  component: LobbyFlowGuide,
  decorators: [
    (Story, context) => (
      <div style={{ width: context.parameters.guideWidth ?? 560 }}>
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
