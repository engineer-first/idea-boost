import { HttpResponse, http } from "msw";
import { buildProgressHistoryRecord } from "@/contracts/progress-history.fixture";
import { buildSharedOutcome } from "@/contracts/shared-outcomes.fixture";

const outcome = buildSharedOutcome();
const record = buildProgressHistoryRecord();
export const sharedOutcomeHandlers = [
  http.get("/api/shared-outcomes", () =>
    HttpResponse.json({ outcomes: [outcome], nextCursor: null }),
  ),
  http.get("/api/shared-outcomes/:id/history/:recordId", ({ params }) =>
    params.id === outcome.roomId && params.recordId === record.id
      ? HttpResponse.json(record)
      : HttpResponse.json({ error: "not_found" }, { status: 404 }),
  ),
  http.get("/api/shared-outcomes/:id/history", ({ params }) => {
    if (params.id !== outcome.roomId)
      return HttpResponse.json({ error: "not_found" }, { status: 404 });
    const { snapshot: _snapshot, ...entry } = record;
    return HttpResponse.json({ entries: [entry], nextCursor: null });
  }),
  http.get("/api/shared-outcomes/:id", ({ params }) =>
    params.id === outcome.roomId
      ? HttpResponse.json(outcome)
      : HttpResponse.json({ error: "not_found" }, { status: 404 }),
  ),
];
