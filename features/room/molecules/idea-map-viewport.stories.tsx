import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { IdeaMapViewport } from "./idea-map-viewport";

const meta = {
  title: "Room/IdeaMapViewport",
  component: IdeaMapViewport,
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <div className="relative h-[760px] overflow-hidden bg-muted/20">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof IdeaMapViewport>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  name: "固定2軸マップ",
  args: {
    children: (
      <div
        className="absolute bottom-[45%] left-[35%] flex h-[150px] w-[200px] rounded-sm bg-amber-200 p-3 text-sm shadow-md"
        data-testid="idea-map-viewport-story-note"
      >
        アイデアをここに配置
      </div>
    ),
  },
};

export const Workspace: Story = {
  name: "評価画面のマップ",
  args: { ...Default.args, workspace: true },
};
