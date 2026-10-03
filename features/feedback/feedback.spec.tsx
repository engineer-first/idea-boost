import {
  act,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { SubmitFeedback } from "@/contracts/feedback";
import { FeedbackPanel } from "./feedback-panel";
import { useFeedback } from "./use-feedback";

const roomId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
function Harness({
  submit,
  target = "1-3",
}: {
  submit: SubmitFeedback;
  target?: string;
}) {
  const feedback = useFeedback(roomId, submit);
  return (
    <>
      <button type="button" onClick={() => feedback.open(target)}>
        フィードバック
      </button>
      <FeedbackPanel feedback={feedback} />
    </>
  );
}
beforeEach(() => sessionStorage.clear());
afterEach(() => vi.useRealTimers());
it("受領後に作業へ戻り、元の入口から別の意見を再開できる", async () => {
  const submit = vi
    .fn<SubmitFeedback>()
    .mockImplementation(async (_room, input) => ({ ok: true, id: input.id }));
  render(<Harness submit={submit} />);
  const trigger = screen.getByRole("button", { name: "フィードバック" });
  trigger.focus();
  fireEvent.click(trigger);
  fireEvent.click(screen.getByRole("radio", { name: "よかった" }));
  fireEvent.click(screen.getByRole("button", { name: "送信" }));
  await screen.findByText(/意見を受け付けました/);
  expect(
    screen.getByText(`受付ID：${submit.mock.calls[0][1].id}`),
  ).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "作業に戻る" }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(trigger).toHaveFocus();
  fireEvent.click(trigger);
  expect(screen.getByLabelText("対象")).toHaveValue("1-3");
  expect(screen.getByLabelText("文章（任意）")).toHaveValue("");
  expect(screen.getByRole("radio", { name: "よかった" })).not.toBeChecked();
  expect(screen.getByRole("button", { name: "送信" })).toBeDisabled();
});
it("種類のみを送り、失敗しても入力と受付IDを保ち、成功後は別の意見を送れる", async () => {
  const submit = vi
    .fn<SubmitFeedback>()
    .mockResolvedValueOnce({ ok: false, error: "保存できませんでした" })
    .mockImplementation(async (_room, input) => ({ ok: true, id: input.id }));
  render(<Harness submit={submit} />);
  fireEvent.click(screen.getByRole("button", { name: "フィードバック" }));
  expect(screen.getByLabelText("対象")).toHaveValue("1-3");
  fireEvent.click(screen.getByRole("radio", { name: "不具合" }));
  fireEvent.click(screen.getByRole("button", { name: "送信" }));
  await screen.findByRole("alert");
  expect(screen.getByRole("heading", { name: "フィードバック" })).toHaveFocus();
  expect(screen.getByRole("radio", { name: "不具合" })).toBeChecked();
  fireEvent.click(screen.getByRole("button", { name: "送信" }));
  await screen.findByText(/意見を受け付けました/);
  expect(submit.mock.calls[0][1]).toMatchObject({
    target: "1-3",
    kind: "bug",
    body: "",
    rating: null,
  });
  expect(submit.mock.calls[0][1].id).toBe(submit.mock.calls[1][1].id);
});
it("工程移行と閉じる操作でも入力を維持し、アプリ全体だけ5段階を選べる", () => {
  const submit = vi.fn<SubmitFeedback>();
  const { rerender } = render(<Harness submit={submit} />);
  fireEvent.click(screen.getByRole("button", { name: "フィードバック" }));
  fireEvent.change(screen.getByLabelText("文章（任意）"), {
    target: { value: "移動に迷った" },
  });
  rerender(<Harness submit={submit} target="1-4" />);
  expect(screen.getByLabelText("対象")).toHaveValue("1-3");
  fireEvent.click(screen.getByRole("button", { name: "入力欄を閉じる" }));
  fireEvent.click(screen.getByRole("button", { name: "フィードバック" }));
  expect(screen.getByLabelText("文章（任意）")).toHaveValue("移動に迷った");
  fireEvent.change(screen.getByLabelText("対象"), { target: { value: "app" } });
  fireEvent.click(screen.getByRole("radio", { name: "4 使いやすい" }));
  expect(screen.getByRole("radio", { name: "4 使いやすい" })).toBeChecked();
  fireEvent.change(screen.getByLabelText("対象"), { target: { value: "1-4" } });
  expect(
    screen.queryByRole("group", { name: "使いやすさ（任意）" }),
  ).not.toBeInTheDocument();
});
it("送信中の二重操作を防ぎ、本文を変えた再送には新しい受付IDを使う", async () => {
  let finish!: (v: { ok: false; error: string }) => void;
  const submit = vi.fn<SubmitFeedback>().mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  render(<Harness submit={submit} />);
  fireEvent.click(screen.getByRole("button", { name: "フィードバック" }));
  fireEvent.click(screen.getByRole("radio", { name: "よかった" }));
  fireEvent.click(screen.getByRole("button", { name: "送信" }));
  expect(screen.getByRole("button", { name: "送信中…" })).toBeDisabled();
  expect(screen.getByLabelText("文章（任意）")).toBeDisabled();
  await act(async () => finish({ ok: false, error: "通信失敗" }));
  fireEvent.change(screen.getByLabelText("文章（任意）"), {
    target: { value: "わかりやすかった" },
  });
  fireEvent.click(screen.getByRole("button", { name: "送信" }));
  await waitFor(() => expect(submit).toHaveBeenCalledTimes(2));
  expect(submit.mock.calls[1][1].id).not.toBe(submit.mock.calls[0][1].id);
  expect(submit.mock.calls[1][1].body).toBe("わかりやすかった");
});
it("案内は500ms後に同じタブ・ルームで一度だけ表示し、入力中や失敗で予約を消す", () => {
  vi.useFakeTimers();
  const submit = vi.fn<SubmitFeedback>();
  const first = renderHook(() => useFeedback(roomId, submit));
  act(() => {
    first.result.current.schedulePrompt();
    first.result.current.schedulePrompt();
  });
  act(() => vi.advanceTimersByTime(499));
  expect(first.result.current.promptVisible).toBe(false);
  act(() => vi.advanceTimersByTime(1));
  expect(first.result.current.promptVisible).toBe(true);
  act(() => first.result.current.dismissPrompt());
  first.unmount();
  const next = renderHook(() => useFeedback(roomId, submit));
  act(() => next.result.current.schedulePrompt());
  act(() => vi.advanceTimersByTime(500));
  expect(next.result.current.promptVisible).toBe(false);
  const other = renderHook(() => useFeedback("other-room", submit));
  act(() => {
    other.result.current.schedulePrompt();
    other.result.current.cancelPrompt();
  });
  act(() => vi.advanceTimersByTime(500));
  expect(other.result.current.promptVisible).toBe(false);
  act(() => {
    other.result.current.schedulePrompt();
    other.result.current.open("app");
  });
  act(() => vi.advanceTimersByTime(500));
  expect(other.result.current.promptVisible).toBe(false);
});

