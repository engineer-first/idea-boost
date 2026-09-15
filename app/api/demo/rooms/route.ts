import { createDemoRoom } from "@/features/demo";

export async function POST(request: Request): Promise<Response> {
  return createDemoRoom(request);
}
