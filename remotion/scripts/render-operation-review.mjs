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
      180, 600, 1080, 1500, 2040, 2460, 2940, 3420, 3840, 4200, 4680, 5160,
      5700, 6240, 6660, 7080, 7740,
    ];
const outDir = path.resolve("remotion/out/operation-review");
mkdirSync(outDir, { recursive: true });
const serveUrl = await bundle({
  entryPoint: path.resolve("remotion/src/index.ts"),
  outDir: path.resolve("remotion/out/operation-bundle"),
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
    id: "IdeaFlowOperationDemo",
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
