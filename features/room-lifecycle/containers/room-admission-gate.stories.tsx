import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";
import type { GuestRoomEntryResult } from "@/features/auth";
import { RoomAdmissionGate } from "./room-admission-gate";

const meta = {
  title: "RoomLifecycle/RoomAdmissionGate",
  component: RoomAdmissionGate,
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <div className="h-dvh">
        <Story />
      </div>
    ),
  ],
  args: {
    roomId: "11111111-1111-4111-8111-111111111111",
    children: <p>入室確認後のルーム</p>,
    fallback: (
      <div inert aria-hidden="true" className="relative h-full bg-muted/20 p-6">
        <div className="rounded-xl border bg-background p-4">ルームの背景</div>
        <p className="absolute inset-x-4 bottom-24 text-center text-sm text-muted-foreground">
          入室を確認してから、このルームの付箋を読み込みます。
        </p>
      </div>
    ),
    onRefreshed: fn(),
    refreshAction: (_roomId: string): Promise<GuestRoomEntryResult> =>
      new Promise(() => {}),
  },
} satisfies Meta<typeof RoomAdmissionGate>;
export default meta;
type Story = StoryObj<typeof meta>;

export const AccountAuthenticationRequired: Story = {
  args: { sessionKind: "account" },
};
export const Checking: Story = {
  args: { sessionKind: "guest" },
};
export const Retry: Story = {
  args: {
    sessionKind: "guest",
    refreshAction: async () => ({ ok: false, reason: "retry" }),
  },
};
export const IdentityUnavailable: Story = {
  args: {
    sessionKind: "guest",
    refreshAction: async () => ({ ok: false, reason: "identity_unavailable" }),
  },
};
