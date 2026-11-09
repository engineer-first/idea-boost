import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, screen, userEvent, waitFor } from "storybook/test";
import { getStepGuideSlides } from "../logic/step-guide-copy";
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
  await waitFor(() => expect(screen.getByRole("dialog")).toBeVisible());
  await waitFor(() =>
    expect(
      getComputedStyle(screen.getByRole("button", { name: "次へ" }))
        .pointerEvents,
    ).not.toBe("none"),
  );
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

export const OperationSlide: Story = {
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

export const TimerSlide: Story = {
  args: {
    sessionKey: "storybook-step-one-third-slide",
  },
  play: async () => {
    await ensureGuideIsOpen();
    await advanceToSlide("1枚に1つ、困ったことを書こう。");
    await advanceToSlide("タイマーの時間内にできるだけ多く書き出そう");
  },
};

function manualStory(phaseKey: string, slideIndex = 0): Story {
  return {
    args: { phaseKey, sessionKey: `storybook-guide-${phaseKey}-${slideIndex}` },
    play: async () => {
      await ensureGuideIsOpen();
      if (slideIndex > 0)
        await advanceToSlide(getStepGuideSlides(phaseKey)[slideIndex].title);
      await expect(
        screen.getByRole("dialog", {
          name: getStepGuideSlides(phaseKey)[slideIndex].title,
        }),
      ).toBeVisible();
    },
  };
}

export const SharingPurpose = manualStory("1-2");
export const SharingOperation = manualStory("1-2", 1);
export const GroupingPurpose = manualStory("1-3");
export const GroupingOperation = manualStory("1-3", 1);
export const VotingPurpose = manualStory("1-4");
export const VotingOperation = manualStory("1-4", 1);
export const DecisionPurpose = manualStory("1-5");
export const DecisionOperation = manualStory("1-5", 1);
export const QuestionPurpose = manualStory("2-1");
export const QuestionExample = manualStory("2-1", 1);
export const SolutionPurpose = manualStory("3-1");
export const SolutionExample = manualStory("3-1", 1);
export const EvaluationPurpose = manualStory("3-3");
export const EvaluationOperation = manualStory("3-3", 1);
export const UnsupportedStep: Story = {
  args: { phaseKey: "2-2" },
  play: async () => {
    await expect(screen.queryByRole("button", { name: "進め方" })).toBeNull();
    await expect(screen.queryByRole("dialog")).toBeNull();
  },
};
