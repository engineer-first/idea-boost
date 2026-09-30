import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { RoomOutcomeView } from "./room-outcome-view";

it("認可済み再訪では作業用接続なしで全文コピーでき、ボードへ戻る操作を出さない", async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText },
    configurable: true,
  });
  render(
    <RoomOutcomeView
      outcome={{ issue: "課題", hmw: "問い", idea: "案" }}
      connected={false}
      authorized
      onBackToBoard={undefined}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "全文をコピー" }));
  expect(writeText).toHaveBeenCalledWith(
    expect.stringContaining("3. 採用したアイデア\n案"),
  );
  expect(
    screen.queryByRole("button", { name: "ボードへ戻る" }),
  ).not.toBeInTheDocument();
});

it("認可済み再訪でもコピー成功の案内と記録本文を維持する", async () => {
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
    configurable: true,
  });
  const schedulePrompt = vi.fn();
  const cancelPrompt = vi.fn();
  render(
    <RoomOutcomeView
      outcome={{ issue: "課題", hmw: "問い", idea: "案" }}
      authorized
      connected={false}
      onExportSuccess={schedulePrompt}
      onExportFailure={cancelPrompt}
      feedbackPrompt={<p>感想の案内</p>}
    >
      <section aria-label="完了ルームの記録">共有時の記録</section>
    </RoomOutcomeView>,
  );
  expect(cancelPrompt).not.toHaveBeenCalled();
  expect(
    screen.getByRole("region", { name: "完了ルームの記録" }),
  ).toBeVisible();
  expect(screen.getByText("感想の案内")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "全文をコピー" }));
  await screen.findByText(/コピーしました/);
  expect(schedulePrompt).toHaveBeenCalledOnce();
});
