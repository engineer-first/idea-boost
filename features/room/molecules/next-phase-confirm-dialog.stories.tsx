import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { NextPhaseConfirmDialog } from "./next-phase-confirm-dialog";

const meta = {
  title: "Room/NextPhaseConfirmDialog",
  component: NextPhaseConfirmDialog,
  args: {
    disabled: false,
    onConfirm: fn(),
  },
} satisfies Meta<typeof NextPhaseConfirmDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

// トリガーボタンだけが見えている状態。
export const Default: Story = {};

// 全員完了してから押す場合はダイアログを開かず、そのまま進む。
export const AllReady: Story = {
  args: { requireConfirmation: false },
  play: async ({ canvasElement, args }) => {
    await userEvent.click(
      within(canvasElement).getByRole("button", { name: "次のステップへ" }),
    );
    await expect(args.onConfirm).toHaveBeenCalledOnce();
    await expect(
      within(canvasElement.ownerDocument.body).queryByRole("alertdialog"),
    ).not.toBeInTheDocument();
  },
};

// 移行処理中など、待つ理由を示せない場合は破線の枠だけで押せないことを示す。
export const Disabled: Story = {
  args: {
    disabled: true,
  },
};

// メンバーの完了を待つ間は、完了した人数ぶん面が満ち、あと何人かを示す。
export const WaitingMembers: Story = {
  args: {
    disabled: true,
    waiting: { kind: "members", remaining: 2, total: 5 },
  },
};

export const WaitingLastMember: Story = {
  args: {
    disabled: true,
    waiting: { kind: "members", remaining: 1, total: 5 },
  },
};

// 通信が戻るのを待つ間は、淡い帯が往復する。
export const WaitingConnection: Story = {
  args: {
    disabled: true,
    waiting: { kind: "connection" },
  },
};

// 押下後、確認ダイアログが開いた状態。
export const Opened: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      await canvas.findByRole("button", { name: "次のステップへ" }),
    );
  },
};

// 開いた後にControlsでrequireConfirmationをfalse、notReadyNamesを[]にすると、
// 全員完了後もダイアログが残り「次へ進む」を押せることを確認できる。
export const WaitingForMember: Story = {
  args: {
    requireConfirmation: true,
    notReadyNames: ["Member"],
  },
  play: Opened.play,
};

export const ManyWaitingMembers: Story = {
  args: {
    requireConfirmation: true,
    notReadyNames: Array.from(
      { length: 20 },
      (_, index) => `メンバー${index + 1}`,
    ),
  },
  play: Opened.play,
};
