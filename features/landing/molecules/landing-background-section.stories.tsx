import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import styles from "./landing.module.css";
import { LandingBackgroundSection } from "./landing-background-section";

const meta = {
  title: "Landing/LandingBackgroundSection",
  component: LandingBackgroundSection,
  decorators: [
    (Story) => (
      <div
        className={`${styles.theme} mx-auto max-w-6xl bg-[var(--lp-surface)] px-6 text-[var(--lp-ink)] sm:px-10`}
      >
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof LandingBackgroundSection>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
