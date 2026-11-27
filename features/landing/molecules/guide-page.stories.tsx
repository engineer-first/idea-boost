import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { GuidePage } from "./guide-page";

const meta = {
  title: "Landing/GuidePage",
  component: GuidePage,
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <div className="flex h-screen flex-col">
        <Story />
      </div>
    ),
  ],
  args: {
    children: (
      <p className="text-base leading-8">
        解説ページの本文がこの幅に入ります。
      </p>
    ),
  },
} satisfies Meta<typeof GuidePage>;
export default meta;

export const Default: StoryObj<typeof meta> = {};
