import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { IdeaValueFeasibilityMap } from "./idea-value-feasibility-map";

// マップはボードの原点を中心に置く。ボードと同じく原点を枠の中央へ置き、
// cameraZoom の倍率で縮小して見せる（ボードのカメラの代わり）。
const meta = {
  title: "Room/IdeaValueFeasibilityMap",
  component: IdeaValueFeasibilityMap,
  parameters: {
    layout: "fullscreen",
  },
  args: {
    cameraZoom: 0.6,
  },
  decorators: [
    (Story, { args }) => (
      <div className="relative h-[760px] overflow-hidden bg-muted/20">
        <div
          className="absolute top-1/2 left-1/2"
          style={{
            transform: `scale(${args.cameraZoom ?? 1})`,
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

// 狭い画面で全体表示したときの低い倍率。軸の文字と矢印の間は画面上の最小値を保つ。
export const ZoomedOut: Story = {
  name: "価値 × 実現のしやすさ / 縮小して全体を見る（0.3倍）",
  args: { cameraZoom: 0.3 },
};

export const Widened: Story = {
  name: "価値 × 実現のしやすさ / 広げたマップ（4段階）",
  args: { sizeLevel: 4, cameraZoom: 0.3 },
};
