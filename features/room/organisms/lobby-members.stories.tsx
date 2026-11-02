import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";
import { LobbyMembers } from "./lobby-members";
import { buildLobbyMembers } from "./lobby-members.fixture";

const ME = "11111111-1111-4111-8111-111111111111";
const meta = {
  title: "Room/LobbyMembers",
  component: LobbyMembers,
  parameters: { layout: "padded" },
  args: {
    members: buildLobbyMembers(4, ME),
    currentUserId: ME,
    hostUserId: ME,
    disabled: false,
    onEditSelf: fn(),
    onSelectMember: fn(),
    avatarChange: {
      pending: false,
      disabled: false,
      unavailable: false,
      error: null,
      randomize: fn(),
    },
  },
} satisfies Meta<typeof LobbyMembers>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Four: Story = {};
export const Solo: Story = { args: { members: buildLobbyMembers(1, ME) } };
export const Ten: Story = { args: { members: buildLobbyMembers(10, ME) } };
export const Twenty: Story = {
  args: {
    members: buildLobbyMembers(20, ME),
    avatarChange: {
      ...meta.args.avatarChange,
      unavailable: true,
      disabled: true,
    },
  },
};
export const Disconnected: Story = { args: { connectedUserIds: [ME] } };
export const Changing: Story = {
  args: {
    avatarChange: { ...meta.args.avatarChange, pending: true, disabled: true },
  },
};
