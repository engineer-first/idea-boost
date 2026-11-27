// @vitest-environment node
import { describe, expect, it } from "vitest";
import { nextDevEnv } from "./next-dev-site-url.mts";

const next = "node_modules/next/dist/bin/next";

describe("nextDevEnv", () => {
  it.each([
    ["指定なしは3000", [next, "dev"], {}, "3000"],
    ["--port 3001", [next, "dev", "--port", "3001"], {}, "3001"],
    ["--port=3002", [next, "dev", "--port=3002"], {}, "3002"],
    ["-p 3003", [next, "dev", "-p", "3003"], {}, "3003"],
    ["-p3004", [next, "dev", "-p3004"], {}, "3004"],
    ["PORT=3005", [next, "dev"], { PORT: "3005" }, "3005"],
    [
      "ディレクトリ指定と--port",
      [next, "dev", "./", "--port", "3008"],
      {},
      "3008",
    ],
    [
      "引数とPORTの両方は引数",
      [next, "dev", "-p", "3006"],
      { PORT: "3007" },
      "3006",
    ],
  ] as const)(
    "Next.js開発サーバーの%sで、PORTとSITE_URLを同じポートにする",
    (_name, args, env, port) => {
      expect(nextDevEnv([...args], env)).toEqual({
        PORT: port,
        NEXT_PUBLIC_SITE_URL: `http://localhost:${port}`,
      });
    },
  );

  it("--experimental-httpsで起動したらhttpsのURLにする", () => {
    expect(
      nextDevEnv([next, "dev", "--experimental-https", "-p", "3001"], {})
        .NEXT_PUBLIC_SITE_URL,
    ).toBe("https://localhost:3001");
  });

  it("環境ファイルやシェルのNEXT_PUBLIC_SITE_URLより起動ポートを優先する", () => {
    expect(
      nextDevEnv([next, "dev", "--port", "3001"], {
        NEXT_PUBLIC_SITE_URL: "http://localhost:3000",
      }).NEXT_PUBLIC_SITE_URL,
    ).toBe("http://localhost:3001");
  });

  it.each([
    ["Worker", ["node_modules/wrangler/bin/wrangler.js", "dev"]],
    ["検証起動", ["scripts/verification.mts"]],
    ["Next.jsの本番起動", [next, "start"]],
  ])("%sの起動では環境を変えない", (_name, args) => {
    expect(nextDevEnv(args, {})).toEqual({});
  });

  it.each([["0"], ["abc"], ["70000"]])("ポート%sは起動前に拒否する", (port) => {
    expect(() => nextDevEnv([next, "dev", "--port", port], {})).toThrow(
      "ポート",
    );
  });
});
