// @vitest-environment node
import { expect, it } from "vitest";
import nextConfig from "../next.config";

it("共有エージェント指示を開発サーバーの起動で自動変更しない", () => {
  expect(nextConfig.agentRules).toBe(false);
});
