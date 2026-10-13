import { afterEach, expect, it, vi } from "vitest";
import { getRequestBaseUrl } from "./request-base-url";

vi.mock("next/headers", () => ({
  headers: async () =>
    new Headers({
      "X-Idea-Boost-Preview-Origin": "https://pr-123.example.test",
    }),
}));
afterEach(() => vi.unstubAllEnvs());
it("本番ではリクエストヘッダーから招待先を変えない", async () => {
  vi.stubEnv("PREVIEW_ENABLED", undefined);
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://ideaboost.dev");
  expect(await getRequestBaseUrl()).toBe("https://ideaboost.dev");
});
it("Previewでは本人が開いているPRのoriginに招待URLを固定する", async () => {
  vi.stubEnv("PREVIEW_ENABLED", "true");
  expect(await getRequestBaseUrl()).toBe("https://pr-123.example.test");
});
