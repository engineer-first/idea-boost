import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { RoomOutcomeView } from "./room-outcome-view";

it("再コピーを待つ間は前の成功を消し、コピーと保存の二重操作を防ぐ", async () => {
  let complete!: () => void;
  const writeText = vi
    .fn()
    .mockResolvedValueOnce(undefined)
    .mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          complete = resolve;
        }),
    );
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText },
  });
  render(
    <RoomOutcomeView
      outcome={{ issue: "課題", hmw: "問い", idea: "案" }}
      connected
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "全文をコピー" }));
  await screen.findByText(/コピーしました/);
  fireEvent.click(screen.getByRole("button", { name: "全文をコピー" }));
  expect(screen.queryByText(/コピーしました/)).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: /コピー中/ })).toBeDisabled();
  expect(screen.getByRole("button", { name: "テキストを保存" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: /コピー中/ }));
  expect(writeText).toHaveBeenCalledTimes(2);
  await act(async () => complete());
  expect(screen.getByRole("status")).toHaveTextContent(/コピーしました/);
});

it.each([
  "connected",
  "authorized",
] as const)("%s の失効後に復旧しても以前の保存・コピー結果を再表示しない", async (availability) => {
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
  });
  const props = { outcome: { issue: "課題", hmw: "問い", idea: "案" } };
  const view = render(
    <RoomOutcomeView {...props} {...{ [availability]: true }} />,
  );
  fireEvent.click(screen.getByRole("button", { name: "全文をコピー" }));
  await screen.findByText(/コピーしました/);
  view.rerender(<RoomOutcomeView {...props} {...{ [availability]: false }} />);
  view.rerender(<RoomOutcomeView {...props} {...{ [availability]: true }} />);
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
});

it("失効したコピーの応答を待たず再試行でき、旧応答は新しい操作に影響しない", async () => {
  const completes: Array<() => void> = [];
  const writeText = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        completes.push(resolve);
      }),
  );
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText },
  });
  const success = vi.fn();
  const props = {
    outcome: { issue: "課題", hmw: "問い", idea: "案" },
    onExportSuccess: success,
  };
  const view = render(<RoomOutcomeView {...props} connected />);
  fireEvent.click(screen.getByRole("button", { name: "全文をコピー" }));
  view.rerender(<RoomOutcomeView {...props} connected={false} />);
  view.rerender(<RoomOutcomeView {...props} connected />);
  expect(screen.getByRole("button", { name: "全文をコピー" })).toBeEnabled();
  fireEvent.click(screen.getByRole("button", { name: "全文をコピー" }));
  await act(async () => completes[0]());
  expect(screen.getByRole("button", { name: /コピー中/ })).toBeDisabled();
  expect(success).not.toHaveBeenCalled();
  await act(async () => completes[1]());
  expect(success).toHaveBeenCalledOnce();
  expect(screen.getByRole("status")).toHaveTextContent(/コピーしました/);
});

it("成果の持ち帰り前から感想を開け、コピー結果を先に確定して案内を予約する", async () => {
  const open = vi.fn(),
    schedulePrompt = vi.fn(),
    cancelPrompt = vi.fn();
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText },
  });
  render(
    <RoomOutcomeView
      outcome={{ issue: "課題", hmw: "問い", idea: "案" }}
      connected
      onBackToBoard={() => {}}
      onOpenFeedback={open}
      onExportSuccess={schedulePrompt}
      onExportFailure={cancelPrompt}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "フィードバック" }));
  expect(open).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole("button", { name: "全文をコピー" }));
  await screen.findByText(/コピーしました/);
  expect(schedulePrompt).toHaveBeenCalledOnce();
  writeText.mockRejectedValueOnce(new Error("denied"));
  fireEvent.click(screen.getByRole("button", { name: "全文をコピー" }));
  expect(cancelPrompt).toHaveBeenCalledOnce();
  await waitFor(() => expect(cancelPrompt).toHaveBeenCalledTimes(2));
  expect(schedulePrompt).toHaveBeenCalledOnce();
});

it("コピー応答を待つ間に切断したら案内を予約しない", async () => {
  let complete!: () => void;
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: {
      writeText: () =>
        new Promise<void>((resolve) => {
          complete = resolve;
        }),
    },
  });
  const schedulePrompt = vi.fn();
  const props = {
    outcome: { issue: "課題", hmw: "問い", idea: "案" },
    onBackToBoard: vi.fn(),
    onExportSuccess: schedulePrompt,
  };
  const view = render(<RoomOutcomeView {...props} connected />);
  fireEvent.click(screen.getByRole("button", { name: "全文をコピー" }));
  view.rerender(<RoomOutcomeView {...props} connected={false} />);
  complete();
  await waitFor(() =>
    expect(screen.queryByText(/コピーしました/)).not.toBeInTheDocument(),
  );
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(schedulePrompt).not.toHaveBeenCalled();
});

it("保存開始に失敗したら案内を取り消し、画面に失敗を示す", () => {
  const original = URL.createObjectURL;
  URL.createObjectURL = vi.fn(() => {
    throw new Error("unavailable");
  });
  const schedulePrompt = vi.fn(),
    cancelPrompt = vi.fn();
  try {
    render(
      <RoomOutcomeView
        outcome={{ issue: "課題", hmw: "問い", idea: "案" }}
        connected
        onBackToBoard={vi.fn()}
        onExportSuccess={schedulePrompt}
        onExportFailure={cancelPrompt}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "テキストを保存" }));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "保存を開始できませんでした",
    );
    expect(cancelPrompt).toHaveBeenCalledOnce();
    expect(schedulePrompt).not.toHaveBeenCalled();
  } finally {
    URL.createObjectURL = original;
  }
});

it("コピー後の保存失敗では前の成功表示を残さない", async () => {
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
  });
  const original = URL.createObjectURL;
  URL.createObjectURL = vi.fn(() => {
    throw new Error("unavailable");
  });
  try {
    render(
      <RoomOutcomeView
        outcome={{ issue: "課題", hmw: "問い", idea: "案" }}
        connected
        onBackToBoard={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "全文をコピー" }));
    await screen.findByText(/コピーしました/);
    fireEvent.click(screen.getByRole("button", { name: "テキストを保存" }));
    expect(screen.queryByText(/コピーしました/)).not.toBeInTheDocument();
  } finally {
    URL.createObjectURL = original;
  }
});
