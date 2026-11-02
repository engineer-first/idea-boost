import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { describe, expect, it } from "vitest";
import { StepOneOnboardingSlide } from "./step-one-onboarding-slide";

describe("StepOneOnboardingSlide", () => {
  it.each(["1-2", "1-3", "1-4", "1-5", "2-1", "3-1", "3-3"])(
    "%sへ初めて進むと案内を自動表示し、再接続では再表示しない",
    async (phaseKey) => {
      const props = { sessionKey: `auto-${phaseKey}`, isReady: true };
      const { rerender } = render(
        <StepOneOnboardingSlide {...props} phaseKey="2-2" />,
      );
      rerender(<StepOneOnboardingSlide {...props} phaseKey={phaseKey} />);
      expect(screen.getByRole("dialog")).toBeVisible();
      fireEvent.click(screen.getByRole("button", { name: "閉じる" }));
      rerender(
        <StepOneOnboardingSlide
          {...props}
          phaseKey={phaseKey}
          isReady={false}
        />,
      );
      rerender(<StepOneOnboardingSlide {...props} phaseKey={phaseKey} />);
      expect(screen.queryByRole("dialog")).toBeNull();
    },
  );
  it.each(["1-2", "1-3", "1-4", "1-5", "3-3"])(
    "%sの操作スライドは実操作動画を音なしで繰り返し再生する",
    async (phaseKey) => {
      render(
        <StepOneOnboardingSlide
          phaseKey={phaseKey}
          sessionKey={`video-${phaseKey}`}
          isReady
        />,
      );
      fireEvent.click(screen.getByRole("button", { name: "次へ" }));
      await screen.findByRole("button", { name: "はじめる" });
      const video = screen.getByRole("dialog").querySelector("video");
      expect(video).not.toBeNull();
      expect(video).toHaveAttribute("src", `/onboarding/step-${phaseKey}.webm`);
      expect(video).toHaveProperty("muted", true);
      expect(video).toHaveProperty("loop", true);
      expect(video).toHaveProperty("playsInline", true);
    },
  );
  it("1-1の3枚目へ移動中に2枚構成の工程へ変わっても落ちず、案内を閉じる", async () => {
    const props = { sessionKey: "moving-phase-change", isReady: true };
    const { rerender } = render(
      <StepOneOnboardingSlide {...props} phaseKey="1-1" />,
    );
    for (let index = 0; index < 1; index++) {
      fireEvent.click(screen.getByRole("button", { name: "次へ" }));
      await waitFor(() =>
        expect(
          screen.getByTestId("step-one-onboarding-slide-content"),
        ).toHaveAttribute("data-slide-transition", "idle"),
      );
    }
    fireEvent.click(screen.getByRole("button", { name: "次へ" }));
    rerender(<StepOneOnboardingSlide {...props} phaseKey="1-4" />);
    await screen.findByRole("dialog", {
      name: "取り組みたい課題に投票しよう。",
    });
    expect(
      screen.getByRole("dialog", { name: "取り組みたい課題に投票しよう。" }),
    ).toBeVisible();
  });
  it.each(["1-2", "1-3", "1-4", "1-5", "2-1", "3-1", "3-3"])(
    "%sは初回に2枚を開き、戻る・閉じる・再表示ができ、既読の再接続や再入場では開かない",
    async (phaseKey) => {
      const props = {
        phaseKey,
        sessionKey: `manual-${phaseKey}`,
        isReady: true,
      };
      const { rerender } = render(<StepOneOnboardingSlide {...props} />);
      expect(screen.getByRole("dialog")).toBeVisible();
      const firstTitle = screen
        .getByRole("dialog")
        .getAttribute("aria-labelledby");
      expect(firstTitle).toBeTruthy();
      const title = screen.getByRole("heading").textContent;
      expect(screen.getAllByRole("listitem")).toHaveLength(2);
      fireEvent.click(screen.getByRole("button", { name: "次へ" }));
      const content = screen.getByTestId("step-one-onboarding-slide-content");
      await screen.findByRole("button", { name: "はじめる" });
      await waitFor(() =>
        expect(content).toHaveAttribute("data-slide-transition", "idle"),
      );
      expect(screen.getByRole("heading").textContent).not.toBe(title);
      expect(screen.getByRole("button", { name: "はじめる" })).toBeVisible();
      if (phaseKey === "2-1") {
        expect(
          screen.getByText(
            "頭で覚えることを、別の確認方法に置き換えられない？",
          ),
        ).toBeVisible();
        expect(
          screen.getByText(
            "どうしたら、記憶に頼らず持ち物を確認できるだろう？",
          ),
        ).toBeVisible();
        expect(
          screen.getByText("どうしたら、出発前に慌てて準備せずに済むだろう？"),
        ).toBeVisible();
      }
      if (phaseKey === "1-4") {
        expect(screen.getByRole("dialog")).toHaveTextContent(
          "主観1票・客観3票",
        );
        expect(screen.getByRole("dialog")).toHaveTextContent(
          "投票中は他の人の票は見えません。",
        );
      }
      if (phaseKey === "3-1") {
        expect(screen.getByRole("dialog")).toHaveTextContent(
          "出発前に持ち物を知らせる仕組み。",
        );
      }
      fireEvent.click(screen.getByRole("button", { name: "1枚目に戻る" }));
      await waitFor(() =>
        expect(screen.getByRole("heading").textContent).toBe(title),
      );
      await waitFor(() =>
        expect(content).toHaveAttribute("data-slide-transition", "idle"),
      );
      expect(screen.getByRole("heading").textContent).toBe(title);
      fireEvent.keyDown(screen.getByRole("button", { name: "次へ" }), {
        key: "Escape",
      });
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
      fireEvent.click(screen.getByRole("button", { name: "進め方" }));
      expect(screen.getByRole("heading").textContent).toBe(title);
      rerender(<StepOneOnboardingSlide {...props} isReady={false} />);
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
      rerender(<StepOneOnboardingSlide {...props} />);
      expect(screen.queryByRole("dialog")).toBeNull();
      rerender(<StepOneOnboardingSlide {...props} phaseKey="2-2" />);
      rerender(<StepOneOnboardingSlide {...props} />);
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(
        sessionStorage.getItem(
          `step-onboarding:${props.sessionKey}:${phaseKey}`,
        ),
      ).toBe("seen");
    },
  );

  it.each(["lobby", "2-2", "2-3", "2-4", "3-2", "3-4", "3-5"])(
    "%sでは進め方の入口も案内も表示しない",
    (phaseKey) => {
      render(
        <StepOneOnboardingSlide
          phaseKey={phaseKey}
          sessionKey="unsupported"
          isReady
        />,
      );
      expect(screen.queryByRole("button", { name: "進め方" })).toBeNull();
      expect(screen.queryByRole("dialog")).toBeNull();
    },
  );

  it("開いたまま対象工程へ変わっても閉じ、新しい工程の先頭から開ける", async () => {
    const props = { sessionKey: "phase-change", isReady: true };
    const { rerender } = render(
      <StepOneOnboardingSlide {...props} phaseKey="1-1" />,
    );
    rerender(<StepOneOnboardingSlide {...props} phaseKey="1-4" />);
    await screen.findByRole("dialog", {
      name: "取り組みたい課題に投票しよう。",
    });
    expect(
      screen.getByRole("dialog", { name: "取り組みたい課題に投票しよう。" }),
    ).toBeVisible();
  });

  it("1-1は困りごとの案内から始まり、2枚目に付箋の実操作動画、3枚目にタイマーの説明を表示する", async () => {
    render(
      <StepOneOnboardingSlide
        phaseKey="1-1"
        sessionKey="timer-first"
        isReady
      />,
    );
    expect(screen.getByRole("dialog", { name: /困ったこと/ })).toBeVisible();
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
    const next = screen.getByRole("button", { name: "次へ" });
    expect(screen.getByLabelText("困ったことを書いた3枚の付箋")).toBeVisible();
    await waitFor(() =>
      expect(
        screen.getByTestId("step-one-onboarding-slide-content"),
      ).toHaveAttribute("data-slide-transition", "idle"),
    );
    fireEvent.click(next);
    const video = await screen.findByLabelText("付箋を追加して書き出す操作");
    expect(video).toHaveAttribute("src", "/onboarding/step-1-1.webm");
    await waitFor(() =>
      expect(
        screen.getByTestId("step-one-onboarding-slide-content"),
      ).toHaveAttribute("data-slide-transition", "idle"),
    );
    fireEvent.click(next);
    expect(
      await screen.findByRole("dialog", { name: /タイマー/ }),
    ).toBeVisible();
  });

  it("次へは遷移中も有効で、連続して押してもスライドを飛ばさない", async () => {
    render(
      <StepOneOnboardingSlide
        phaseKey="1-1"
        sessionKey="transition-focus"
        isReady
      />,
    );
    const next = screen.getByRole("button", { name: "次へ" });
    const content = screen.getByTestId("step-one-onboarding-slide-content");
    next.focus();
    fireEvent.click(next);
    expect(next).toBeEnabled();
    expect(next).toHaveFocus();
    fireEvent.click(next);
    expect(
      await screen.findByLabelText("付箋を追加して書き出す操作"),
    ).toBeVisible();
    fireEvent.click(next);
    await waitFor(() =>
      expect(content).toHaveAttribute("data-slide-transition", "idle"),
    );
    expect(screen.getByLabelText("付箋を追加して書き出す操作")).toBeVisible();
    expect(next).toBeEnabled();
    expect(next).toHaveFocus();
  });

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
    expect(screen.getByRole("dialog")).toBeVisible();
    rerender(<StepOneOnboardingSlide {...props} />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
