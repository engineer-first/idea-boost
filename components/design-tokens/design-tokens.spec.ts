import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { readDesignTokens } from "./design-tokens";

const tokensCss = `:root {
  --ib-color-primary: #035ede;
  --ib-color-surface: #ffffff;
  --ib-color-accent: #ffcf4a;
  --ib-spacing-sm: 8px;
  --ib-rounded-lg: 12px;
}`;

const globalsCss = `@theme inline {
  --color-background: var(--background);
  --color-card: var(--card);
  --color-primary: var(--primary);
  --color-ring: var(--ring);
  --radius-lg: var(--ib-rounded-lg);
}
:root {
  --background: var(--ib-color-surface);
  --card: var(--ib-color-surface);
  --primary: var(--ib-color-primary);
  --ring: var(--ib-color-primary);
}`;

describe("readDesignTokens", () => {
  it("色ごとに値・CSS変数・Tailwindで使える名前を、DESIGN.mdの順で返す", () => {
    expect(readDesignTokens(tokensCss, globalsCss).colors).toEqual([
      {
        name: "primary",
        value: "#035ede",
        cssVar: "--ib-color-primary",
        tailwind: ["primary", "ring"],
      },
      {
        name: "surface",
        value: "#ffffff",
        cssVar: "--ib-color-surface",
        tailwind: ["background", "card"],
      },
      {
        name: "accent",
        value: "#ffcf4a",
        cssVar: "--ib-color-accent",
        tailwind: [],
      },
    ]);
  });

  it("角丸はTailwindの rounded の名前、余白はCSS変数だけを対応づける", () => {
    const tokens = readDesignTokens(tokensCss, globalsCss);
    expect(tokens.rounded).toEqual([
      {
        name: "lg",
        value: "12px",
        cssVar: "--ib-rounded-lg",
        tailwind: ["lg"],
      },
    ]);
    expect(tokens.spacing).toEqual([
      { name: "sm", value: "8px", cssVar: "--ib-spacing-sm", tailwind: [] },
    ]);
  });

  it("リポジトリの design-tokens.css と globals.css から状態色のTailwind名を読める", () => {
    const tokens = readDesignTokens(
      readFileSync("app/design-tokens.css", "utf8"),
      readFileSync("app/globals.css", "utf8"),
    );
    expect(
      tokens.colors.find((color) => color.name === "state-decided-text"),
    ).toMatchObject({ tailwind: ["state-decided-text"] });
  });
});
