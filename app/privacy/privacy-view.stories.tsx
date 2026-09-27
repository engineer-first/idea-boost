import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { PrivacyView } from "./privacy-view";

const meta = {
  title: "Privacy/PrivacyView",
  component: PrivacyView,
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <div className="flex h-screen flex-col">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof PrivacyView>;
export default meta;
export const Default: StoryObj<typeof meta> = {};
