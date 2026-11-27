import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { JapaneseOnlyLayout } from "./japanese-only-layout";

it("翻訳していない画面は、文書の表示言語が英語でも日本語として読み上げる", () => {
  render(
    <JapaneseOnlyLayout>
      <main>過去の成果</main>
    </JapaneseOnlyLayout>,
  );
  expect(screen.getByRole("main").closest("[lang]")).toHaveAttribute(
    "lang",
    "ja",
  );
});
