import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import styles from "./landing.module.css";
import { LandingCodeEntry } from "./landing-code-entry";

const meta = {
  title: "Landing/LandingCodeEntry",
  component: LandingCodeEntry,
  args: { navigate: fn() },
  decorators: [
    (Story) => (
      <div
        className={`${styles.theme} max-w-md bg-[var(--lp-surface)] p-6 text-[var(--lp-ink)]`}
      >
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof LandingCodeEntry>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const English: Story = { args: { locale: "en" } };
export const InvalidCode: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(
      canvas.getByRole("textbox", { name: "招待コードをお持ちの方" }),
      "AB1",
    );
    await userEvent.click(canvas.getByRole("button", { name: "参加する" }));
    await expect(canvas.getByRole("alert")).toBeVisible();
  },
};
