import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { getLandingEntry } from "../logic/landing-entry";
import styles from "./landing.module.css";
import { LandingHeroSection } from "./landing-hero-section";

const meta = {
  title: "Landing/LandingHeroSection",
  component: LandingHeroSection,
  args: { entry: getLandingEntry(false) },
  decorators: [
    (Story) => (
      <div
        className={`${styles.theme} mx-auto max-w-6xl bg-[var(--lp-surface)] px-6 text-[var(--lp-ink)] sm:px-10`}
      >
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof LandingHeroSection>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
