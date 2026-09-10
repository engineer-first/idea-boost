import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { RemoteCursor } from "./remote-cursor";

const meta = {
  title: "Room/RemoteCursor",
  component: RemoteCursor,
  args: {
    cursor: {
      userId: "22222222-2222-4222-8222-222222222222",
      name: "Taro Yamada",
      color: "green",
      x: 120,
      y: 100,
      draggingNoteId: null,
      lastSeenAt: Date.now(),
    },
    isIdle: false,
    labelOffset: 0,
  },
  decorators: [
    (Story) => (
      <div className="relative h-72 bg-slate-100 dark:bg-slate-900">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof RemoteCursor>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Active: Story = {};

export const DraggingSharedNote: Story = {
  args: {
    cursor: {
      ...meta.args.cursor,
      draggingNoteId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    },
  },
};

export const IdleLowVisibility: Story = {
  args: {
    cursor: {
      ...meta.args.cursor,
      color: "zinc",
    },
    isIdle: true,
  },
};

export const LongNameAtSamePosition: Story = {
  render: (args) => (
    <>
      <RemoteCursor
        {...args}
        cursor={{
          ...args.cursor,
          name: "A Participant With An Extremely Long Display Name",
        }}
      />
      <RemoteCursor
        {...args}
        cursor={{
          ...args.cursor,
          userId: "33333333-3333-4333-8333-333333333333",
          name: "Hanako Sato",
          color: "blue",
        }}
        labelOffset={1}
      />
    </>
  ),
};
