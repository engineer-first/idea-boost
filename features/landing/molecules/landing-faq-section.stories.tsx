import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { LandingFaqSection } from "./landing-faq-section";

const meta = {
  title: "Landing/LandingFaqSection",
  component: LandingFaqSection,
  decorators: [
    (Story) => (
      <div className="mx-auto max-w-6xl bg-slate-50 px-6 text-slate-900 sm:px-10">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof LandingFaqSection>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
