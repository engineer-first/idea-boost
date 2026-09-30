import type { FeedbackRecord } from "./feedback";
export function buildFeedback(
  overrides: Partial<FeedbackRecord> = {},
): FeedbackRecord {
  return {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    roomId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    target: "app",
    kind: "good",
    body: "順番が分かって取り組みやすかったです。",
    rating: 4,
    createdAt: Date.UTC(2026, 9, 2, 2),
    expiresAt: Date.UTC(2026, 10, 1, 2),
    ...overrides,
  };
}
