import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FacilitationGuideContent } from "../logic/facilitation-guide";
import { StepGuide, type StepGuideProps } from "./step-guide";

// 文言のカタログではなく、渡された内容と表示条件の接続を検証する。
const guide = {
  durationMinutes: 3,
  intro: "この工程の最初の一歩",
  modalTitle: "この工程の詳しい案内",
  message: "参加者がいま取り組む作業",
  steps: ["最初にすること", "続いてすること"],
  modalExamples: ["一つ目の具体例", "二つ目の具体例"],
  example: "作業を進めるコツ",
  completion: "この工程を終える条件",
  hostMessage: "進行役だけが確認する手順",
} satisfies FacilitationGuideContent;
const defaults: StepGuideProps = {
  guide,
  phaseKey: "1-1",
  sessionKey: "room:me",
  isHost: false,
  isReady: true,
};
function setup(overrides: Partial<StepGuideProps> = {}) {
  const onAction = vi.fn();
  const props = { ...defaults, ...overrides };
  const view = render(
    <>
      <StepGuide {...props} />
      <button type="button" onClick={onAction}>
        付箋を追加
      </button>
    </>,
  );
  return { ...view, props, onAction };
}
const tick = (ms: number) => act(() => vi.advanceTimersByTime(ms));
const frame = () => screen.getByTestId("step-guide");
function outsideClick() {
  const button = screen.getByRole("button", { name: "付箋を追加" });
  fireEvent.pointerDown(button);
  fireEvent.click(button);
}
beforeEach(() => {
  sessionStorage.clear();
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("工程ガイド", () => {
  it("初回案内はフォーカスを奪わず、5秒後に同じ枠のボタンへ畳む", () => {
    vi.useFakeTimers();
    setup();
    const shell = frame();
    expect(screen.getByRole("status", { name: "最初の一歩" })).toBeVisible();
    expect(shell).not.toContainElement(document.activeElement as HTMLElement);
    tick(4999);
    expect(shell).toHaveAttribute("data-state", "intro");
    tick(1);
    expect(shell).toHaveAttribute("data-state", "compact");
    expect(frame()).toBe(shell);
    expect(screen.getByRole("button", { name: "進め方" })).toBeVisible();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("region", { name: "ファシリテーションガイド" }),
    ).not.toBeInTheDocument();
  });
  it("hover中は残り時間を止め、外れた後は残りだけを数える", () => {
    vi.useFakeTimers();
    setup();
    tick(2000);
    fireEvent.pointerEnter(frame());
    tick(10000);
    expect(frame()).toHaveAttribute("data-state", "intro");
    fireEvent.pointerLeave(frame());
    tick(2999);
    expect(frame()).toHaveAttribute("data-state", "intro");
    tick(1);
    expect(frame()).toHaveAttribute("data-state", "compact");
  });
  it("ガイド内のfocus中は畳まない", () => {
    vi.useFakeTimers();
    setup();
    tick(2000);
    act(() => screen.getByRole("status", { name: "最初の一歩" }).focus());
    tick(10000);
    expect(frame()).toHaveAttribute("data-state", "intro");
    act(() => screen.getByRole("button", { name: "付箋を追加" }).focus());
    expect(frame()).toHaveAttribute("data-state", "compact");
  });
  it("非表示と読込中には表示時間を消費しない", () => {
    vi.useFakeTimers();
    const { rerender, props } = setup({ isReady: false });
    tick(10000);
    rerender(<StepGuide {...props} isReady />);
    tick(2000);
    const hidden = vi.spyOn(document, "hidden", "get").mockReturnValue(true);
    fireEvent(document, new Event("visibilitychange"));
    tick(20000);
    hidden.mockReturnValue(false);
    fireEvent(document, new Event("visibilitychange"));
    tick(2999);
    expect(frame()).toHaveAttribute("data-state", "intro");
    tick(1);
    expect(frame()).toHaveAttribute("data-state", "compact");
  });
  it("詳細の内側クリック・スクロール・マウス退出・時間経過では畳まない", () => {
    vi.useFakeTimers();
    setup({ initialState: "compact" });
    fireEvent.click(screen.getByRole("button", { name: "進め方" }));
    const detail = screen.getByRole("region", {
      name: "ファシリテーションガイド",
    });
    fireEvent.pointerDown(detail);
    fireEvent.click(detail);
    fireEvent.scroll(detail);
    fireEvent.pointerLeave(frame());
    tick(30000);
    expect(frame()).toHaveAttribute("data-state", "detail");
    expect(within(detail).queryByRole("button")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "進め方" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
  it.each([
    "intro",
    "detail",
  ] as const)("%sを外側クリックで畳み、その1回で元の操作も実行する", (initialState) => {
    const { onAction } = setup({ initialState });
    outsideClick();
    expect(frame()).toHaveAttribute("data-state", "compact");
    expect(onAction).toHaveBeenCalledOnce();
  });
  it.each([
    "{Enter}",
    " ",
  ])("%sで開き、Escapeで入口に戻し、Tabでは移動先に留める", async (key) => {
    const user = userEvent.setup();
    setup({ initialState: "compact" });
    const button = screen.getByRole("button", { name: "進め方" });
    act(() => button.focus());
    await user.keyboard(key);
    expect(
      screen.getByRole("region", { name: "ファシリテーションガイド" }),
    ).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(button).toHaveFocus();
    await user.keyboard(key);
    await user.tab();
    expect(screen.getByRole("button", { name: "付箋を追加" })).toHaveFocus();
    expect(frame()).toHaveAttribute("data-state", "compact");
  });
  it("初めての工程だけ案内し、戻る・再マウントでは畳んで始める", () => {
    const { rerender, unmount, props } = setup();
    outsideClick();
    rerender(<StepGuide {...props} phaseKey="1-2" />);
    expect(frame()).toHaveAttribute("data-state", "intro");
    rerender(<StepGuide {...props} />);
    expect(frame()).toHaveAttribute("data-state", "compact");
    unmount();
    setup();
    expect(frame()).toHaveAttribute("data-state", "compact");
  });
  it("同じ工程の再描画で詳細をリセットせず、次工程では新しい短い案内にする", () => {
    const { rerender, props } = setup({ initialState: "compact" });
    fireEvent.click(screen.getByRole("button", { name: "進め方" }));
    rerender(<StepGuide {...props} isHost />);
    expect(frame()).toHaveAttribute("data-state", "detail");
    rerender(<StepGuide {...props} phaseKey="1-2" />);
    expect(frame()).toHaveAttribute("data-state", "intro");
  });
  it("他参加者・他ルームの初回案内と開閉には影響しない", () => {
    const { unmount } = setup();
    outsideClick();
    unmount();
    const other = setup({ sessionKey: "room:other" });
    expect(frame()).toHaveAttribute("data-state", "intro");
    other.unmount();
    setup({ sessionKey: "other-room:me" });
    expect(frame()).toHaveAttribute("data-state", "intro");
  });
  it("渡された導入を表示し、詳細から作業・手順・例・完了条件を読める", () => {
    setup();
    expect(
      screen.getByRole("status", { name: "最初の一歩" }),
    ).toHaveTextContent(guide.intro);
    outsideClick();
    fireEvent.click(screen.getByRole("button", { name: "進め方" }));
    const detail = within(
      screen.getByRole("region", { name: "ファシリテーションガイド" }),
    );
    expect(
      detail.getByRole("heading", { name: guide.modalTitle }),
    ).toBeVisible();
    expect(detail.getByText(guide.message)).toBeVisible();
    for (const text of [
      ...guide.steps,
      ...guide.modalExamples,
      guide.example,
      guide.completion,
    ]) {
      expect(detail.getByText(text)).toBeVisible();
    }
  });
  it("専用見出しがない場合は作業内容を詳細の見出しにする", () => {
    setup({
      guide: { ...guide, modalTitle: undefined },
      initialState: "detail",
    });
    expect(screen.getByRole("heading", { name: guide.message })).toBeVisible();
  });
  it("案内の途中で次工程へ進んでも、次の案内は5秒表示する", () => {
    vi.useFakeTimers();
    const { props, rerender } = setup();
    tick(4000);
    rerender(<StepGuide {...props} phaseKey="1-2" />);
    tick(4999);
    expect(frame()).toHaveAttribute("data-state", "intro");
    tick(1);
    expect(frame()).toHaveAttribute("data-state", "compact");
  });
  it("詳細を読んでいる途中の工程変更でも、次の短い案内は自動で畳む", () => {
    vi.useFakeTimers();
    const { props, rerender } = setup({ initialState: "compact" });
    fireEvent.click(screen.getByRole("button", { name: "進め方" }));
    rerender(<StepGuide {...props} phaseKey="1-2" />);
    tick(5000);
    expect(frame()).toHaveAttribute("data-state", "compact");
  });
  it("ホストの補足はホストだけに表示する", () => {
    const { rerender, props } = setup({ initialState: "detail" });
    const hostMessage = guide.hostMessage;
    expect(screen.queryByText("進行役へ")).not.toBeInTheDocument();
    expect(screen.queryByText(hostMessage)).not.toBeInTheDocument();
    rerender(<StepGuide {...props} isHost />);
    expect(screen.getByText("進行役へ")).toBeVisible();
    expect(screen.getByText(hostMessage)).toBeVisible();
    rerender(<StepGuide {...props} isHost={false} />);
    expect(screen.queryByText(hostMessage)).not.toBeInTheDocument();
  });
  it("ホスト向けの補足がない工程では空の補足欄を出さない", () => {
    setup({
      guide: { ...guide, hostMessage: null },
      isHost: true,
      initialState: "detail",
    });
    expect(screen.queryByText("進行役へ")).not.toBeInTheDocument();
  });
});
