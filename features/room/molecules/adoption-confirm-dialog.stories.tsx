import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";
import { AdoptionConfirmDialog } from "./adoption-confirm-dialog";

const meta = {
  title: "Room/AdoptionConfirmDialog",
  component: AdoptionConfirmDialog,
  args: {
    target: {
      content: "初参加の人が発言しやすい場を作る",
      authorName: "たろう",
    },
    phaseNumber: 1,
    disabled: false,
    onCancel: fn(),
    onConfirm: fn(),
  },
} satisfies Meta<typeof AdoptionConfirmDialog>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Issue: Story = {};
export const FinalIdea: Story = { args: { phaseNumber: 3 } };
export const Disconnected: Story = { args: { disabled: true } };
