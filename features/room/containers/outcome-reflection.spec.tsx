import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import {
  reflectionPlanFixture,
  reflectionResponseFixture,
  reflectionSharedFixture,
} from "@/contracts/outcome-reflection.fixture";
import { OutcomeReflection } from "./outcome-reflection";

const empty = () =>
  reflectionResponseFixture({
    shared: reflectionSharedFixture({
      revision: 0,
      result: null,
      context: { audience: "", situation: "" },
      generatedAt: null,
    }),
  });
afterEach(() => vi.unstubAllGlobals());
it("目的を選んで開き、入口に戻って別の目的へ進んでも保存済みの手順を再取得しない", async () => {
  const fetch = vi
    .fn()
    .mockImplementation(async () => Response.json(reflectionResponseFixture()));
  vi.stubGlobal("fetch", fetch);
  render(<OutcomeReflection roomId="room" />);
  fireEvent.click(screen.getByRole("button", { name: "調査を準備する" }));
  await screen.findByText(reflectionPlanFixture().method);
  fireEvent.click(screen.getByRole("button", { name: "次のアクションに戻る" }));
  expect(
    screen.queryByRole("article", { name: "調査の手順" }),
  ).not.toBeInTheDocument();
  fireEvent.click(
    screen.getByRole("button", { name: "競合・代替手段を調べる" }),
  );
  expect(
    screen.getByRole("button", { name: "競合調査の依頼文を作る" }),
  ).toBeVisible();
  expect(fetch).toHaveBeenCalledTimes(1);
});
it("前へ・次へで手順を読み、現在の手順へフォーカスを移す", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockImplementation(async () =>
        Response.json(reflectionResponseFixture()),
      ),
  );
  render(<OutcomeReflection roomId="room" />);
  fireEvent.click(screen.getByRole("button", { name: "調査を準備する" }));
  const plan = reflectionPlanFixture();
  await screen.findByRole("heading", { name: plan.steps[0].title });
  fireEvent.click(screen.getByRole("button", { name: "次へ" }));
  expect(
    screen.getByRole("heading", { name: plan.steps[1].title }),
  ).toHaveFocus();
  fireEvent.click(screen.getByRole("button", { name: "前へ" }));
  expect(
    screen.getByRole("heading", { name: plan.steps[0].title }),
  ).toHaveFocus();
  fireEvent.click(screen.getByRole("button", { name: "次へ" }));
  fireEvent.click(screen.getByRole("button", { name: "次へ" }));
  expect(screen.getByText(plan.steps[2].task)).toBeVisible();
  expect(
    screen.getByRole("heading", { name: plan.steps[2].title }),
  ).toHaveFocus();
  expect(screen.getByRole("button", { name: "準備物を選ぶ" })).toBeVisible();
});
it("調査・競合調査・制作物の入口を分け、手順を開くと保存済みの共通版を取得する", async () => {
  const fetch = vi
    .fn()
    .mockResolvedValue(Response.json(reflectionResponseFixture()));
  vi.stubGlobal("fetch", fetch);
  render(<OutcomeReflection roomId="room" />);
  expect(fetch).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "調査を準備する" }));
  await waitFor(() =>
    expect(fetch).toHaveBeenCalledWith(
      "/api/completed-rooms/room/reflection",
      expect.objectContaining({ method: "GET" }),
    ),
  );
  expect(
    await screen.findByRole("heading", {
      name: reflectionPlanFixture().steps[0].title,
    }),
  ).toBeVisible();
  expect(
    screen.getByRole("button", { name: "次のアクションに戻る" }),
  ).toBeVisible();
  expect(screen.getByRole("button", { name: "前へ" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "次へ" }));
  expect(screen.getByText(reflectionPlanFixture().steps[1].task)).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "次へ" }));
  expect(screen.getByText(reflectionPlanFixture().synthesis)).toBeVisible();
  expect(fetch).toHaveBeenCalledTimes(1);
});
it("不足項目を回答し、共通手順の更新確認後に参照版と補足を送る", async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(Response.json(empty()))
    .mockResolvedValueOnce(
      Response.json(
        reflectionResponseFixture({
          shared: reflectionSharedFixture({
            context: { audience: "", situation: "" },
            result: {
              kind: "questions",
              questions: [
                { field: "audience", question: "誰の困りごとですか？" },
              ],
            },
          }),
        }),
      ),
    )
    .mockResolvedValueOnce(
      Response.json(
        reflectionResponseFixture({
          shared: reflectionSharedFixture({ revision: 2 }),
        }),
      ),
    );
  vi.stubGlobal("fetch", fetch);
  render(<OutcomeReflection roomId="room" />);
  fireEvent.click(screen.getByRole("button", { name: "調査を準備する" }));
  fireEvent.click(
    await screen.findByRole("button", { name: "調査の手順を作る" }),
  );
  fireEvent.change(
    await screen.findByRole("textbox", { name: "誰の困りごとですか？" }),
    { target: { value: "分からない" } },
  );
  expect(
    screen.queryByRole("textbox", { name: "どんな場面の困りごと？" }),
  ).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "補足して手順を作る" }));
  expect(fetch).toHaveBeenCalledTimes(2);
  fireEvent.click(screen.getByRole("button", { name: "共通の手順を更新する" }));
  await screen.findByText(reflectionPlanFixture().method);
  expect(JSON.parse(fetch.mock.calls[2][1].body)).toEqual({
    action: "research",
    revision: 1,
    context: { audience: "分からない", situation: "" },
  });
});
it("制作物変更では推論せず、選んだ制作物と表示版だけを生成要求に含める", async () => {
  const prompt = {
    revision: 1,
    artifact: "説明するスライド",
    content: "スライドの構成を作成してください。",
    generatedAt: Date.now(),
  };
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(Response.json(reflectionResponseFixture()))
    .mockResolvedValueOnce(
      Response.json(
        reflectionResponseFixture({
          prompt,
          selectedArtifact: prompt.artifact,
        }),
      ),
    );
  const writeText = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal("navigator", { clipboard: { writeText } });
  vi.stubGlobal("fetch", fetch);
  render(<OutcomeReflection roomId="room" />);
  fireEvent.click(screen.getByRole("button", { name: "調査の準備物を選ぶ" }));
  fireEvent.click(
    await screen.findByRole("radio", { name: "説明するスライド" }),
  );
  expect(fetch).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button", { name: "制作依頼文を作る" }));
  await screen.findByRole("button", { name: "依頼文をコピー" });
  fireEvent.click(screen.getByText("依頼文の全文を確認"));
  await screen.findByRole("textbox", { name: "制作プロンプト全文" });
  expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual({
    action: "artifact",
    revision: 1,
    artifact: "説明するスライド",
  });
  fireEvent.click(screen.getByRole("button", { name: "依頼文をコピー" }));
  await screen.findByText("コピーしました。");
  expect(writeText).toHaveBeenCalledWith(prompt.content);
});
it("最新版を取得しても、各自が変更した制作物に別の制作依頼文を表示しない", async () => {
  const response = reflectionResponseFixture({
    selectedArtifact: "質問リスト",
    prompt: {
      revision: 1,
      artifact: "質問リスト",
      content: "質問リストを作成してください。",
      generatedAt: Date.now(),
    },
  });
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation(async () => Response.json(response)),
  );
  render(<OutcomeReflection roomId="room" />);
  fireEvent.click(screen.getByRole("button", { name: "調査の準備物を選ぶ" }));
  await screen.findByRole("textbox", { name: "制作プロンプト全文" });
  fireEvent.change(screen.getByRole("textbox", { name: "別の準備物" }), {
    target: { value: "進行台本" },
  });
  fireEvent.click(screen.getByRole("button", { name: "最新版を取得" }));
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "最新版を取得" })).toBeEnabled(),
  );
  expect(screen.getByRole("textbox", { name: "別の準備物" })).toHaveValue(
    "進行台本",
  );
  expect(
    screen.queryByRole("textbox", { name: "制作プロンプト全文" }),
  ).not.toBeInTheDocument();
});
it("調査手順なしでも競合調査と自由入力の制作依頼へ進める", async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(Response.json(empty()))
    .mockResolvedValueOnce(
      Response.json({
        ...empty(),
        competitionPrompt: "競合と代替手段を出典付きで調べてください。",
      }),
    )
    .mockResolvedValueOnce(new Response(null, { status: 503 }));
  vi.stubGlobal("fetch", fetch);
  render(<OutcomeReflection roomId="room" />);
  fireEvent.click(
    screen.getByRole("button", { name: "競合・代替手段を調べる" }),
  );
  fireEvent.click(
    await screen.findByRole("button", { name: "競合調査の依頼文を作る" }),
  );
  await screen.findByRole("button", { name: "依頼文をコピー" });
  fireEvent.click(await screen.findByText("依頼文の全文を確認"));
  await screen.findByRole("textbox", { name: "競合調査プロンプト全文" });
  expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual({
    action: "competition",
    revision: 0,
  });
  fireEvent.click(screen.getByRole("button", { name: "次のアクションに戻る" }));
  fireEvent.click(screen.getByRole("button", { name: "調査の準備物を選ぶ" }));
  fireEvent.change(screen.getByRole("textbox", { name: "別の準備物" }), {
    target: { value: "進行台本" },
  });
  fireEvent.click(screen.getByRole("button", { name: "制作依頼文を作る" }));
  await screen.findByRole("alert");
  expect(screen.getByRole("textbox", { name: "別の準備物" })).toHaveValue(
    "進行台本",
  );
});
it("共通手順の更新失敗では表示を保ち、再取得するまで版を自動で切り替えない", async () => {
  const next = reflectionResponseFixture({
    shared: reflectionSharedFixture({
      revision: 2,
      result: reflectionPlanFixture({ method: "別の調査方法" }),
    }),
  });
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(Response.json(reflectionResponseFixture()))
    .mockResolvedValueOnce(
      Response.json(
        {
          error: "共通の調査手順が更新されています。最新版を取得してください。",
        },
        { status: 409 },
      ),
    )
    .mockResolvedValueOnce(Response.json(next));
  vi.stubGlobal("fetch", fetch);
  render(<OutcomeReflection roomId="room" />);
  fireEvent.click(screen.getByRole("button", { name: "調査を準備する" }));
  fireEvent.click(
    await screen.findByRole("button", { name: "調査条件を編集" }),
  );
  expect(
    screen.getByRole("textbox", { name: "誰の困りごとを調べたい？" }),
  ).toHaveFocus();
  fireEvent.change(
    screen.getByRole("textbox", { name: "誰の困りごとを調べたい？" }),
    { target: { value: "社会人" } },
  );
  fireEvent.click(screen.getByRole("button", { name: "補足して手順を作る" }));
  fireEvent.click(screen.getByRole("button", { name: "共通の手順を更新する" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("最新版を取得");
  fireEvent.click(screen.getByRole("button", { name: "変更をやめる" }));
  expect(screen.getByText(reflectionPlanFixture().method)).toBeVisible();
  expect(screen.queryByText("別の調査方法")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "最新版を取得" }));
  await screen.findByText("別の調査方法");
});
it("閲覧権限を失った応答では保存済みの手順も隠す", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValueOnce(Response.json(reflectionResponseFixture()))
      .mockResolvedValueOnce(new Response(null, { status: 404 })),
  );
  render(<OutcomeReflection roomId="room" />);
  fireEvent.click(screen.getByRole("button", { name: "調査を準備する" }));
  await screen.findByText(reflectionPlanFixture().method);
  fireEvent.click(screen.getByRole("button", { name: "最新版を取得" }));
  await screen.findByRole("alert");
  expect(
    screen.queryByText(reflectionPlanFixture().method),
  ).not.toBeInTheDocument();
});
