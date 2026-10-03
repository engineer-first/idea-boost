import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterAll, afterEach, beforeAll } from "vitest";
import { server } from "./app/mocks/node";

beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
afterEach(() => server.resetHandlers());
// globals:trueを使わない構成のため、Testing Libraryのレンダリング結果を
// 各テスト後に明示的に破棄する。省略すると同一ファイル内の後続テストで
// 前のテストのDOMが残り、getByRole等が複数要素にヒットして失敗する。
afterEach(() => cleanup());
afterAll(() => server.close());
