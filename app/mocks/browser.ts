import { setupWorker } from "msw/browser";
import { handlers } from "./handlers";

export const worker = setupWorker(...handlers);

// MSW 3 は開始済みの worker.start() を拒否する。開始中の Promise も共有し、
// Storybook の story 遷移では handler のみ差し替える。
let startPromise: ReturnType<typeof worker.start> | undefined;

export function startMockWorker(
  options: Parameters<typeof worker.start>[0],
): ReturnType<typeof worker.start> {
  startPromise ??= worker.start(options).catch((error: unknown) => {
    startPromise = undefined;
    throw error;
  });
  return startPromise;
}
