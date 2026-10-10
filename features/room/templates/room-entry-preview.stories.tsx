import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { buildLobbyPhase, buildPhaseStep } from "@/contracts/phase.fixture";
import { buildMembers } from "@/contracts/room-protocol.fixture";
import { RoomEntryPreview } from "./room-entry-preview";

const ME = "11111111-1111-4111-8111-111111111111";
const meta = {
  title: "Room/RoomEntryPreview",
  component: RoomEntryPreview,
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <div className="h-dvh">
        <Story />
      </div>
    ),
  ],
  args: {
    phase: buildPhaseStep(1),
    members: buildMembers(3, ME),
    currentUserId: ME,
    hostUserId: ME,
    isHost: true,
    inviteCode: "AB12CD",
    inviteUrl: "https://example.test/invite/AB12CD",
  },
} satisfies Meta<typeof RoomEntryPreview>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Board: Story = {};
export const Lobby: Story = { args: { phase: buildLobbyPhase() } };
