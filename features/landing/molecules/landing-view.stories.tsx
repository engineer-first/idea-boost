import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { getLandingEntry } from "../logic/landing-entry";
import { LandingView } from "./landing-view";

const meta = {
  title: "Landing/LandingView",
  component: LandingView,
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <div className="flex h-dvh flex-col overflow-hidden">
        <Story />
      </div>
    ),
  ],
  args: { isLoggedIn: false, entry: getLandingEntry(false) },
} satisfies Meta<typeof LandingView>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Guest: Story = {};
export const Member: Story = {
  args: { isLoggedIn: true, entry: getLandingEntry(true) },
};
export const InvitedGuest: Story = {
  args: { entry: getLandingEntry(false, "/invite/ABC123") },
};
export const InvitedMember: Story = {
  args: { isLoggedIn: true, entry: getLandingEntry(true, "/invite/ABC123") },
};
export const ReturningGuest: Story = {
  args: { entry: getLandingEntry(false, "/shared-outcomes?status=confirmed") },
};
export const ReturningMember: Story = {
  args: {
    isLoggedIn: true,
    entry: getLandingEntry(true, "/shared-outcomes?status=confirmed"),
  },
};
