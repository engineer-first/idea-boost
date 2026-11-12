import type { Preview } from "@storybook/nextjs-vite";
import { Geist_Mono, Noto_Sans_JP } from "next/font/google";
import "../app/globals.css";

const notoSans = Noto_Sans_JP({
  variable: "--font-noto-sans-jp",
  display: "swap",
  preload: false,
});
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  preload: false,
});

const preview: Preview = {
  parameters: {
    nextjs: { appDirectory: true },
  },
  async beforeEach({ parameters }) {
    if (parameters.outcomeReflection) {
      const { worker, startMockWorker } = await import("../app/mocks/browser");
      const { createOutcomeReflectionHandlers } = await import(
        "../app/mocks/outcome-reflection"
      );
      await startMockWorker({ onUnhandledFrame: "bypass", quiet: true });
      worker.use(...createOutcomeReflectionHandlers());
      return () => worker.resetHandlers();
    }
    if (!parameters.activeRoomConnection) return;
    const { worker, startMockWorker } = await import("../app/mocks/browser");
    const { activeRoomConnectionHandlers } = await import(
      "../app/mocks/active-room-connection"
    );
    await startMockWorker({ onUnhandledFrame: "bypass", quiet: true });
    worker.use(...activeRoomConnectionHandlers);
    return () => worker.resetHandlers();
  },
  async beforeAll() {
    if (typeof window === "undefined") return;
    // Portalも同じフォントを継承し、各storyの高さや配置は変えない。
    document.documentElement.classList.add(
      notoSans.variable,
      geistMono.variable,
    );
    if (import.meta.env.NEXT_PUBLIC_USE_MSW !== "true") return;
    try {
      const { startMockWorker } = await import("../app/mocks/browser");
      await startMockWorker({
        onUnhandledFrame: "warn",
        quiet: true,
      });
    } catch (error) {
      console.error("[MSW] Failed to start the mock service worker:", error);
    }
  },
};

export default preview;
