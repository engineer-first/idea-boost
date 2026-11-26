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

// UI components use the Japanese messages by default in unit tests.
// Individual tests can override these mocks when they need another locale.
const testMessages = { app: appMessages, landing: landingMessages };
vi.mock("next-intl", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next-intl")>();
  type TestTranslator = ((
    key: string,
    values?: Record<string, string | number>,
  ) => string) & {
    raw: (key: string) => unknown;
  };
  const translators = new Map<string, TestTranslator>();
  const resolveMessage = (namespace: string, key: string): unknown => {
    const value = namespace.split(".").reduce<unknown>((current, part) => {
      if (typeof current !== "object" || current === null) return undefined;
      return (current as Record<string, unknown>)[part];
    }, testMessages);
    return key.split(".").reduce<unknown>((current, part) => {
      if (typeof current !== "object" || current === null) return undefined;
      return (current as Record<string, unknown>)[part];
    }, value);
  };
  return {
    ...actual,
    useLocale: () => "ja",
    useTranslations: (namespace: string): TestTranslator => {
      const cached = translators.get(namespace);
      if (cached) return cached;
      const translate = ((
        key: string,
        values?: Record<string, string | number>,
      ) => {
        const message = resolveMessage(namespace, key);
        if (typeof message !== "string") return key;
        return Object.entries(values ?? {}).reduce(
          (text, [name, replacement]) =>
            text.replaceAll(`{${name}}`, String(replacement)),
          message,
        );
      }) as TestTranslator;
      translate.raw = (key) => resolveMessage(namespace, key);
      translators.set(namespace, translate);
      return translate;
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
