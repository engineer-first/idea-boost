import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, expect, vi } from "vitest";
import { server } from "./app/mocks/node";
import appMessages from "./messages/ja/app.json";
import landingMessages from "./messages/ja/landing.json";

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
      // .not でも黙って通さないよう、結果を返さずに落とす。
      throw new TypeError("toHaveInlineStyle には要素を渡してください");
    }
    // 期待値も同じCSS実装に通し、キーワードの順序などの書き方の差を吸収する。
    const normalizer = document.createElement("div");
    const expected: Record<string, string> = {};
    const actual: Record<string, string> = {};
    for (const [name, value] of Object.entries(styles)) {
      const property = toCssProperty(name);
      normalizer.style.setProperty(property, value);
      expected[property] = normalizer.style.getPropertyValue(property);
      // 解釈できない期待値は空になり、未設定の要素と空どうしで一致してしまう。
      if (value !== "" && expected[property] === "")
        throw new TypeError(
          `toHaveInlineStyle: ${property} の期待値 "${value}" をCSSとして解釈できません`,
        );
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

// 単体テストの画面は日本語で描く。本番と同じ next-intl の翻訳処理を通すので、
// 辞書に無いキーや書式の誤りはテストで分かる。別の言語が要るテストは個別に差し替える。
const testMessages = { app: appMessages, landing: landingMessages };
vi.mock("next-intl", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next-intl")>();
  // フックの依存配列に入れても再実行が続かないよう、名前空間ごとに同じ関数を返す。
  const translators = new Map<string, unknown>();
  return {
    ...actual,
    useLocale: () => "ja",
    useTranslations: (namespace?: string) => {
      const key = namespace ?? "";
      const cached = translators.get(key);
      if (cached) return cached;
      const translator = actual.createTranslator({
        locale: "ja",
        messages: testMessages,
        namespace: namespace as never,
        onError: (error) => {
          throw error;
        },
      });
      translators.set(key, translator);
      return translator;
    },
  };
});
vi.mock("next-intl/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next-intl/server")>();
  return {
    ...actual,
    getLocale: async () => "ja",
    getMessages: async () => testMessages,
  };
});
