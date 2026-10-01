import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { NoteDraftRecovery } from "./note-draft-recovery";

afterEach(() => vi.unstubAllGlobals());

it("本人の全文をコピーできたことを伝え、閉じて再表示しても文章を保持する", async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal("navigator", { clipboard: { writeText } });
  render(
    <NoteDraftRecovery
      items={[
        {
          noteId: "note",
          text: "未反映の本人の全文",
          reason: "他の編集と競合しました。",
        },
      ]}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "確認・コピー" }));
  fireEvent.click(screen.getByRole("button", { name: "コピー" }));
  await waitFor(() =>
    expect(writeText).toHaveBeenCalledWith("未反映の本人の全文"),
  );
  expect(
    await screen.findByRole("status", { name: "コピー結果" }),
  ).toHaveTextContent("コピーしました");
  fireEvent.click(screen.getByRole("button", { name: "閉じる" }));
  expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "確認・コピー" }));
  expect(screen.getByRole("textbox", { name: "未反映の文章 1" })).toHaveValue(
    "未反映の本人の全文",
  );
});

it("開閉状態を伝え、復旧文章の領域をトリガーから特定できる", () => {
  render(
    <NoteDraftRecovery
      items={[
        {
          noteId: "note",
          text: "本人の文章",
          reason: "現在は編集できません。",
        },
      ]}
    />,
  );
  const trigger = screen.getByRole("button", { name: "確認・コピー" });
  expect(trigger).toHaveAttribute("aria-expanded", "false");
  fireEvent.click(trigger);
  expect(trigger).toHaveAttribute("aria-expanded", "true");
  const contentId = trigger.getAttribute("aria-controls");
  expect(contentId).toBeTruthy();
  expect(document.getElementById(contentId ?? "")).toContainElement(
    screen.getByRole("textbox"),
  );
});
