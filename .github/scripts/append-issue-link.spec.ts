import { describe, expect, it } from "vitest";
import {
  buildBodyWithIssueLink,
  extractIssueNumber,
} from "./append-issue-link.js";

describe("extractIssueNumber", () => {
  it("ブランチ名から issue 番号を抽出する", () => {
    expect(extractIssueNumber("feature/104-fix-save")).toBe("104");
  });

  it("既存の # 付きブランチ名も扱う", () => {
    expect(extractIssueNumber("feature/#22-title")).toBe("22");
  });

  it("ブランチ名の任意の位置にある番号は関連Issueと推測しない", () => {
    expect(extractIssueNumber("feature/issue-104")).toBeNull();
    expect(extractIssueNumber("codex/2026-09-documentation")).toBeNull();
    expect(extractIssueNumber("feature/2026-09-documentation")).toBeNull();
  });

  it("空のブランチ名では null を返す", () => {
    expect(extractIssueNumber("")).toBeNull();
  });
});

describe("buildBodyWithIssueLink", () => {
  it("現在の body に明示マーカーと非クローズ参照を追記する", () => {
    const result = buildBodyWithIssueLink("元のdescription", "104");
    expect(result).toBe("元のdescription\n\n<!-- issue-ref:104 -->\nRefs #104");
    expect(result).not.toContain("Closes #104");
  });

  it("PATCH直前に取得した最新の body を基準に追記する（stale な body には追記しない）", () => {
    const staleBody = "PR作成直後のbody";
    const liveBody = "PR作成者が書き直した最新のbody";

    const result = buildBodyWithIssueLink(liveBody, "104");

    expect(result).toContain(liveBody);
    expect(result).not.toContain(staleBody);
  });

  it("別のIssueマーカーが既に存在する場合も追記や置換をしない", () => {
    const body = "説明\n\n<!-- issue-ref:104 -->\nCloses #104";
    expect(buildBodyWithIssueLink(body, "104")).toBeNull();
    expect(buildBodyWithIssueLink("<!-- issue-ref:99 -->", "104")).toBeNull();
  });

  it("空文字の body は空文字として扱う", () => {
    const result = buildBodyWithIssueLink("", "104");
    expect(result).toBe("\n\n<!-- issue-ref:104 -->\nRefs #104");
  });

  it("null/undefined の body は空文字として扱う", () => {
    expect(buildBodyWithIssueLink(null, "104")).toBe(
      "\n\n<!-- issue-ref:104 -->\nRefs #104",
    );
    expect(buildBodyWithIssueLink(undefined, "104")).toBe(
      "\n\n<!-- issue-ref:104 -->\nRefs #104",
    );
  });

  it("Issue番号として扱えない値を追記しない", () => {
    expect(buildBodyWithIssueLink("説明", "12 #34")).toBeNull();
  });
});
