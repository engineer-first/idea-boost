import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { HomeUserMenu } from "./home-user-menu";

const meta = {
  title: "App/HomeUserMenu",
  component: HomeUserMenu,
  args: { userName: "はな" },
  decorators: [
    (Story) => (
      <div className="flex items-center gap-3">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof HomeUserMenu>;
export default meta;
type Story = StoryObj<typeof meta>;
export const SavedName: Story = {};
export const Unset: Story = { args: { userName: "" } };
export const LongName: Story = { args: { userName: "あ".repeat(40) } };

export const Guest: Story = { args: { sessionKind: "guest" } };
