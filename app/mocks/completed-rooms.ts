import { HttpResponse, http } from "msw";
import { CompletedSceneKindSchema } from "@/contracts/completed-rooms";
import {
  completedRoomFixture,
  completedSceneBoardFixture,
} from "@/contracts/completed-rooms.fixture";

const room = completedRoomFixture();
export const completedRoomHandlers = [
  http.get("/api/completed-rooms", () =>
    HttpResponse.json({ rooms: [room], nextCursor: null }),
  ),
  http.get("/api/completed-rooms/:id", ({ params }) =>
    params.id === room.roomId
      ? HttpResponse.json(room)
      : HttpResponse.json({ error: "not_found" }, { status: 404 }),
  ),
  http.get("/api/completed-rooms/:id/scenes/:kind", ({ params }) => {
    const parsed = CompletedSceneKindSchema.safeParse(params.kind);
    if (params.id !== room.roomId || !parsed.success)
      return HttpResponse.json({ error: "not_found" }, { status: 404 });
    return HttpResponse.json({
      scene: room.scenes.find((scene) => scene.kind === parsed.data),
      board: completedSceneBoardFixture(parsed.data),
    });
  }),
];
