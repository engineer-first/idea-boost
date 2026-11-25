import { proxyCompletedRooms } from "../completed-rooms/proxy";

// 本人が最近参加したルーム。認証確認とWorkerへの転送は完了ルームの一覧と同じ経路を使う。
export async function GET(): Promise<Response> {
  return proxyCompletedRooms("/api/recent-rooms");
}
