import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import styles from "./landing.module.css";
import { LandingMethodSection } from "./landing-method-section";

const meta = {
  title: "Landing/LandingMethodSection",
  component: LandingMethodSection,
  decorators: [
    (Story) => (
      <div
        className={`${styles.theme} mx-auto max-w-6xl bg-[var(--lp-surface)] px-6 text-[var(--lp-ink)] sm:px-10`}
      >
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof LandingMethodSection>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
