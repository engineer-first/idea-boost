// 解説ページ（/guides）は、利用者が実際に探す言葉で見つかり、AI が引用できる形にする。
import { describe, expect, it } from "vitest";
import { GUIDE_RESERVED_IDS, GUIDES, getGuide } from "./guide-content";

it("slug は重複せず、URL に使える文字だけにする", () => {
  const slugs = GUIDES.map((guide) => guide.slug);
  expect(new Set(slugs).size).toBe(slugs.length);
  for (const slug of slugs) expect(slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
});

it("知らない slug には解説ページを返さない", () => {
  expect(getGuide("no-such-guide")).toBeUndefined();
});

describe.each(GUIDES.map((guide) => [guide.slug, guide] as const))(
  "%s",
  (_slug, guide) => {
    it("狙う検索語の各語を title と説明文に入れ、検索結果で省かれない長さにする", () => {
      const [primary] = guide.keywords;
      for (const word of primary.split(" ")) {
        expect(guide.title).toContain(word);
        expect(guide.description).toContain(word);
      }
      expect(guide.title).toContain("Idea Boost");
      expect(guide.title.length).toBeLessThanOrEqual(45);
      expect(guide.description.length).toBeLessThanOrEqual(140);
    });

    it("冒頭の要約で問いに答え、見出しの id はページ内で重複しない", () => {
      expect(guide.summary.length).toBeGreaterThan(40);
      const ids = guide.sections.map((section) => section.id);
      expect(new Set(ids).size).toBe(ids.length);
      for (const id of ids) expect(GUIDE_RESERVED_IDS).not.toContain(id);
    });

    it("よくある質問と、https の出典を持つ", () => {
      expect(guide.faq.length).toBeGreaterThan(0);
      expect(guide.sources.length).toBeGreaterThan(0);
      for (const source of guide.sources)
        expect(source.url).toMatch(/^https:\/\//);
    });

    it("関連する解説は、存在する別の解説だけを指す", () => {
      for (const slug of guide.related) {
        expect(slug).not.toBe(guide.slug);
        expect(getGuide(slug)).toBeDefined();
      }
    });
  },
);