it("閉じた未送信の入力がある間も自動案内で作業を妨げない", () => {
  vi.useFakeTimers();
  const hook = renderHook(() => useFeedback(roomId, vi.fn<SubmitFeedback>()));
  act(() => hook.result.current.open("app"));
  act(() => hook.result.current.change({ body: "途中の意見" }));
  act(() => hook.result.current.close());
  act(() => hook.result.current.schedulePrompt());
  act(() => vi.advanceTimersByTime(500));
  expect(hook.result.current.promptVisible).toBe(false);
});

it("応答が失われても同じIDで再送し、別ルームに移動した後の応答は捨てる", async () => {
  const submit = vi
    .fn<SubmitFeedback>()
    .mockRejectedValueOnce(new Error("response lost"))
    .mockImplementation(async (_room, input) => ({ ok: true, id: input.id }));
  const hook = renderHook(({ room }) => useFeedback(room, submit), {
    initialProps: { room: roomId },
  });
  act(() => hook.result.current.open("app"));
  act(() =>
    hook.result.current.change({ kind: "good", body: "届いたかわからない" }),
  );
  await act(() => hook.result.current.send());
  expect(hook.result.current.draft.body).toBe("届いたかわからない");
  await act(() => hook.result.current.send());
  expect(submit.mock.calls[0][1].id).toBe(submit.mock.calls[1][1].id);
  expect(submit.mock.calls.map((call) => call[1].body)).toEqual([
    "届いたかわからない",
    "届いたかわからない",
  ]);
  let complete!: (value: { ok: true; id: string }) => void;
  submit.mockImplementation(
    () =>
      new Promise((resolve) => {
        complete = resolve;
      }),
  );
  act(() => hook.result.current.open("app"));
  act(() => hook.result.current.change({ kind: "good" }));
  let pending!: Promise<void>;
  act(() => {
    pending = hook.result.current.send();
  });
  hook.rerender({ room: "other-room" });
  await act(async () => {
    complete({ ok: true, id: "old-room-receipt" });
    await pending;
  });
  expect(hook.result.current.receipt).toBeNull();
  expect(hook.result.current.isOpen).toBe(false);
});

