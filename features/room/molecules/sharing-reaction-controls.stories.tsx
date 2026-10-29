import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import { fn, userEvent, within } from "storybook/test";
import { buildPhaseStep } from "@/contracts/phase.fixture";
import type { SharingReactionKind } from "@/contracts/sharing-reactions";
import { SHARING_REACTION_OPTIONS } from "../logic/sharing-reaction-options";
import { useSharingReactions } from "../logic/use-sharing-reactions";
import { SharingReactionControls } from "./sharing-reaction-controls";

const sharingPhase = buildPhaseStep(2);

const meta = {
  title: "Room/SharingReactionControls",
  component: SharingReactionControls,
  args: { disabled: false, onSendReaction: fn() },
  decorators: [
    (Story) => (
      <div className="flex min-h-52 items-end justify-center bg-muted/20 p-6">
        <div className="rounded-xl border border-border bg-background p-1 shadow-lg shadow-black/5">
          <Story />
        </div>
      </div>
    ),
  ],
} satisfies Meta<typeof SharingReactionControls>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const ReactionHint: Story = {
  play: async ({ canvas, canvasElement }) => {
    await userEvent.hover(canvas.getByRole("button", { name: "リアクション" }));
    await within(canvasElement.ownerDocument.body).findByRole(
      "tooltip",
      {},
      { timeout: 2000 },
    );
  },
};

export const BarOpen: Story = {
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "リアクション" }));
  },
};

export const LikeHint: Story = {
  play: async ({ canvas, canvasElement }) => {
    await userEvent.click(canvas.getByRole("button", { name: "リアクション" }));
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.hover(body.getByRole("button", { name: "いいねを送る" }));
    await body.findByRole("tooltip", {}, { timeout: 2000 });
  },
};

export const QuestionHint: Story = {
  play: async ({ canvas, canvasElement }) => {
    await userEvent.click(canvas.getByRole("button", { name: "リアクション" }));
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.hover(
      body.getByRole("button", { name: "どうして？のリアクションを送る" }),
    );
    await body.findByRole("tooltip", {}, { timeout: 2000 });
  },
};

export const WaitingToSend: Story = {
  render: function WaitingToSend(args) {
    const [disabled, setDisabled] = useState(false);
    return (
      <SharingReactionControls
        {...args}
        disabled={disabled}
        onSendReaction={(kind) => {
          args.onSendReaction(kind);
          setDisabled(true);
        }}
      />
    );
  },
  play: async ({ canvas, canvasElement }) => {
    await userEvent.click(canvas.getByRole("button", { name: "リアクション" }));
    await userEvent.click(
      within(canvasElement.ownerDocument.body).getByRole("button", {
        name: "いいねを送る",
      }),
    );
  },
};

export const Disconnected: Story = {
  args: { disabled: true },
};

export const RepeatedSending: Story = {
  render: function RepeatedSending(args) {
    const [sentCount, setSentCount] = useState(0);
    const [lastKind, setLastKind] = useState<SharingReactionKind | null>(null);
    const { canSendReaction, sendReaction } = useSharingReactions({
      phase: sharingPhase,
      phaseRevision: 3,
      connectionStatus: "open",
      send: (message) => {
        if (message.type === "reaction:send") {
          args.onSendReaction(message.kind);
          setLastKind(message.kind);
        }
        setSentCount((current) => current + 1);
        return true;
      },
    });
    return (
      <div className="flex items-center gap-4">
        <SharingReactionControls
          disabled={!canSendReaction}
          onSendReaction={sendReaction}
        />
        <output aria-label="リアクションの送信回数">{sentCount}</output>
        <output aria-label="最後に送ったリアクション">
          {lastKind === null
            ? "未送信"
            : SHARING_REACTION_OPTIONS[lastKind].label}
        </output>
      </div>
    );
  },
};
