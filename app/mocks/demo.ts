import { HttpResponse, http } from "msw";
import type { DemoStatus } from "@/contracts/demo";
import { buildDemoStatus } from "@/contracts/demo.fixture";

export const DEMO_MOCK_ROOM_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

export function demoHandlers(
  options: {
    status?: DemoStatus;
    failAction?: boolean;
    failCreate?: boolean;
    onStatus?: () => void;
    onAction?: (body: unknown) => void;
    onCreate?: (body: unknown) => void;
  } = {},
) {
  return [
    http.get("*/api/demo/rooms/:id", () => {
      options.onStatus?.();
      return HttpResponse.json(options.status ?? buildDemoStatus());
    }),
    http.post("*/api/demo/rooms/:id/actions", async ({ request }) => {
      options.onAction?.(await request.json());
      return options.failAction
        ? HttpResponse.json({ error: "操作に失敗しました。" }, { status: 503 })
        : HttpResponse.json(
            buildDemoStatus({ sharedCount: 4, availableActions: [] }),
          );
    }),
    http.post("*/api/demo/rooms", async ({ request }) => {
      options.onCreate?.(await request.json());
      return options.failCreate
        ? HttpResponse.json({ error: "作成に失敗しました。" }, { status: 503 })
        : HttpResponse.json({
            roomId: DEMO_MOCK_ROOM_ID,
            inviteCode: "ABC123",
          });
    }),
  ];
}
