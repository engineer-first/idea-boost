import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { RouteStatusView } from "./route-status-view";

const meta = {
  title: "App/RouteStatusView",
  component: RouteStatusView,
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <div className="flex h-dvh flex-col overflow-hidden">
        <Story />
      </div>
    ),
  ],
  args: { kind: "not_found" },
} satisfies Meta<typeof RouteStatusView>;

export default meta;
type Story = StoryObj<typeof RouteStatusView>;

export const NotFound: Story = { args: { kind: "not_found" } };
export const RenderError: Story = { args: { kind: "error" } };
