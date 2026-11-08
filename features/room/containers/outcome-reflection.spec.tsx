import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import {
  reflectionAnalysisFixture,
  reflectionResponseFixture,
} from "@/contracts/outcome-reflection.fixture";
import { OutcomeReflection } from "./outcome-reflection";

afterEach(() => vi.unstubAllGlobals());
it("明示操作で分析し、制作物の変更時はプロンプトだけ要求する", async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(Response.json(reflectionResponseFixture()))
    .mockResolvedValueOnce(
      Response.json(
        reflectionResponseFixture({
          prompt: {
            artifact: "説明するスライド",
            content: "イベントの体験を3場面で説明してください。",
            generatedAt: Date.now(),
          },
        }),
      ),
    );
  vi.stubGlobal("fetch", fetch);
  render(<OutcomeReflection roomId="room" />);
  expect(fetch).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "AIと振り返る" }));
  await screen.findByText("この案で、何が変わりそう？");
  expect(
    screen.getByRole("heading", {
      name: "このアイデア、まずどう試してみよう？",
    }),
  ).toBeInTheDocument();
  fireEvent.click(screen.getByRole("link", { name: "最初に確かめたいことへ" }));
  expect(
    screen.getByText(reflectionAnalysisFixture().assumption.headline),
  ).toBeVisible();
  fireEvent.click(screen.getByRole("link", { name: "まず試してみることへ" }));
  const experiment = reflectionAnalysisFixture().experiment;
  expect(screen.getByText(experiment.who)).toBeVisible();
  expect(screen.getByText(experiment.observe)).toBeVisible();
  expect(screen.getByText(experiment.ifSupported)).toBeVisible();
  expect(screen.getByText(experiment.ifNotSupported)).toBeVisible();
  expect(
    screen.getByRole("radio", { name: "聞くことのリストを作りたい" }),
  ).toBeChecked();
  fireEvent.click(
    screen.getByRole("radio", { name: "説明するスライドを作りたい" }),
  );
  expect(fetch).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button", { name: "AIへの依頼文を作る" }));
  await screen.findByRole("textbox", { name: "制作プロンプト全文" });
  expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual({
    artifact: "説明するスライド",
  });
  expect(screen.getByText("この案で、何が変わりそう？")).toBeInTheDocument();
});
it("分析に失敗しても自由入力でプロンプト生成へ進める", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response(null, { status: 503 })),
  );
  render(<OutcomeReflection roomId="room" />);
  fireEvent.click(screen.getByRole("button", { name: "AIと振り返る" }));
  await screen.findByRole("alert");
  fireEvent.change(
    screen.getByRole("textbox", { name: "ほかに作りたいものはある？" }),
    { target: { value: "授業シナリオ" } },
  );
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "AIへの依頼文を作る" }),
    ).toBeEnabled(),
  );
});
