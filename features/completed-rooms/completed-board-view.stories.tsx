import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { completedBoardFixture } from "@/contracts/completed-rooms.fixture";
import { CompletedBoardView } from "./completed-board-view";

const meta = {
  title: "CompletedRooms/Board",
  component: CompletedBoardView,
  args: { board: completedBoardFixture() },
} satisfies Meta<typeof CompletedBoardView>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Grouping: Story = {};
export const Empty: Story = {
  args: { board: completedBoardFixture({ notes: [], groups: [] }) },
};
export const Mapping: Story = {
  args: {
    board: completedBoardFixture({
      phase: 3,
      kind: "idea-mapping",
      groups: [],
      notes: completedBoardFixture().notes.map((note, index) => ({
        ...note,
        x: 25 + index * 40,
        y: 70 - index * 30,
      })),
    }),
  },
};
export const LongContent: Story = {
  args: {
    board: completedBoardFixture({
      notes: completedBoardFixture().notes.map((note) => ({
        ...note,
        content: "付箋の全文が長くても読めます。".repeat(100),
      })),
    }),
  },
};
