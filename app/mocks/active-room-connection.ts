import { HttpResponse, http } from "msw";

// 作業中のルームは完了詳細が未作成でも、現在ルームの認可は成功する。
export const activeRoomConnectionHandlers = [
  http.get(
    "/api/completed-rooms/:id",
    () => new HttpResponse(null, { status: 404 }),
  ),
  http.get("/api/rooms/:id", () => new HttpResponse(null, { status: 200 })),
];
