// @vitest-environment node
import { expect, it } from "vitest";
import { GET } from "./route";

it("/llms.txt を UTF-8 のテキストで返す", async () => {
  const response = GET();
  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toBe(
    "text/plain; charset=utf-8",
  );
  expect(await response.text()).toMatch(/^# Idea Boost\n/);
});
