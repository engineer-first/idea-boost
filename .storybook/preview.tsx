import type { Preview } from "@storybook/nextjs-vite";
import "../app/globals.css";

const preview: Preview = {
  parameters: {
    nextjs: { appDirectory: true },
  },
  async beforeAll() {
    if (typeof window === "undefined") return;
    if (import.meta.env.NEXT_PUBLIC_USE_MSW !== "true") return;
    try {
      const { worker } = await import("../app/mocks/browser");
      await worker.start({
        onUnhandledRequest: "warn",
        quiet: true,
        waitUntilReady: true,
      });
    } catch (error) {
      console.error("[MSW] Failed to start the mock service worker:", error);
    }
  },
};

export default preview;
