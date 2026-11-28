import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { AdvanceNoticeBand } from "./advance-notice-band";

// 残り時間が減っていく様子を見られるよう、開いた時刻から数える。
const meta = {
  title: "Room/AdvanceNoticeBand",
  component: AdvanceNoticeBand,
  parameters: { layout: "fullscreen" },
  args: {
    cause: "member",
    initiatorName: "あおい",
    phase: { kind: "step", phase: 1, step: 1 },
    endsAt: 0,
    durationMs: 5000,
    serverOffsetMs: 0,
    stop: { kind: "hold", onStop: fn() },
  },
  render: (args) => (
    <div style={{ paddingBlock: 120 }}>
      <AdvanceNoticeBand
        {...args}
        endsAt={args.endsAt || Date.now() + args.durationMs}
      />
    </div>
  ),
} satisfies Meta<typeof AdvanceNoticeBand>;

export default meta;
type Story = StoryObj<typeof meta>;

// ほかの人が「次のステップへ」を押した。「まって！」で止められる。
export const PressedByMember: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("status")).toHaveTextContent(
      "あおいさんが進めます",
    );
    await userEvent.click(canvas.getByRole("button", { name: "まって！" }));
    await expect(args.stop?.onStop).toHaveBeenCalledOnce();
  },
};

// 自分が押した。「やめる」で取り消せる。
export const PressedBySelf: Story = {
  args: {
    cause: "self",
    initiatorName: undefined,
    stop: { kind: "withdraw", onStop: fn() },
  },
};

// 全員が票を使い切った。誰も押していないので名前は出ない。
export const VotesComplete: Story = {
  args: {
    cause: "votes",
    initiatorName: undefined,
    phase: { kind: "step", phase: 1, step: 4 },
  },
};

// 時間切れ。10秒数え、「＋1分」で1回だけ延ばせる。
export const TimeUp: Story = {
  args: {
    cause: "timer",
    initiatorName: undefined,
    durationMs: 10_000,
    stop: { kind: "extend", onStop: fn() },
  },
};

// 延長を使った後の時間切れ。止めるボタンは無く、このまま進む。
export const TimeUpAfterExtension: Story = {
  args: {
    cause: "timer",
    initiatorName: undefined,
    durationMs: 10_000,
    stop: null,
  },
};

// 文言がいちばん長いステップ（3-2 → 3-3 2軸評価）と長い名前。
export const LongCopy: Story = {
  args: {
    initiatorName: "とても長い名前のメンバーさんです",
    phase: { kind: "step", phase: 3, step: 2 },
  },
};

// 再接続中など、止める要求を送れない間。
export const StopUnavailable: Story = {
  args: { stop: { kind: "hold", onStop: fn(), disabled: true } },
};
