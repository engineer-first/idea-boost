import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import JapaneseOnlyLayout from "./layout";

it("翻訳していない画面は、文書の表示言語が英語でも日本語として読み上げる", () => {
  render(
    <JapaneseOnlyLayout>
      <main>保存とプライバシーについて</main>
    </JapaneseOnlyLayout>,
  );
  expect(screen.getByRole("main").closest("[lang]")).toHaveAttribute(
    "lang",
    "ja",
  );
});
