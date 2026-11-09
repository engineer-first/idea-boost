import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useRef } from "react";
import { fn, userEvent, within } from "storybook/test";
import type { ClientMessage } from "@/contracts/room-protocol";
import {
  RoomSharingReactionControls,
  RoomSharingReactionDisplay,
  RoomSharingReactions,
  type RoomSharingReactionsProps,
  type SharingReactionMessageHandler,
} from "./room-sharing-reactions";
import {
  buildRoomSharingReactionEvent,
  buildRoomSharingReactionsFixture,
} from "./room-sharing-reactions.fixture";

type PreviewProps = Omit<
  RoomSharingReactionsProps,
  "messageRef" | "children"
> & { disabled?: boolean };

function RoomSharingReactionsPreview({ disabled, ...args }: PreviewProps) {
  const messageRef = useRef<SharingReactionMessageHandler>(null);
  const sequence = useRef(0);
  const send = (message: ClientMessage): boolean | undefined => {
    const result = args.send(message);
    if (result !== false && message.type === "reaction:send") {
      messageRef.current?.applyMessage(
        buildRoomSharingReactionEvent(
          message.kind,
          ++sequence.current,
          message.phaseRevision,
        ),
      );
    }
    return result;
  };
  return (
    <RoomSharingReactions {...args} messageRef={messageRef} send={send}>
      <div className="relative h-dvh bg-muted/20">
        <div className="absolute bottom-4 left-4 rounded-xl border bg-background p-1 shadow-lg shadow-black/5">
          <RoomSharingReactionControls disabled={disabled} />
        </div>
        <RoomSharingReactionDisplay />
      </div>
    </RoomSharingReactions>
  );
}

const meta = {
  title: "Room/RoomSharingReactions",
  component: RoomSharingReactionsPreview,
  parameters: { layout: "fullscreen" },
  args: {
    ...buildRoomSharingReactionsFixture(),
    disabled: false,
    send: fn(() => true),
  },
} satisfies Meta<typeof RoomSharingReactionsPreview>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const ReceivedReaction: Story = {
  play: async ({ canvas, canvasElement }) => {
    await userEvent.click(canvas.getByRole("button", { name: "リアクション" }));
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      body.getByRole("button", { name: "どうして？のリアクションを送る" }),
    );
    await body.findByRole("img", { name: "どうして？" });
  },
};

export const Disconnected: Story = {
  args: { connectionStatus: "closed" },
};

export const Blocked: Story = {
  args: { blocked: true },
};

export const ExternallyDisabled: Story = {
  args: { disabled: true },
};
