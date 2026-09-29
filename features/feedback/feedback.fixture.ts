import type { FeedbackControls } from "./use-feedback";
export function buildFeedbackControls(
  overrides: Partial<FeedbackControls> = {},
): FeedbackControls {
  return {
    draft: { target: "app", kind: "good", body: "", rating: 4 },
    isOpen: true,
    pending: false,
    retryWithNewId: false,
    error: null,
    receipt: null,
    promptVisible: false,
    open: () => {},
    close: () => {},
    change: () => {},
    send: async () => {},
    schedulePrompt: () => {},
    cancelPrompt: () => {},
    dismissPrompt: () => {},
    ...overrides,
  };
}
