import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { BoardOperationMatrix } from "./board-operation-matrix";

const meta = {
  title: "Room/BoardOperationMatrix",
  component: BoardOperationMatrix,
  args: {
    permissions: {
      canEditNote: true,
      canMoveNote: false,
      canDeleteNote: true,
    },
  },
} satisfies Meta<typeof BoardOperationMatrix>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const AllEnabled: Story = {
  args: {
    permissions: {
      canEditNote: true,
      canMoveNote: true,
      canDeleteNote: true,
    },
  },
};

export const AllDisabled: Story = {
  args: {
    permissions: {
      canEditNote: false,
      canMoveNote: false,
      canDeleteNote: false,
    },
  },
};
