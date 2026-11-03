import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { parse } from "yaml";

it("ヒーロー見出しは共通フォントを継承し、800の太さで表示する", () => {
  const css = readFileSync(
    "features/landing/molecules/landing.module.css",
    "utf8",
  );
  const declarations = css.match(/\.heroHeading\s*\{([^}]+)\}/)?.[1];
  expect(declarations).toBeDefined();
  const style = document.createElement("h1").style;
  style.cssText = declarations ?? "";
  expect(style.fontWeight).toBe("800");
  expect(style.fontFamily).toBe("");
});

it("ヒーロー見出しの正本はNoto Sans JP 800を指定する", () => {
  const yaml = readFileSync("DESIGN.md", "utf8").split("---")[1];
  const design = parse(yaml);
  expect(design.typography["headline-display"]).toMatchObject({
    fontFamily: "Noto Sans JP",
    fontWeight: 800,
  });
});
