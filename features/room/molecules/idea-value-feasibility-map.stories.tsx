import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { IdeaValueFeasibilityMap } from "./idea-value-feasibility-map";

// マップはボードの原点を中心に置く。ボードと同じく原点を枠の中央へ置き、縮小して見せる。
const STORY_ZOOM = 0.6;

const meta = {
  title: "Room/IdeaValueFeasibilityMap",
  component: IdeaValueFeasibilityMap,
  parameters: {
    layout: "fullscreen",
  },
  args: {
    cameraZoom: STORY_ZOOM,
  },
  decorators: [
    (Story) => (
      <div className="relative h-[760px] overflow-hidden bg-muted/20">
        <div
          className="absolute top-1/2 left-1/2"
          style={{
            transform: `scale(${STORY_ZOOM})`,
            transformOrigin: "0 0",
          }}
        >
          <Story />
        </div>
      </div>
    ),
  ],
} satisfies Meta<typeof IdeaValueFeasibilityMap>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  name: "価値 × 実現のしやすさ / 小さいマップ",
};
