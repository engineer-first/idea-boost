import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";
import { buildLobbyPhase, buildPhaseStep } from "@/contracts/phase.fixture";
import { buildMembers } from "@/contracts/room-protocol.fixture";
import { RoomEntryPreview } from "@/features/room";
import {
  InviteCodeDialogView,
  RoomAdmissionGate,
  RoomReauthentication,
} from "@/features/room-lifecycle";
import { AppHeader } from "../app-header";

const ME = "11111111-1111-4111-8111-111111111111";
const ROOM = "22222222-2222-4222-8222-222222222222";
const preview = {
  members: buildMembers(3, ME),
  currentUserId: ME,
  hostUserId: ME,
  isHost: true,
  inviteCode: "AB12CD",
  inviteUrl: "https://example.test/invite/AB12CD",
};
const meta = {
  title: "Home/RoomEntryReauthentication",
  component: RoomReauthentication,
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <div className="flex h-dvh flex-col">
        <Story />
      </div>
    ),
  ],
  args: { operation: { kind: "join", inviteCode: "AB12CD" } },
} satisfies Meta<typeof RoomReauthentication>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Invite: Story = {
  render: (args) => (
    <>
      <InviteCodeDialogView
        inviteCode="AB12CD"
        hostName="Owner"
        open
        pending={false}
        onOpenChange={fn()}
        onConfirm={fn()}
      />
      <RoomReauthentication {...args} onBack={fn()} />
    </>
  ),
};
export const Board: Story = {
  render: () => (
    <RoomAdmissionGate
      roomId={ROOM}
      fallback={<RoomEntryPreview {...preview} phase={buildPhaseStep(1)} />}
    >
      <p>接続後のボード</p>
    </RoomAdmissionGate>
  ),
};
export const Lobby: Story = {
  render: () => (
    <>
      <AppHeader userName="Owner" />
      <RoomAdmissionGate
        roomId={ROOM}
        stage="lobby"
        fallback={<RoomEntryPreview {...preview} phase={buildLobbyPhase()} />}
      >
        <p>接続後のロビー</p>
      </RoomAdmissionGate>
    </>
  ),
};
