import { mkdirSync } from "node:fs";
import path from "node:path";
import { bundle } from "@remotion/bundler";
import {
  openBrowser,
  renderStill,
  selectComposition,
} from "@remotion/renderer";
import { enableTailwind } from "@remotion/tailwind-v4";

const frames = process.argv.slice(2).map(Number);
const selectedFrames = frames.length
  ? frames
  : [
      90, 212, 272, 332, 392, 500, 579, 650, 800, 995, 1140, 1200, 1310, 1470,
      1700, 1765, 1950, 2020, 2120, 2240, 2440,
    ];
const outDir = path.resolve("remotion/out/review");
mkdirSync(outDir, { recursive: true });
const serveUrl = await bundle({
  entryPoint: path.resolve("remotion/src/index.ts"),
  outDir: path.resolve("remotion/out/bundle"),
  webpackOverride: (current) => {
    const config = enableTailwind(current);
    return {
      ...config,
      resolve: {
        ...config.resolve,
        alias: { ...config.resolve?.alias, "@": process.cwd() },
      },
    };
  },
});
const browser = await openBrowser("chrome", {
  browserExecutable: process.env.REMOTION_BROWSER_EXECUTABLE,
});
try {
  const composition = await selectComposition({
    serveUrl,
    id: "IdeaBoostLaunch",
    puppeteerInstance: browser,
  });
  for (const frame of selectedFrames) {
    await renderStill({
      serveUrl,
      composition,
      frame,
      output: path.join(outDir, `${String(frame).padStart(4, "0")}.png`),
      scale: 0.5,
      puppeteerInstance: browser,
      logLevel: "error",
    });
    console.log(`Frame ${frame} / ${(frame / 60).toFixed(2)}s`);
  }
} finally {
  await browser.close({ silent: true });
}
