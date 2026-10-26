import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";
import sharp from "sharp";

// 起動済みStorybookを使用する。サーバーを起動・放置しない。
const origin = process.env.STORYBOOK_TEST_URL ?? "http://127.0.0.1:6006";
const browser = await chromium.launch();
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
    deviceScaleFactor: 1,
    locale: "ja-JP",
    timezoneId: "Asia/Tokyo",
    colorScheme: "light",
    reducedMotion: "reduce",
  });
  await page.clock.setFixedTime(new Date("2026-10-26T00:00:00.000Z"));
  await page.goto(
    `${origin}/iframe.html?id=room-roomboardview--landing-preview&viewMode=story`,
  );
  await page
    .getByText("寝る準備を始める時刻に知らせる", { exact: true })
    .waitFor();
  // ブラウザ側で実行するコード。Node用tsconfigへDOM型を持ち込まない。
  await page.evaluate(`async () => {
    await document.fonts.ready;
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  }`);
  await mkdir("public/landing", { recursive: true });
  const png = await page.screenshot({
    animations: "disabled",
    clip: { x: 620, y: 140, width: 800, height: 550 },
  });
  const result = await sharp(png)
    .webp({ quality: 85 })
    .toFile("public/landing/board.webp");
  console.log(
    `public/landing/board.webp: ${result.width}×${result.height}, ${result.size} bytes`,
  );
} finally {
  await browser.close();
}
