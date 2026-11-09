import { describe, expect, it } from "vitest";
import { AccountLinkResultSchema } from "@/contracts/account-link";
import {
  getAccountLinkResultMessage,
  parseAccountLinkResult,
} from "./account-link-copy";

describe("連携結果の表示入力", () => {
  it.each(AccountLinkResultSchema.options)(
    "%sを解析し固定の文言へ変換する",
    (value) => {
      expect(parseAccountLinkResult(value)).toBe(value);
      expect(getAccountLinkResultMessage(value)).toEqual(expect.any(String));
    },
  );
  it.each([
    undefined,
    null,
    "",
    "<script>外部入力</script>",
    "unknown",
    ["linked"],
    { result: "linked" },
    1,
  ])("不正値%jを表示結果として受理しない", (value) => {
    expect(parseAccountLinkResult(value)).toBeUndefined();
  });
});
