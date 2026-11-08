import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { reflectionResponseFixture } from "@/contracts/outcome-reflection.fixture";
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
            artifact: "体験シナリオ",
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
  await screen.findByText("問いとのつながり");
  fireEvent.click(screen.getByRole("radio", { name: "体験シナリオ" }));
  expect(fetch).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button", { name: "制作プロンプトを作る" }));
  await screen.findByRole("textbox", { name: "制作プロンプト全文" });
  expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual({
    artifact: "体験シナリオ",
  });
  expect(screen.getByText("問いとのつながり")).toBeInTheDocument();
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
    screen.getByRole("textbox", { name: "作るものを自由に指定" }),
    { target: { value: "授業シナリオ" } },
  );
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "制作プロンプトを作る" }),
    ).toBeEnabled(),
  );
});
