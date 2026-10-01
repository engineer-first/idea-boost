import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FeedbackInputSchema } from "@/contracts/feedback";
import { submitFeedback } from "@/features/feedback";
import { CompletedRoomDetail } from "./completed-room-detail";
import { CompletedRooms } from "./completed-rooms";

vi.mock("@/features/feedback", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/feedback")>()),
  submitFeedback: vi.fn(),
}));

const roomId = "11111111-1111-4111-8111-111111111111";
const kinds = [
  "problem-grouping",
  "problem-decision",
  "question-decision",
  "idea-mapping",
  "idea-decision",
];
const detail = {
  roomId,
  idea: "採用の全文",
  completedAt: 1,
  expiresAt: 2592000001,
  decisions: [1, 2, 3].map((phase) => ({
    phase,
    noteId: String(phase),
    content: phase === 3 ? "採用の全文" : `決定${phase}`,
  })),
  scenes: kinds.map((kind) => ({ kind, recordedAt: 1, status: "saved" })),
};
afterEach(() => vi.unstubAllGlobals());
describe("本人の完了ルーム", () => {
  it("正常空から一覧を開き直さず、遅れて反映された同じルームを再取得できる", async () => {
    let resolveIndexed!: (response: Response) => void;
    const indexed = new Promise<Response>((resolve) => {
      resolveIndexed = resolve;
    });
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ rooms: [], nextCursor: null }))
      .mockReturnValueOnce(indexed);
    vi.stubGlobal("fetch", fetcher);
    render(<CompletedRooms />);
    await screen.findByText("以前のルームはまだありません。");
    fireEvent.click(screen.getByRole("button", { name: "最新の一覧を取得" }));
    expect(screen.getByRole("status")).toHaveTextContent("読み込み");
    expect(
      screen.getByRole("button", { name: "最新の一覧を取得" }),
    ).toBeDisabled();
    await act(async () =>
      resolveIndexed(Response.json({ rooms: [detail], nextCursor: null })),
    );
    await screen.findByText("採用の全文");
    expect(
      screen.queryByText("以前のルームはまだありません。"),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "成果を見る" })).toHaveAttribute(
      "href",
      `/completed-rooms/${roomId}`,
    );
    expect(fetcher.mock.calls[1][0]).toBe("/api/completed-rooms");
  });
  it("空の途中ページを0件と断定せず、続きの成果へ進める", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({ rooms: [], nextCursor: "remaining" }),
      )
      .mockResolvedValueOnce(
        Response.json({ rooms: [detail], nextCursor: null }),
      );
    vi.stubGlobal("fetch", fetcher);
    render(<CompletedRooms />);
    const more = await screen.findByRole("button", {
      name: "次のルームを表示",
    });
    expect(
      screen.queryByText("以前のルームはまだありません。"),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(
        "このページに表示できるルームはありません。続きのルームを確認してください。",
      ),
    ).toBeVisible();
    fireEvent.click(more);
    await screen.findByText("採用の全文");
    expect(fetcher.mock.calls[1][0]).toBe(
      "/api/completed-rooms?cursor=remaining",
    );
    expect(screen.getByRole("link", { name: "成果を見る" })).toHaveAttribute(
      "href",
      `/completed-rooms/${roomId}`,
    );
    expect(
      screen.queryByRole("button", { name: "次のルームを表示" }),
    ).not.toBeInTheDocument();
  });

  it("続きを重複なく追加し、成功後の更新は先頭ページから取り直す", async () => {
    const second = {
      ...detail,
      roomId: "22222222-2222-4222-8222-222222222222",
      idea: "次の成果",
    };
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({ rooms: [detail], nextCursor: "page-2" }),
      )
      .mockResolvedValueOnce(
        Response.json({ rooms: [detail, second], nextCursor: "page-3" }),
      )
      .mockResolvedValueOnce(
        Response.json({ rooms: [second], nextCursor: null }),
      );
    vi.stubGlobal("fetch", fetcher);
    render(<CompletedRooms />);
    await screen.findByText("採用の全文");
    fireEvent.click(screen.getByRole("button", { name: "次のルームを表示" }));
    await screen.findByText("次の成果");
    expect(screen.getAllByRole("link", { name: "成果を見る" })).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "最新の一覧を取得" }));
    await waitFor(() =>
      expect(screen.queryByText("採用の全文")).not.toBeInTheDocument(),
    );
    expect(fetcher.mock.calls[2][0]).toBe("/api/completed-rooms");
    expect(
      screen.queryByRole("button", { name: "次のルームを表示" }),
    ).not.toBeInTheDocument();
  });

  it.each([
    401, 404,
  ])("一覧の更新で%sになったら前回の成果を残さない", async (status) => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({ rooms: [detail], nextCursor: null }),
      )
      .mockResolvedValueOnce(Response.json({}, { status }));
    vi.stubGlobal("fetch", fetcher);
    render(<CompletedRooms />);
    await screen.findByText("採用の全文");
    fireEvent.click(screen.getByRole("button", { name: "最新の一覧を取得" }));
    await screen.findByRole("alert");
    expect(screen.queryByText("採用の全文")).not.toBeInTheDocument();
    expect(
      screen.queryByText("以前のルームはまだありません。"),
    ).not.toBeInTheDocument();
  });

  it("一覧を離れた後に遅い応答が届いても再訪した一覧へ混ざらない", async () => {
    let resolveOld!: (response: Response) => void;
    const old = new Promise<Response>((resolve) => {
      resolveOld = resolve;
    });
    const fetcher = vi
      .fn()
      .mockReturnValueOnce(old)
      .mockResolvedValueOnce(Response.json({ rooms: [], nextCursor: null }));
    vi.stubGlobal("fetch", fetcher);
    const first = render(<CompletedRooms />);
    first.unmount();
    expect(fetcher.mock.calls[0][1].signal.aborted).toBe(true);
    render(<CompletedRooms />);
    await screen.findByText("以前のルームはまだありません。");
    await act(async () =>
      resolveOld(Response.json({ rooms: [detail], nextCursor: null })),
    );
    expect(screen.queryByText("採用の全文")).not.toBeInTheDocument();
  });

  it("失敗を0件と扱わず再取得し、次ページを追加する", async () => {
    const fetcher = vi
      .fn()
      .mockRejectedValueOnce(new Error())
      .mockResolvedValueOnce(
        Response.json({ rooms: [detail], nextCursor: "next" }),
      )
      .mockResolvedValueOnce(
        Response.json({
          rooms: [
            {
              ...detail,
              roomId: "22222222-2222-4222-8222-222222222222",
              idea: "次の成果",
            },
          ],
          nextCursor: null,
        }),
      );
    vi.stubGlobal("fetch", fetcher);
    render(<CompletedRooms />);
    expect(screen.getByRole("status")).toHaveTextContent("読み込み");
    await screen.findByRole("alert");
    expect(
      screen.queryByText("以前のルームはまだありません。"),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "再取得" }));
    await screen.findByText("採用の全文");
    fireEvent.click(screen.getByRole("button", { name: "次のルームを表示" }));
    await screen.findByText("次の成果");
    expect(screen.getAllByRole("link", { name: "成果を見る" })).toHaveLength(2);
  });
  it("3件を先に表示し、経緯を閉じ、通信の遅い旧選択で現在の本文を上書きしない", async () => {
    let resolveOld!: (r: Response) => void;
    const old = new Promise<Response>((resolve) => {
      resolveOld = resolve;
    });
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(Response.json(detail))
      .mockReturnValueOnce(old)
      .mockResolvedValueOnce(
        Response.json({
          scene: { kind: "problem-decision", recordedAt: 2, status: "missing" },
          board: null,
        }),
      );
    vi.stubGlobal("fetch", fetcher);
    render(<CompletedRoomDetail roomId={roomId} />);
    await screen.findByText("採用の全文");
    expect(screen.getByRole("button", { name: "全文をコピー" })).toBeEnabled();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "検討の経緯を見る" }));
    expect(screen.getByRole("combobox", { name: "見返す場面" })).toHaveValue(
      "problem-grouping",
    );
    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: "problem-decision" },
    });
    await screen.findByText(/記録を保存できず/);
    await act(async () =>
      resolveOld(
        Response.json({
          scene: { kind: "problem-grouping", recordedAt: 1, status: "pending" },
          board: null,
        }),
      ),
    );
    expect(screen.getByText(/記録を保存できず/)).toBeInTheDocument();
    expect(screen.queryByText(/反映を待っています/)).not.toBeInTheDocument();
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
  it("本人権限を失った再取得では前回本文を残さない", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(Response.json(detail))
      .mockResolvedValueOnce(
        Response.json({ error: "not found" }, { status: 404 }),
      );
    vi.stubGlobal("fetch", fetcher);
    render(<CompletedRoomDetail roomId={roomId} />);
    await screen.findByText("採用の全文");
    fireEvent.click(screen.getByRole("button", { name: "成果を再取得" }));
    await screen.findByRole("alert");
    await waitFor(() =>
      expect(screen.queryByText("採用の全文")).not.toBeInTheDocument(),
    );
    expect(
      screen.queryByRole("button", { name: "フィードバック" }),
    ).not.toBeInTheDocument();
  });
});
it("正常な0件では再取得エラーを出さない", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(Response.json({ rooms: [], nextCursor: null })),
  );
  render(<CompletedRooms />);
  await screen.findByText("以前のルームはまだありません。");
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});
it("反映待ちから同じ場面を再取得して正常な0枚を表示する", async () => {
  const scene = { kind: "problem-grouping", recordedAt: 1, status: "pending" };
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(Response.json(detail))
    .mockResolvedValueOnce(Response.json({ scene, board: null }))
    .mockResolvedValueOnce(
      Response.json({
        scene: { ...scene, status: "saved" },
        board: {
          kind: scene.kind,
          recordedAt: 1,
          phase: 1,
          notes: [],
          groups: [],
          ideaMapSizeLevel: 0,
          decisions: [],
        },
      }),
    );
  vi.stubGlobal("fetch", fetcher);
  render(<CompletedRoomDetail roomId={roomId} />);
  await screen.findByText("採用の全文");
  fireEvent.click(screen.getByRole("button", { name: "検討の経緯を見る" }));
  await screen.findByText(/反映を待っています/);
  fireEvent.click(screen.getByRole("button", { name: "場面を再取得" }));
  await screen.findByText("その場面の共有付箋は0枚です。");
  expect(fetcher.mock.calls[1][0]).toBe(fetcher.mock.calls[2][0]);
});
it("場面の通信エラーを記録欠落と断定せず、再取得できる", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(Response.json(detail))
    .mockRejectedValueOnce(new Error())
    .mockResolvedValueOnce(
      Response.json({
        scene: {
          kind: "problem-grouping",
          recordedAt: null,
          status: "before-recording",
        },
        board: null,
      }),
    );
  vi.stubGlobal("fetch", fetcher);
  render(<CompletedRoomDetail roomId={roomId} />);
  await screen.findByText("採用の全文");
  fireEvent.click(screen.getByRole("button", { name: "検討の経緯を見る" }));
  await screen.findByRole("alert");
  expect(screen.queryByText(/記録機能の導入前/)).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "場面を再取得" }));
  await screen.findByText(/記録機能の導入前/);
});

