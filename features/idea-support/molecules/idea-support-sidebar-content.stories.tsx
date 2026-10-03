import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { userEvent, within } from "storybook/test";

import { IdeaSupportSidebarContent } from "./idea-support-sidebar-content";

const meta = {
  title: "IdeaSupport/IdeaSupportSidebarContent",
  component: IdeaSupportSidebarContent,
  parameters: {
    layout: "padded",
    chromatic: { viewports: [390, 1280] },
  },
  decorators: [
    (Story) => (
      <div
        style={{
          width: "min(100%, 400px)",
          height: 500,
        }}
      >
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof IdeaSupportSidebarContent>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Osborn: Story = {
  args: {
    defaultContentId: "osborn",
  },
};

export const Scamper: Story = {
  args: {
    defaultContentId: "scamper",
  },
};

export const Reverse: Story = {
  args: {
    defaultContentId: "reverse",
  },
};

export const Industry: Story = {
  args: {
    defaultContentId: "industry",
  },
};

export const Loading: Story = {
  args: {
    status: "loading",
  },
};

export const Empty: Story = {
  args: {
    status: "empty",
  },
};

export const Failure: Story = {
  args: {
    status: "error",
  },
};

export const MoreQuestions: Story = {
  play: async ({ canvasElement }) => {
    await userEvent.click(
      within(canvasElement).getByRole("button", { name: /ほかの問いを見る/ }),
    );
  },
};
