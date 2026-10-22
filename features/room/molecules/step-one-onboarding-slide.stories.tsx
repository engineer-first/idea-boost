import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, screen, userEvent, waitFor } from "storybook/test";
import { StepOneOnboardingSlide } from "./step-one-onboarding-slide";

const meta = {
  title: "Room/StepOneOnboardingSlide",
  component: StepOneOnboardingSlide,
  parameters: {
    layout: "fullscreen",
  },
  args: {
    phaseKey: "1-1",
    sessionKey: "storybook-step-one",
    isReady: true,
  },
} satisfies Meta<typeof StepOneOnboardingSlide>;

export default meta;
type Story = StoryObj<typeof meta>;

async function ensureGuideIsOpen() {
  if (!screen.queryByRole("dialog")) {
    await userEvent.click(screen.getByRole("button", { name: "進め方" }));
  }
}

async function advanceToSlide(title: string) {
  await userEvent.click(screen.getByRole("button", { name: "次へ" }));
  await screen.findByRole("dialog", { name: title });
  await waitFor(() =>
    expect(
      screen.getByTestId("step-one-onboarding-slide-content"),
    ).toHaveAttribute("data-slide-transition", "idle"),
  );
}

export const FirstVisit: Story = {
  play: async () => {
    await ensureGuideIsOpen();
    await expect(
      screen.getByRole("dialog", {
        name: "最近あった困ったことを付箋に書き出そう。",
      }),
    ).toBeVisible();
  },
};

export const SecondSlide: Story = {
  args: {
    sessionKey: "storybook-step-one-second-slide",
  },
  play: async () => {
    await ensureGuideIsOpen();
    await advanceToSlide("1枚に1つ、困ったことを書こう。");
    await expect(
      screen.getByRole("dialog", {
        name: "1枚に1つ、困ったことを書こう。",
      }),
    ).toBeVisible();
  },
};

export const ThirdSlide: Story = {
  args: {
    sessionKey: "storybook-step-one-third-slide",
  },
  play: async () => {
    await ensureGuideIsOpen();
    await advanceToSlide("1枚に1つ、困ったことを書こう。");
    await advanceToSlide("タイマーの時間内にできるだけ多く書き出そう");
    await expect(
      screen.getByRole("dialog", {
        name: "タイマーの時間内にできるだけ多く書き出そう",
      }),
    ).toBeVisible();
  },
};
