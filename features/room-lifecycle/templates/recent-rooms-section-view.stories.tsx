import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";
import { RecentRoomsSectionView } from "./recent-rooms-section-view";

const meta = {
  title: "RoomLifecycle/RecentRoomsSectionView",
  component: RecentRoomsSectionView,
  args: {
    rooms: [
      {
        roomId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        label: "3年2組 Aチーム",
        status: "active",
      },
      {
        roomId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        label: "通学路の危ない場所を地図で共有するアプリ",
        status: "completed",
        completedAt: Date.UTC(2026, 10, 20),
      },
      {
        roomId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        label: "学食の混み具合が分かる掲示板",
        status: "completed",
        completedAt: Date.UTC(2026, 10, 12),
      },
    ],
    onOpenActive: fn(),
    onRetry: fn(),
  },
  decorators: [
    (Story) => (
      <div className="mx-auto max-w-2xl p-4">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof RecentRoomsSectionView>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Rooms: Story = {};
export const Opening: Story = { args: { opening: true } };
export const OpenFailed: Story = {
  args: { message: "このルームには戻れません。" },
};
export const LoadFailed: Story = { args: { rooms: [], loadFailed: true } };
