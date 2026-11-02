import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  SHARING_REACTION_KINDS,
  SHARING_REACTION_MAX_VISIBLE,
} from "@/contracts/sharing-reactions";
import { SharingReactionDisplay } from "./sharing-reaction-display";
import { buildSharingReactionDisplayFixture } from "./sharing-reaction-display.fixture";

const meta = {
  title: "Room/SharingReactionDisplay",
  component: SharingReactionDisplay,
  parameters: { layout: "fullscreen" },
  args: { reactions: buildSharingReactionDisplayFixture() },
  decorators: [
    function Preview(Story) {
      const [preview, setPreview] = useState(0);
      return (
        <div className="relative h-dvh border border-border bg-muted/20">
          <div className="absolute bottom-4 left-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => setPreview((current) => current + 1)}
            >
              もう一度表示
            </Button>
          </div>
          <Story key={preview} />
        </div>
      );
    },
  ],
} satisfies Meta<typeof SharingReactionDisplay>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SingleLike: Story = {};

export const ThreeLikes: Story = {
  args: { reactions: buildSharingReactionDisplayFixture(3) },
};

export const SimultaneousLikes: Story = {
  args: {
    reactions: buildSharingReactionDisplayFixture(SHARING_REACTION_MAX_VISIBLE),
  },
};

export const AllKinds: Story = {
  args: {
    reactions: buildSharingReactionDisplayFixture(
      SHARING_REACTION_KINDS.length,
      SHARING_REACTION_KINDS,
    ),
  },
};

export const SingleQuestion: Story = {
  args: { reactions: buildSharingReactionDisplayFixture(1, ["question"]) },
};

export const Empty: Story = {
  args: { reactions: [] },
};

export const SuccessiveReactions: Story = {
  render: function SuccessiveReactions() {
    const [count, setCount] = useState(0);
    const reactions = buildSharingReactionDisplayFixture(
      count,
      SHARING_REACTION_KINDS,
    ).slice(-SHARING_REACTION_MAX_VISIBLE);
    return (
      <div className="p-4">
        <Button onClick={() => setCount((current) => current + 1)}>
          受信を追加
        </Button>
        <label>
          入力確認
          <input aria-label="入力確認" className="border" />
        </label>
        <SharingReactionDisplay reactions={reactions} />
      </div>
    );
  },
};