describe("read-only成果から感想へ", () => {
  it("在籍再訪の常設入口からapp対象・種類のみで送信して受付へ進む", async () => {
    vi.mocked(submitFeedback).mockResolvedValue({
      ok: true,
      id: "019a01f4-aaaa-7aaa-8aaa-aaaaaaaaaaaa",
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(detail)));
    render(<CompletedRoomDetail roomId={roomId} />);
    await screen.findByText("採用の全文");
    const entry = screen.getByRole("button", { name: "フィードバック" });
    expect(screen.getByText(/感想は現在参加中のルームからのみ/)).toBeVisible();
    entry.focus();
    fireEvent.click(entry);
    expect(
      screen.getByRole("dialog", { name: "フィードバック" }),
    ).toBeVisible();
    expect(screen.getByRole("combobox", { name: "対象" })).toHaveValue("app");
    fireEvent.click(screen.getByRole("radio", { name: "よかった" }));
    fireEvent.click(screen.getByRole("button", { name: "送信" }));
    await screen.findByText(/受付ID：019a01f4/);
    expect(submitFeedback).toHaveBeenLastCalledWith(
      roomId,
      expect.objectContaining({
        target: "app",
        kind: "good",
        body: "",
        rating: null,
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "受領画面を閉じる" }));
    expect(entry).toHaveFocus();
    expect(screen.getByText("採用の全文")).toBeVisible();
  });

  it("退出後404ではpendingを解除し入力を保持、受付を偽らず成果の出力を保つ", async () => {
    let resolve!: (result: Awaited<ReturnType<typeof submitFeedback>>) => void;
    vi.mocked(submitFeedback)
      .mockReset()
      .mockResolvedValue({
        ok: false,
        error: "参加中のルームを確認できません。退出・解散後は送信できません。",
      })
      .mockReturnValueOnce(
        new Promise((done) => {
          resolve = done;
        }),
      );
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(detail)));
    const copy = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText: copy } });
    render(<CompletedRoomDetail roomId={roomId} />);
    await screen.findByText("採用の全文");
    fireEvent.click(screen.getByRole("button", { name: "フィードバック" }));
    fireEvent.click(screen.getByRole("radio", { name: "よかった" }));
    fireEvent.change(screen.getByRole("textbox", { name: "文章（任意）" }), {
      target: { value: "退出後の入力を残す" },
    });
    fireEvent.click(screen.getByRole("button", { name: "送信" }));
    expect(screen.getByRole("button", { name: "送信中…" })).toBeDisabled();
    await act(async () =>
      resolve({
        ok: false,
        error: "参加中のルームを確認できません。退出・解散後は送信できません。",
      }),
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "退出・解散後は送信できません",
    );
    expect(screen.getByRole("textbox", { name: "文章（任意）" })).toHaveValue(
      "退出後の入力を残す",
    );
    expect(screen.getByRole("button", { name: "送信" })).toBeEnabled();
    expect(screen.queryByText(/受付ID：/)).not.toBeInTheDocument();
    const firstId = FeedbackInputSchema.parse(
      vi.mocked(submitFeedback).mock.calls[0][1],
    ).id;
    fireEvent.click(screen.getByRole("button", { name: "送信" }));
    await waitFor(() => expect(submitFeedback).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "送信" })).toBeEnabled(),
    );
    expect(
      FeedbackInputSchema.parse(vi.mocked(submitFeedback).mock.calls[1][1]).id,
    ).toBe(firstId);
    expect(screen.queryByText(/受付ID：/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "入力欄を閉じる" }));
    fireEvent.click(screen.getByRole("button", { name: "全文をコピー" }));
    await waitFor(() => expect(copy).toHaveBeenCalledOnce());
    expect(copy).toHaveBeenCalledWith(expect.stringContaining("採用の全文"));
    expect(
      screen.getByRole("button", { name: "テキストを保存" }),
    ).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "フィードバック" }));
    expect(screen.getByRole("textbox", { name: "文章（任意）" })).toHaveValue(
      "退出後の入力を残す",
    );
  });
});
