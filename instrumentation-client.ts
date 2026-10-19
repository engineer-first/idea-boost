async function enableMocking() {
  if (process.env.NODE_ENV !== "development") return;
  if (process.env.NEXT_PUBLIC_USE_MSW !== "true") return;
  try {
    const { startMockWorker } = await import("./app/mocks/browser");
    await startMockWorker({
      onUnhandledFrame: "warn",
      quiet: true,
    });
  } catch (error) {
    console.error("[MSW] Failed to start the mock service worker:", error);
  }
}

void enableMocking();
