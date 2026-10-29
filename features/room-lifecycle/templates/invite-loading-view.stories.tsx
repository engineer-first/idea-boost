import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { InviteLoadingView } from "./invite-loading-view";

const meta = {
  title: "RoomLifecycle/InviteLoadingView",
  component: InviteLoadingView,
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <div className="flex h-dvh flex-col overflow-hidden">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof InviteLoadingView>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
