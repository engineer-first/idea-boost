import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { completedRoomFixture } from "@/contracts/completed-rooms.fixture";
import { CompletedRoomDetail } from "./completed-room-detail";

afterEach(() => vi.unstubAllGlobals());
it.each([401, 404])(
  "詳細の%sは本人確認・保存期限の説明を表示する",
  async (status) => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(Response.json({}, { status })),
    );
    render(<CompletedRoomDetail roomId={completedRoomFixture().roomId} />);
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(
      status === 401
        ? "本人情報を確認できないため、成果を表示できません。成果を残したときと同じブラウザで開いてください。"
        : "保存期限が過ぎたか、この成果を閲覧できる本人ではありません。",
    );
    expect(alert).not.toHaveTextContent(/ログイン|Google|アカウント/);
  },
);
it.each([401, 404])(
  "場面の%sは本文と出力を隠し同じ説明を表示する",
  async (status) => {
    const room = completedRoomFixture();
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(Response.json(room))
        .mockResolvedValueOnce(Response.json({}, { status })),
    );
    render(<CompletedRoomDetail roomId={room.roomId} />);
    fireEvent.click(
      await screen.findByRole("button", { name: "検討の経緯を見る" }),
    );
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(
      status === 401
        ? "本人情報を確認できないため、成果を表示できません。成果を残したときと同じブラウザで開いてください。"
        : "保存期限が過ぎたか、この成果を閲覧できる本人ではありません。",
    );
    expect(alert).not.toHaveTextContent(/ログイン|Google|アカウント/);
    expect(
      screen.queryByRole("button", { name: "全文をコピー" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "テキストを保存" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(room.idea)).not.toBeInTheDocument();
  },
);
