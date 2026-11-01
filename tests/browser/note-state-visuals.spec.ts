import { chromium } from "playwright";
import { expect, test } from "vitest";

const origin = process.env.STORYBOOK_TEST_URL ?? "http://127.0.0.1:6006";
const expectedDecisionColors = {
  outline: "rgb(30, 142, 62)",
  stampBorder: "rgb(30, 142, 62)",
  stampText: "rgb(24, 128, 56)",
  stampInnerCircle: "rgb(24, 128, 56)",
};

test("決定の拡大とはんこの出入りでも外側の座標を保って紙面と中身を揃え、動きを省略できる", async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto(
      `${origin}/iframe.html?id=notes-notecard--result-with-decision&viewMode=story`,
    );
    const note = page.getByTestId("note-card");
    await note.waitFor();
    const measure = () =>
      note.evaluate((element) => {
        const paper = element.querySelector<HTMLElement>(
          '[data-slot="sticky-note-paper"]',
        );
        const stamp = element.querySelector<HTMLElement>(".sticky-note-stamp");
        const surface = element.querySelector<HTMLElement>(
          "[data-canvas-note-surface]",
        );
        if (!paper || !stamp || !surface)
          throw new Error("付箋の要素がありません");
        const rect = (e: Element) => {
          const r = e.getBoundingClientRect();
          return { x: r.x, y: r.y, width: r.width, height: r.height };
        };
        const content = element.querySelector(
          '[data-slot="sticky-note-content"]',
        );
        if (!content) throw new Error("中身がありません");
        const motion = (node: Element) => {
          const style = getComputedStyle(node);
          return {
            origin: style.transformOrigin,
            transform: style.transform,
            duration: style.transitionDuration,
            easing: style.transitionTimingFunction,
          };
        };
        return {
          stampLayerMotion: motion(stamp.parentElement as HTMLElement),
          stampLayer: rect(stamp.parentElement as HTMLElement),
          stampLayerOverflow: getComputedStyle(
            stamp.parentElement as HTMLElement,
          ).overflow,
          contentMotion: motion(content),
          paperMotion: motion(paper),
          note: rect(element),
          surface: rect(surface),
          paper: rect(paper),
          specifiedOutlineOffset: parseFloat(paper.style.outlineOffset),
          outlineOffset: parseFloat(getComputedStyle(paper).outlineOffset),
          visualOutlineOffset:
            (parseFloat(getComputedStyle(paper).outlineOffset) *
              paper.getBoundingClientRect().width) /
            paper.offsetWidth,
          decisionColors: {
            outline: getComputedStyle(paper).outlineColor,
            stampBorder: getComputedStyle(stamp).borderColor,
            stampText: getComputedStyle(stamp).color,
            stampInnerCircle: getComputedStyle(stamp, "::after").borderColor,
          },
          stamp: rect(stamp),
          transform: getComputedStyle(stamp).transform,
          opacity: getComputedStyle(stamp).opacity,
          transition: getComputedStyle(stamp).transitionDuration,
          overflow: getComputedStyle(element).overflow,
          contentOverflow: element.querySelector(
            '[data-slot="sticky-note-content"]',
          )
            ? getComputedStyle(
                element.querySelector(
                  '[data-slot="sticky-note-content"]',
                ) as Element,
              ).overflow
            : null,
          zIndex: getComputedStyle(element).zIndex,
        };
      });
    const decided = await measure();
    expect(decided.paper.width / decided.note.width).toBeCloseTo(1.1);
    expect.soft(decided.specifiedOutlineOffset).toBe(4);
    expect.soft(decided.outlineOffset).toBe(4);
    expect.soft(decided.visualOutlineOffset).toBeCloseTo(4.4);
    expect(decided.decisionColors).toEqual(expectedDecisionColors);
    expect(decided.surface).toEqual(decided.paper);
    expect(decided.contentMotion).toEqual(decided.paperMotion);
    expect(decided.stampLayerMotion).toEqual(decided.paperMotion);
    expect(decided.stampLayer).toEqual(decided.paper);
    expect(decided.stampLayerOverflow).toBe("visible");
    expect(decided.contentMotion.duration).toBe("0.28s, 0.28s, 0.2s");
    expect(decided.contentMotion.easing).toContain(
      "cubic-bezier(0.2, 0.8, 0.2, 1)",
    );
    expect(decided.stamp.y).toBeLessThan(decided.paper.y);
    expect(decided.overflow).toBe("visible");
    expect(decided.contentOverflow).toBe("hidden");
    expect(decided.zIndex).toBe("20");
    await note.evaluate((element) => {
      element.style.zIndex = "2147483647";
    });
    expect((await measure()).zIndex).toBe("2147483647");
    await note.evaluate((element) => {
      element.style.zIndex = "";
    });
    await note.evaluate((element) => element.removeAttribute("data-decided"));
    const exiting = await measure();
    // 解除時には拡大を始めず、0.15秒のフェード後にtransformをリセットする。
    expect(exiting.transform).toBe(decided.transform);
    await expect.poll(async () => (await measure()).opacity).toBe("0");
    expect((await measure()).note).toEqual(decided.note);
    const released = await measure();
    expect(released.surface).toEqual(released.paper);
    await note.evaluate((element) =>
      element.setAttribute("data-decided", "true"),
    );
    await expect.poll(async () => (await measure()).opacity).toBe("1");
    expect((await measure()).note).toEqual(decided.note);
    await page.emulateMedia({ reducedMotion: "reduce" });
    expect((await measure()).transition).toBe("0s");
    expect((await measure()).stampLayerMotion.duration).toBe("0s");
    expect(
      await note
        .locator('[data-slot="sticky-note-content"]')
        .evaluate((element) => getComputedStyle(element).transitionDuration),
    ).toBe("0s");
  } finally {
    await browser.close();
  }
});

