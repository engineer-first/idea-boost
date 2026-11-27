import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, expect } from "vitest";
import { server } from "./app/mocks/node";

declare module "vitest" {
  // 型引数はvitestの宣言と同じ形にそろえる（そろえないと宣言を合成できない）。
  interface Matchers<
    R extends void | Promise<void> = void | Promise<void>,
    T = unknown,
  > {
    /**
     * 要素のinline styleに書かれた値そのものを確かめる。
     * `toHaveStyle` はcomputed styleを見るため、`var()` を含む式は解決後の値になり、
     * 文書から外れた要素では空になる。Reactが渡した式を確かめるときはこちらを使う。
     */
    toHaveInlineStyle(styles: Record<string, string>): R;
  }
}

const toCssProperty = (name: string) =>
  name.startsWith("--")
    ? name
    : name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);

expect.extend({
  toHaveInlineStyle(received: unknown, styles: Record<string, string>) {
    if (!(received instanceof HTMLElement || received instanceof SVGElement)) {
      return {
        pass: false,
        message: () => "toHaveInlineStyle には要素を渡してください",
      };
    }
    // 期待値も同じCSS実装に通し、キーワードの順序などの書き方の差を吸収する。
    const normalizer = document.createElement("div");
    const expected: Record<string, string> = {};
    const actual: Record<string, string> = {};
    for (const [name, value] of Object.entries(styles)) {
      const property = toCssProperty(name);
      normalizer.style.setProperty(property, value);
      expected[property] = normalizer.style.getPropertyValue(property);
      actual[property] = received.style.getPropertyValue(property);
    }
    return {
      pass: this.equals(actual, expected),
      message: () =>
        `inline style が${this.isNot ? "一致しています" : "一致しません"}`,
      actual,
      expected,
    };
  },
});

beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
afterEach(() => server.resetHandlers());
// globals:trueを使わない構成のため、Testing Libraryのレンダリング結果を
// 各テスト後に明示的に破棄する。省略すると同一ファイル内の後続テストで
// 前のテストのDOMが残り、getByRole等が複数要素にヒットして失敗する。
afterEach(() => cleanup());
afterAll(() => server.close());
