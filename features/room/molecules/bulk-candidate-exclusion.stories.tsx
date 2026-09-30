import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useEffect, useState } from "react";
import { fn, userEvent, within } from "storybook/test";
import { BulkCandidateExclusion } from "./bulk-candidate-exclusion";

const meta = {
  title: "Room/BulkCandidateExclusion",
  component: BulkCandidateExclusion,
  args: { targetCount: 3, disabled: false, onConfirm: fn() },
  decorators: [
    (Story) => (
      <div className="flex min-h-48 items-end justify-center bg-muted/30 p-8">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof BulkCandidateExclusion>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithTargets: Story = {};
export const Empty: Story = { args: { targetCount: 0 } };
export const Confirming: Story = {
  play: async ({ canvasElement }) => {
    await userEvent.click(
      within(canvasElement).getByRole("button", {
        name: "投票なしをまとめて候補から外す（3件）",
      }),
    );
  },
};

// 確認を開いた後に通信が切れた状態。確定だけを止め、取消へ戻れる。
export const DisconnectedWhileConfirming: Story = {
  render: (args) => {
    const [disabled, setDisabled] = useState(false);
    useEffect(() => {
      const disconnect = (): void => setDisabled(true);
      window.addEventListener("u11:disconnect", disconnect);
      return () => window.removeEventListener("u11:disconnect", disconnect);
    }, []);
    return <BulkCandidateExclusion {...args} disabled={disabled} />;
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole("button", {
        name: "投票なしをまとめて候補から外す（3件）",
      }),
    );
    // 共有状態を作らず、確認が開いた後の接続props変更を再現する。
    canvasElement.ownerDocument.defaultView?.dispatchEvent(
      new Event("u11:disconnect"),
    );
  },
};