it("期限切れIDだけを更新して、入力を変えず新しい意見として明示的に送れる", async () => {
  const submit = vi
    .fn<SubmitFeedback>()
    .mockResolvedValueOnce({
      ok: false,
      error: "受付IDの期限切れです",
      retryWithNewId: true,
    })
    .mockImplementation(async (_room, input) => ({ ok: true, id: input.id }));
  render(<Harness submit={submit} />);
  fireEvent.click(screen.getByRole("button", { name: "フィードバック" }));
  fireEvent.click(screen.getByRole("radio", { name: "よかった" }));
  fireEvent.click(screen.getByRole("button", { name: "送信" }));
  await screen.findByRole("alert");
  fireEvent.click(screen.getByRole("button", { name: "新しい意見として送信" }));
  await screen.findByText(/意見を受け付けました/);
  expect(submit.mock.calls[0][1].id).not.toBe(submit.mock.calls[1][1].id);
  expect(submit.mock.calls[1][1]).toMatchObject({
    target: "1-3",
    kind: "good",
    body: "",
  });
});

it.each([
  "1-3",
  "app",
])("対象%sで「わからない」を文章なしで送信できる", async (target) => {
  const submit = vi
    .fn<SubmitFeedback>()
    .mockImplementation(async (_room, input) => ({ ok: true, id: input.id }));
  render(<Harness submit={submit} target={target} />);
  fireEvent.click(screen.getByRole("button", { name: "フィードバック" }));
  fireEvent.click(screen.getByRole("radio", { name: "わからない" }));
  fireEvent.click(screen.getByRole("button", { name: "送信" }));
  await screen.findByText(/意見を受け付けました/);
  expect(submit.mock.calls[0][1]).toMatchObject({
    target,
    kind: "unclear",
    body: "",
    rating: null,
  });
});

it("入力した日本語・改行・記号を、末尾の入力直後の送信でも本文として渡す", async () => {
  const submit = vi
    .fn<SubmitFeedback>()
    .mockImplementation(async (_room, input) => ({ ok: true, id: input.id }));
  render(<Harness submit={submit} />);
  fireEvent.click(screen.getByRole("button", { name: "フィードバック" }));
  fireEvent.click(screen.getByRole("radio", { name: "不具合" }));
  const body = "日本語の意見です。\n改行・絵文字🙂・記号<&>も残す";
  fireEvent.change(screen.getByLabelText("文章（任意）"), {
    target: { value: body },
  });
  fireEvent.click(screen.getByRole("button", { name: "送信" }));
  await screen.findByText(/意見を受け付けました/);
  expect(submit).toHaveBeenCalledExactlyOnceWith(
    roomId,
    expect.objectContaining({ body }),
  );
});

it("日本語の変換中は送信せず、確定後の文章を送信する", async () => {
  const submit = vi
    .fn<SubmitFeedback>()
    .mockImplementation(async (_room, input) => ({ ok: true, id: input.id }));
  render(<Harness submit={submit} />);
  fireEvent.click(screen.getByRole("button", { name: "フィードバック" }));
  fireEvent.click(screen.getByRole("radio", { name: "不具合" }));
  const textarea = screen.getByLabelText("文章（任意）");
  fireEvent.compositionStart(textarea);
  fireEvent.change(textarea, { target: { value: "にほんご" } });
  const form = textarea.closest("form");
  if (!form) throw new Error("入力フォームが見つかりません");
  fireEvent.submit(form);
  expect(submit).not.toHaveBeenCalled();
  await act(async () => {
    fireEvent.compositionEnd(textarea, {
      data: "日本語",
      target: { value: "日本語" },
    });
    fireEvent.submit(form);
  });
  await screen.findByText(/意見を受け付けました/);
  expect(submit).toHaveBeenCalledExactlyOnceWith(
    roomId,
    expect.objectContaining({ body: "日本語" }),
  );
});

it("文章の確定と送信が同じイベント内でも、最新の入力を送る", async () => {
  const submit = vi
    .fn<SubmitFeedback>()
    .mockImplementation(async (_room, input) => ({ ok: true, id: input.id }));
  const hook = renderHook(() => useFeedback(roomId, submit));
  act(() => hook.result.current.open("app"));
  act(() => hook.result.current.change({ kind: "bug" }));
  await act(async () => {
    hook.result.current.change({ body: "確定した文章" });
    await hook.result.current.send();
  });
  expect(submit).toHaveBeenCalledExactlyOnceWith(
    roomId,
    expect.objectContaining({ body: "確定した文章" }),
  );
});

it("IMEの変換を取り消すEscapeでは入力欄を閉じない", () => {
  render(<Harness submit={vi.fn<SubmitFeedback>()} />);
  fireEvent.click(screen.getByRole("button", { name: "フィードバック" }));
  const textarea = screen.getByLabelText("文章（任意）");
  fireEvent.compositionStart(textarea);
  fireEvent.keyDown(textarea, { key: "Escape", isComposing: true });
  expect(screen.getByRole("dialog")).toBeInTheDocument();
  fireEvent.compositionEnd(textarea);
  fireEvent.keyDown(textarea, { key: "Escape" });
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});
