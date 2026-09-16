import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { buildMembers } from "@/contracts/room-protocol.fixture";
import { ROOM_MEMBERS_MAX_VISIBLE, RoomMembers } from "./room-members";

const ME = "11111111-1111-4111-8111-111111111111";

const meta = {
  title: "RoomMembers/RoomMembers",
  component: RoomMembers,
  parameters: { layout: "padded" },
  args: {
    members: buildMembers(3, ME),
    currentUserId: ME,
    hostUserId: ME,
  },
  decorators: [
    (Story) => (
      <div style={{ padding: 24, maxWidth: 520 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof RoomMembers>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const VotingComplete: Story = {
  args: {
    members: buildMembers(3, ME),
    completedVoterIds: [buildMembers(3, ME)[0]?.userId ?? ""],
  },
};

/** ホスト以外視点（王冠が自分に付かない） */
export const NonHostView: Story = {
  args: {
    members: buildMembers(4, ME),
    hostUserId: buildMembers(4, ME).find((m) => m.userId !== ME)?.userId ?? ME,
  },
};

/** 人数バリエーションを一覧で比較 */
export const AllStates: Story = {
  render: () => {
    const states = [
      { label: "Empty", members: buildMembers(0, ME) },
      { label: "OnlyMe", members: buildMembers(1, ME) },
      { label: "Default 3", members: buildMembers(3, ME) },
      { label: "Row fill 4", members: buildMembers(4, ME) },
      { label: "8 人", members: buildMembers(8, ME) },
      {
        label: "12 人（4×3 上限）",
        members: buildMembers(ROOM_MEMBERS_MAX_VISIBLE, ME),
      },
      {
        label: "15 人（+N）",
        members: buildMembers(15, ME),
      },
    ] as const;
    return (
      <div className="flex max-w-xl flex-col gap-8">
        {states.map(({ label, members }) => (
          <div key={label} className="flex flex-col gap-2">
            <span className="font-mono text-xs text-muted-foreground">
              {label}（{members.length} 名）
            </span>
            <RoomMembers members={members} currentUserId={ME} hostUserId={ME} />
          </div>
        ))}
      </div>
    );
  },
};
