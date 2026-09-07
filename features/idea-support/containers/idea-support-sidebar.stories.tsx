import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { IdeaSupportSidebar } from "./idea-support-sidebar";

const meta = {
  title: "IdeaSupport/IdeaSupportSidebar",
  component: IdeaSupportSidebar,
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
} satisfies Meta<typeof IdeaSupportSidebar>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Optional: Story = {
  args: {
    mode: "optional",
  },
};

export const Required: Story = {
  args: {
    mode: "required",
  },
};