test.each([
  "long-content",
  "maximum-length-at-24-px",
  "result-with-long-content",
  "result-with-many-votes",
])("%s の本文・結果を付箋内に収め、編集中も中身だけを切る", async (story) => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto(
      `${origin}/iframe.html?id=notes-notecard--${story}&viewMode=story&args=isSelected:true`,
    );
    const note = page.getByTestId("note-card");
    await note.waitFor();
    const check = async () => {
      const geometry = await note.evaluate((element) => {
        const content = element.querySelector(
          '[data-slot="sticky-note-content"]',
        );
        if (!content) throw new Error("中身の領域がありません");
        const bounds = element.getBoundingClientRect();
        return {
          overflow: getComputedStyle(content).overflow,
          contained: [
            ...content.querySelectorAll(
              'textarea,[data-testid="note-vote-results"]',
            ),
          ].every((child) => {
            const box = child.getBoundingClientRect();
            return (
              box.left >= bounds.left &&
              box.right <= bounds.right &&
              box.top >= bounds.top &&
              box.bottom <= bounds.bottom
            );
          }),
        };
      });
      expect(geometry).toEqual({ overflow: "hidden", contained: true });
    };
    await check();
    if (!story.startsWith("result")) {
      await note
        .getByRole("button", { name: "付箋", exact: true })
        .press("Enter");
      const textarea = note.getByRole("textbox");
      expect(await textarea.getAttribute("readonly")).toBeNull();
      await textarea.fill("長文の編集です。".repeat(250));
      await check();
    }
  } finally {
    await browser.close();
  }
});

