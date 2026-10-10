import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";
import { buildLobbyPhase, buildPhaseStep } from "@/contracts/phase.fixture";
import { buildMembers } from "@/contracts/room-protocol.fixture";
import { RoomEntryPreview } from "@/features/room";
import {
  CreateRoomSectionView,
  JoinRoomSectionView,
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
export const Home: Story = {
  render: (args) => (
    <>
      <AppHeader userName="Owner" />
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto bg-muted/40 p-4 sm:p-6">
        <div className="my-auto flex w-full max-w-2xl flex-col gap-6">
          <header className="space-y-2 text-center">
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              アイデア出しを始めましょう
            </h1>
            <p className="text-sm text-muted-foreground">
              新しいルームを作成するか、招待コードを入力して参加できます。
            </p>
          </header>
          <div className="grid gap-4 sm:grid-cols-2 sm:items-start">
            <CreateRoomSectionView
              intentName="新しいサービスの相談"
              onSubmit={fn()}
            />
            <JoinRoomSectionView
              code="AB12CD"
              onCodeChange={fn()}
              dialogOpen={false}
              onDialogOpenChange={fn()}
              hostName="Owner"
              onSubmit={fn()}
              onConfirm={fn()}
            />
          </div>
        </div>
      </div>
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
