import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { buildPhaseStep } from "@/contracts/phase.fixture";
import { NextPhaseConfirmDialog } from "./next-phase-confirm-dialog";

const STEP_1_1 = buildPhaseStep(1);
const STEP_1_3 = buildPhaseStep(3);

const meta = {
  title: "Room/NextPhaseConfirmDialog",
  component: NextPhaseConfirmDialog,
  args: {
    phase: STEP_1_1,
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

// 未接続・移行処理中・最終フェーズでは操作できない。
export const Disabled: Story = {
  args: {
    disabled: true,
  },
};

// 押下後、確認ダイアログが開いた状態（現在フェーズのラベルが説明に入る）。
export const Opened: Story = {
  args: {
    phase: STEP_1_3,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      await canvas.findByRole("button", { name: "次のステップへ" }),
    );
  },
};

// 個人作業から共有へ進む際の空白付箋の整理を説明する。
export const LeavingPersonalWork: Story = {
  args: { phase: STEP_1_1 },
  play: Opened.play,
};

// 開いた後にControlsでrequireConfirmationをfalse、notReadyNamesを[]にすると、
// 全員完了後もダイアログが残り「次へ進む」を押せることを確認できる。
export const WaitingForMember: Story = {
  args: {
    phase: STEP_1_1,
    requireConfirmation: true,
    notReadyNames: ["Member"],
  },
  play: Opened.play,
};
