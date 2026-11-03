import { describe, expect, it } from "vitest";
import { cn } from "./utils";

describe("cn", () => {
  it.each([
    ["shadow-tool", "shadow-none"],
    ["shadow-none", "shadow-tool"],
    ["rounded-note", "rounded-none"],
    ["rounded-none", "rounded-note"],
  ])("%s を後指定の %s で上書きする", (base, override) => {
    expect(cn(base, override)).toBe(override);
  });

  it("浮遊影を消しても状態リングと異なる条件の影を残す", () => {
    expect(cn("shadow-tool ring-2 hover:shadow-tool", "shadow-none")).toBe(
      "ring-2 hover:shadow-tool shadow-none",
    );
  });
});
