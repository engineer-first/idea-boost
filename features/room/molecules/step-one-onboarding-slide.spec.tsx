import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { describe, expect, it } from "vitest";
import { StepOneOnboardingSlide } from "./step-one-onboarding-slide";

describe("StepOneOnboardingSlide", () => {
  it("StrictModeでも初回案内を表示し、閉じた後の再マウントでは自動表示しない", async () => {
    const props = {
      phaseKey: "1-1",
      sessionKey: "strict-visit",
      isReady: true,
    };
    const { unmount } = render(
      <StrictMode>
        <StepOneOnboardingSlide {...props} />
      </StrictMode>,
    );
    expect(screen.getByRole("dialog")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "閉じる" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    unmount();
    render(
      <StrictMode>
        <StepOneOnboardingSlide {...props} />
      </StrictMode>,
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it.each([false, true])(
    "再表示=%sでEscapeを押すと進め方へフォーカスを戻す",
    async (reopen) => {
      render(
        <StepOneOnboardingSlide
          phaseKey="1-1"
          sessionKey={`focus-${reopen}`}
          isReady
        />,
      );
      if (reopen) {
        fireEvent.click(screen.getByRole("button", { name: "閉じる" }));
        await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
        fireEvent.click(screen.getByRole("button", { name: "進め方" }));
      }
      const next = screen.getByRole("button", { name: "次へ" });
      next.focus();
      fireEvent.keyDown(next, { key: "Escape", code: "Escape" });
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
      await waitFor(() =>
        expect(screen.getByRole("button", { name: "進め方" })).toHaveFocus(),
      );
    },
  );

  it("他工程から1-1へ戻っても既読の案内を自動表示しない", async () => {
    const props = {
      phaseKey: "1-1",
      sessionKey: "return-visit",
      isReady: true,
    };
    const { rerender } = render(<StepOneOnboardingSlide {...props} />);
    expect(screen.getByRole("dialog")).toBeVisible();
    rerender(<StepOneOnboardingSlide {...props} phaseKey="1-2" />);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    rerender(<StepOneOnboardingSlide {...props} />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
