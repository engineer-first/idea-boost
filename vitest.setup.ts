import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, vi } from "vitest";
import { server } from "./app/mocks/node";
import appMessages from "./messages/ja/app.json";
import landingMessages from "./messages/ja/landing.json";

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
