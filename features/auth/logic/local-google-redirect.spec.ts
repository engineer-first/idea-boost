import { describe, expect, it } from "vitest";
import { describeLocalGoogleRedirectIssue } from "./local-google-redirect";

describe("describeLocalGoogleRedirectIssue", () => {
  it.each(["3000", "3009"])(
    "localhost:%sで開いてSITE_URLも同じなら止めない",
    (port) => {
      expect(
        describeLocalGoogleRedirectIssue(
          `http://localhost:${port}`,
          `localhost:${port}`,
        ),
      ).toBeNull();
    },
  );

  it.each(["2999", "3010", "3147"])(
    "ポート%sは登録範囲外として、範囲と起動し直す方法を返す",
    (port) => {
      const issue = describeLocalGoogleRedirectIssue(
        `http://localhost:${port}`,
        `localhost:${port}`,
      );
      expect(issue).toContain("3000〜3009");
      expect(issue).toContain(`http://localhost:${port}`);
      expect(issue).toContain("npm run dev -- --port");
    },
  );

  it("SITE_URLのポートと開いているポートが違えば、戻り先が別worktreeになると返す", () => {
    const issue = describeLocalGoogleRedirectIssue(
      "http://localhost:3000",
      "localhost:3001",
    );
    expect(issue).toContain("http://localhost:3000");
    expect(issue).toContain("localhost:3001");
    expect(issue).toContain("worktree");
  });

  it("127.0.0.1で開くとCookieがlocalhostへ戻らないため、localhostで開き直すよう返す", () => {
    expect(
      describeLocalGoogleRedirectIssue(
        "http://localhost:3000",
        "127.0.0.1:3000",
      ),
    ).toContain("http://localhost:3000");
  });

  it("localhost以外のSITE_URLは対象にしない", () => {
    expect(
      describeLocalGoogleRedirectIssue(
        "https://ideaboost.dev",
        "ideaboost.dev",
      ),
    ).toBeNull();
  });
});