test("決定付箋のシールを紙面の相対位置に保ち、拡大したtextareaへのクリック位置でカーソルと入力が合う", async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ reducedMotion: "reduce" });
    await page.goto(
      `${origin}/iframe.html?id=notes-notecard--decided-with-voting-stickers&viewMode=story`,
    );
    const note = page.getByTestId("note-card");
    await note.waitFor();
    const geometry = await note.evaluate((element) => {
      const paper = element.querySelector('[data-slot="sticky-note-paper"]');
      const content = element.querySelector(
        '[data-slot="sticky-note-content"]',
      );
      const sticker = element.querySelector("[data-vote-sticker-id]");
      if (!paper || !content || !sticker)
        throw new Error("付箋の構成要素がありません");
      const p = paper.getBoundingClientRect();
      const c = content.getBoundingClientRect();
      const v = sticker.getBoundingClientRect();
      return {
        aligned:
          p.x === c.x &&
          p.y === c.y &&
          p.width === c.width &&
          p.height === c.height,
        x: (v.x + v.width / 2 - p.x) / p.width,
        y: (v.y + v.height / 2 - p.y) / p.height,
      };
    });
    expect(geometry.aligned).toBe(true);
    expect(geometry.x).toBeCloseTo(0.25);
    expect(geometry.y).toBeCloseTo(0.75);
    const outerBefore = await note.boundingBox();
    await note.getByRole("button", { name: "付箋", exact: true }).click();
    const textarea = note.getByRole("textbox");
    expect(await textarea.getAttribute("readonly")).toBeNull();
    const caret = await textarea.evaluate((element) => {
      if (!(element instanceof HTMLTextAreaElement))
        throw new Error("textareaがありません");
      element.style.fontFamily = "monospace";
      const style = getComputedStyle(element);
      const box = element.getBoundingClientRect();
      const scale = box.width / element.offsetWidth;
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d");
      if (!context) throw new Error("文字幅を計測できません");
      context.font = `${style.fontSize} ${style.fontFamily}`;
      return {
        x:
          box.x +
          (parseFloat(style.paddingLeft) + context.measureText("ABCD").width) *
            scale,
        y:
          box.y +
          (parseFloat(style.paddingTop) + parseFloat(style.lineHeight) / 2) *
            scale,
      };
    });
    await page.mouse.click(caret.x, caret.y);
    expect(
      await textarea.evaluate((element) => {
        if (!(element instanceof HTMLTextAreaElement))
          throw new Error("textareaがありません");
        return element.selectionStart;
      }),
    ).toBe(4);
    await page.keyboard.insertText("X");
    expect(await textarea.inputValue()).toBe("ABCDXEFGH");
    expect(await note.boundingBox()).toEqual(outerBefore);
  } finally {
    await browser.close();
  }
});

test("決定はんこは本文・シールより前面で、中身と重なる部分も下の操作面へクリックを通す", async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ reducedMotion: "reduce" });
    await page.goto(
      `${origin}/iframe.html?id=notes-notecard--decided-with-voting-stickers&viewMode=story`,
    );
    const note = page.getByTestId("note-card");
    await note.waitFor();
    const stacking = await note.evaluate((element) => {
      const stamp = element.querySelector<HTMLElement>(".sticky-note-stamp");
      const content = element.querySelector(
        '[data-slot="sticky-note-content"]',
      );
      const sticker = element.querySelector<HTMLElement>(
        "[data-vote-sticker-id]",
      );
      if (!stamp || !content || !sticker)
        throw new Error("付箋の構成要素がありません");
      const bounds = content.getBoundingClientRect();
      const point = { x: bounds.right - 8, y: bounds.top + 8 };
      // pointer-eventsだけを一時的に戻して、描画順をhit testで観測する。
      const original = stamp.style.pointerEvents;
      const pointerEvents = getComputedStyle(stamp).pointerEvents;
      stamp.style.pointerEvents = "auto";
      const frontOfText = document.elementFromPoint(point.x, point.y) === stamp;
      // シールも同じ重なり位置へ移し、そのスタックコンテキストより前面かを確認する。
      const stickerStyle = sticker.getAttribute("style");
      sticker.style.left = "96%";
      sticker.style.top = "5%";
      const frontOfSticker =
        document.elementFromPoint(point.x, point.y) === stamp;
      if (stickerStyle === null) sticker.removeAttribute("style");
      else sticker.setAttribute("style", stickerStyle);
      stamp.style.pointerEvents = original;
      const hit = document.elementFromPoint(point.x, point.y);
      return {
        frontOfText,
        frontOfSticker,
        pointerEvents,
        passesThrough: hit?.hasAttribute("data-canvas-note-surface"),
        point,
      };
    });
    expect(stacking.frontOfText).toBe(true);
    expect(stacking.frontOfSticker).toBe(true);
    expect(stacking.pointerEvents).toBe("none");
    expect(stacking.passesThrough).toBe(true);
    await page.mouse.click(stacking.point.x, stacking.point.y);
    expect(await note.getByRole("textbox").getAttribute("readonly")).toBeNull();
    expect(
      await note
        .getByRole("status", { name: "取り組む課題に決定済み" })
        .isVisible(),
    ).toBe(true);
  } finally {
    await browser.close();
  }
});

