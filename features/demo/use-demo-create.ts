"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import {
  type DemoCheckpoint,
  DemoCreateResponseSchema,
} from "@/contracts/demo";
import { DEMO_REQUEST_ERROR, demoRequest } from "./demo-client";

export function useDemoCreate() {
  const router = useRouter();
  const locked = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function create(checkpoint: DemoCheckpoint): Promise<void> {
    if (locked.current) return;
    locked.current = true;
    setPending(true);
    setError(null);
    try {
      const room = await demoRequest(
        "/api/demo/rooms",
        DemoCreateResponseSchema,
        { checkpoint },
      );
      router.push(`/rooms/${room.roomId}`);
    } catch {
      setError(DEMO_REQUEST_ERROR);
      locked.current = false;
      setPending(false);
    }
  }
  return { create, pending, error, clearError: () => setError(null) };
}
