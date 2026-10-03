import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";

const site = join(process.cwd(), "docs/site");
const pages = [
  "index.html",
  ...readdirSync(site, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => `${entry.name}/index.html`),
];
const sha = "7a81a177b80ee761d465fce54fe66b95aadbfbeb";
const repository = "https://github.com/engineer-first/idea-boost/";

function renderLinks(
  page: string,
  url: string,
): { before: string[]; after: string[] } {
  const dom = document.implementation.createHTMLDocument();
  dom.documentElement.innerHTML = readFileSync(join(site, page), "utf8");
  const links = (): string[] =>
    Array.from(
      dom.querySelectorAll<HTMLAnchorElement>("a[href]"),
      (link) => link.getAttribute("href") ?? "",
    );
  const before = links();
  for (const script of dom.querySelectorAll("script[data-preview-links]")) {
    runInNewContext(script.textContent ?? "", {
      document: dom,
      location: new URL(url),
      URL,
    });
  }
  return { before, after: links() };
}

describe.each(pages)("公開HTMLの文書リンク: %s", (page) => {
  it.each(["rawcdn.githack.com", "raw.githack.com"])(
    "%sのプレビューから同じコミットを開き、アンカーと他のリンクを保つ",
    (host) => {
      const { before, after } = renderLinks(
        page,
        `https://${host}/engineer-first/idea-boost/${sha}/docs/site/${page}`,
      );
      expect(
        before.some((link) => link.startsWith(`${repository}blob/develop/`)),
      ).toBe(true);
      expect(after).toEqual(
        before.map((link) =>
          link.replace(
            /^(https:\/\/github\.com\/engineer-first\/idea-boost\/(?:blob|tree)\/)develop\//,
            `$1${sha}/`,
          ),
        ),
      );
    },
  );

  it.each([
    "https://engineer-first.github.io/idea-boost/",
    "file:///tmp/idea-boost/docs/site/",
  ])("%sではdevelopの正本を開く", (base) => {
    const { before, after } = renderLinks(page, `${base}${page}`);
    expect(after).toEqual(before);
  });
});
