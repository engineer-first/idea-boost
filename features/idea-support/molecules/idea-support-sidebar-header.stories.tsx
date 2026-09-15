import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";

import { IdeaSupportSidebarHeader } from "./idea-support-sidebar-header";

const meta = {
  title: "IdeaSupport/IdeaSupportSidebarHeader",
  component: IdeaSupportSidebarHeader,
  args: {
    onToggle: fn(),
  },
} satisfies Meta<typeof IdeaSupportSidebarHeader>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Open: Story = {
  args: {
    isOpen: true,
  },
};

export const Closed: Story = {
  args: {
    isOpen: false,
  },
};

export const Required: Story = {
  args: {
    isOpen: true,
    canClose: false,
  },
};
