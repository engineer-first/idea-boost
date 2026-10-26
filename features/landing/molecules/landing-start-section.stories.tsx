import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { LandingStartSection } from "./landing-start-section";

const meta = {
  title: "Landing/LandingStartSection",
  component: LandingStartSection,
  decorators: [
    (Story) => (
      <div className="mx-auto max-w-6xl bg-slate-50 px-6 text-slate-900 sm:px-10">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof LandingStartSection>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