test.each([320, 1280])(
  "%ipxの課題参照欄と問いポップオーバーで、決定枠とはんこを見切れず表示する",
  async (width) => {
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage({
        viewport: { width, height: 900 },
        reducedMotion: "reduce",
      });
      for (const [story, reference] of [
        ["hmw-writing", "issue"],
        ["after-writing", "hmw"],
      ] as const) {
        await page.goto(
          `${origin}/iframe.html?id=room-boardcontext--${story}&viewMode=story`,
        );
        const body = page.getByTestId(`board-reference-${reference}-content`);
        await body.waitFor();
        const note = page
          .locator('[data-slot="sticky-note"]')
          .filter({ has: body });
        await expect
          .poll(() =>
            note.evaluate((element) => {
              const stamp =
                element.querySelector<HTMLElement>(".sticky-note-stamp");
              const paper = element.querySelector(
                '[data-slot="sticky-note-paper"]',
              );
              const content = element.querySelector(
                '[data-slot="sticky-note-content"]',
              );
              const text = element.querySelector("section");
              if (!stamp || !paper || !content || !text)
                throw new Error("参照付箋がありません");
              const box = element.getBoundingClientRect();
              const s = stamp.getBoundingClientRect();
              const paperBox = paper.getBoundingClientRect();
              const paperStyle = getComputedStyle(paper);
              const outlineOffset = parseFloat(paperStyle.outlineOffset);
              const extent = Math.max(
                0,
                outlineOffset + parseFloat(paperStyle.outlineWidth),
              );
              const frame = {
                left: paperBox.left - extent,
                right: paperBox.right + extent,
                top: paperBox.top - extent,
                bottom: paperBox.bottom + extent,
              };
              let outlineUnclipped =
                frame.left >= 0 &&
                frame.right <= innerWidth &&
                frame.top >= 0 &&
                frame.bottom <= innerHeight;
              for (
                let parent = paper.parentElement;
                parent;
                parent = parent.parentElement
              ) {
                const style = getComputedStyle(parent);
                const clip = parent.getBoundingClientRect();
                if (
                  ["hidden", "clip", "auto", "scroll"].includes(style.overflowX)
                ) {
                  outlineUnclipped &&=
                    frame.left >=
                      clip.left + parseFloat(style.borderLeftWidth) - 0.1 &&
                    frame.right <=
                      clip.right - parseFloat(style.borderRightWidth) + 0.1;
                }
                if (
                  ["hidden", "clip", "auto", "scroll"].includes(style.overflowY)
                ) {
                  outlineUnclipped &&=
                    frame.top >=
                      clip.top + parseFloat(style.borderTopWidth) - 0.1 &&
                    frame.bottom <=
                      clip.bottom - parseFloat(style.borderBottomWidth) + 0.1;
                }
              }
              const overlaps = (r: DOMRect) =>
                Math.min(r.right, s.right) > Math.max(r.left, s.left) &&
                Math.min(r.bottom, s.bottom) > Math.max(r.top, s.top);
              return {
                decisionColors: {
                  outline: paperStyle.outlineColor,
                  stampBorder: getComputedStyle(stamp).borderColor,
                  stampText: getComputedStyle(stamp).color,
                  stampInnerCircle: getComputedStyle(stamp, "::after")
                    .borderColor,
                },
                outlineOffset,
                outlineUnclipped,
                size: stamp.offsetWidth,
                inside:
                  s.left >= box.left &&
                  s.right <= box.right &&
                  s.top >= box.top &&
                  s.bottom <= box.bottom,
                viewport:
                  s.left >= 0 &&
                  s.right <= innerWidth &&
                  s.top >= 0 &&
                  s.bottom <= innerHeight,
                unscaled:
                  Math.abs(paper.getBoundingClientRect().width - 200) < 0.1 &&
                  Math.abs(content.getBoundingClientRect().width - 200) < 0.1,
                overlapsBody: overlaps(text.getBoundingClientRect()),
                overlapsVotes: [
                  ...element.querySelectorAll('[role="img"]'),
                ].some((vote) => overlaps(vote.getBoundingClientRect())),
              };
            }),
          )
          .toEqual({
            decisionColors: expectedDecisionColors,
            outlineOffset: 4,
            outlineUnclipped: true,
            size: 44,
            inside: true,
            viewport: true,
            unscaled: true,
            overlapsBody: false,
            overlapsVotes: false,
          });
        expect(
          await note.getByRole("status", { name: "採用済み" }).count(),
        ).toBe(1);
        expect(
          await note
            .getByRole("status", { name: "取り組む課題に決定済み" })
            .count(),
        ).toBe(0);
      }
    } finally {
      await browser.close();
    }
  },
);
