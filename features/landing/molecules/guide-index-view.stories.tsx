import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { GuideIndexView } from "./guide-index-view";

const meta = {
  title: "Landing/GuideIndexView",
  component: GuideIndexView,
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <div className="flex h-screen flex-col">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof GuideIndexView>;
export default meta;

export const Default: StoryObj<typeof meta> = {};
