async function enableMocking() {
  if (process.env.NODE_ENV !== "development") return;
  if (process.env.NEXT_PUBLIC_USE_MSW !== "true") return;
  try {
    const { worker } = await import("./app/mocks/browser");
    await worker.start({
      onUnhandledFrame: "warn",
      quiet: true,
    });
  } catch (error) {
    console.error("[MSW] Failed to start the mock service worker:", error);
  }
}

void enableMocking();
