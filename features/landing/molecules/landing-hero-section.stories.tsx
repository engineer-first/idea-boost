import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { getLandingEntry } from "../logic/landing-entry";
import { LandingHeroSection } from "./landing-hero-section";

const meta = {
  title: "Landing/LandingHeroSection",
  component: LandingHeroSection,
  args: { entry: getLandingEntry(false) },
  decorators: [
    (Story) => (
      <div className="mx-auto max-w-6xl bg-slate-50 px-6 text-slate-900 sm:px-10">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof LandingHeroSection>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
