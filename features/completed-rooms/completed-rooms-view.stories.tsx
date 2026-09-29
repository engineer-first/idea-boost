import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import { fn } from "storybook/test";
import { completedRoomFixture } from "@/contracts/completed-rooms.fixture";
import { CompletedRoomsView } from "./completed-rooms-view";

const meta = {
  title: "CompletedRooms/List",
  component: CompletedRoomsView,
  parameters: { layout: "fullscreen" },
  args: {
    rooms: [completedRoomFixture()],
    loading: false,
    error: null,
    hasMore: true,
    onRetry: fn(),
    onMore: fn(),
  },
  decorators: [
    (Story) => (
      <div className="h-screen">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof CompletedRoomsView>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Success: Story = {};
export const Loading: Story = {
  args: { rooms: [], loading: true, hasMore: false },
};
export const Empty: Story = { args: { rooms: [], hasMore: false } };
export const Unavailable: Story = {
  args: {
    rooms: [],
    error: "以前のルームを取得できませんでした。再取得をお試しください。",
    hasMore: false,
  },
};
export const LongContent: Story = {
  args: {
    rooms: [
      completedRoomFixture({
        idea: "長い採用アイデアの文章が続きます。".repeat(70),
      }),
    ],
  },
};

const nextPageRooms = [completedRoomFixture()];
export const EmptyPageWithMore: Story = {
  args: { rooms: [], hasMore: true },
  render: (args) => {
    const [loaded, setLoaded] = useState(false);
    return (
      <CompletedRoomsView
        {...args}
        rooms={loaded ? nextPageRooms : []}
        hasMore={!loaded}
        onMore={() => setLoaded(true)}
      />
    );
  },
};
