import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";
import { RecentRoomsSectionView } from "./recent-rooms-section-view";

const NOW = Date.UTC(2026, 10, 26, 3);
const DAY = 24 * 60 * 60 * 1000;

const meta = {
  title: "RoomLifecycle/RecentRoomsSectionView",
  component: RecentRoomsSectionView,
  args: {
    rooms: [
      {
        roomId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        label: "3年2組 Aチーム",
        status: "active",
        createdAt: NOW - 2 * DAY,
        expiresAt: NOW + 180 * DAY,
      },
      {
        roomId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        label: "通学路の危ない場所を地図で共有するアプリ",
        status: "completed",
        completedAt: Date.UTC(2026, 10, 20),
        createdAt: Date.UTC(2026, 10, 18),
        expiresAt: NOW + 174 * DAY,
      },
      {
        roomId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        label: "学食の混み具合が分かる掲示板",
        status: "completed",
        completedAt: Date.UTC(2026, 10, 12),
        createdAt: Date.UTC(2026, 10, 12),
        expiresAt: NOW + 6 * 60 * 60 * 1000,
      },
    ],
    now: NOW,
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
/** 日付が無い古い記録でも、名前と状態だけのカードとして崩れない。 */
export const WithoutDates: Story = {
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
        expiresAt: NOW + 174 * DAY,
      },
    ],
  },
};
export const Opening: Story = { args: { opening: true } };
export const OpenFailed: Story = {
  args: { message: "このルームには戻れません。" },
};
export const LoadFailed: Story = { args: { rooms: [], loadFailed: true } };
