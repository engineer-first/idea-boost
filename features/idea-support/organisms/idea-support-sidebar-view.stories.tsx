import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";

import { IdeaSupportSidebarView } from "./idea-support-sidebar-view";

const meta = {
  title: "features/idea-support/organisms/IdeaSupportSidebarView",
  component: IdeaSupportSidebarView,
  args: {
    contentState: "ready",
    onToggle: fn(),
  },
  parameters: {
    layout: "centered",
  },
  decorators: [
    (Story) => (
      <div
        style={{
          width: 320,
          height: 500,
        }}
      >
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof IdeaSupportSidebarView>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Required: Story = {
  args: {
    isOpen: true,
    isRequired: true,
  },
};

export const OptionalClosed: Story = {
  args: {
    isOpen: false,
    isRequired: false,
  },
};
