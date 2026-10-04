"use client";

// ホーム「ルームを作成」セクション（organism / コンテナ）。
// 作成成功時に toast を出してからスタート画面へ遷移する。
// 表示は CreateRoomSectionView に委譲する。
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { notify } from "@/lib/notify";
import { rememberLastRoom } from "@/lib/room-client/last-room-storage";
import { createRoom } from "../logic/actions";
import { lifecycleNotify } from "../logic/lifecycle-notify";
import { CreateRoomSectionView } from "../templates/create-room-section-view";

export function CreateRoomSection({
  currentUserId,
}: {
  currentUserId?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handleSubmit(name: string) {
    startTransition(async () => {
      const result = await createRoom(name);
      if (!result.ok) {
        notify.error(result.error);
        return;
      }
      if (currentUserId) rememberLastRoom(currentUserId, result.roomId);
      lifecycleNotify.roomCreated();
      router.push(`/rooms/${result.roomId}/start`);
    });
  }

  return <CreateRoomSectionView pending={pending} onSubmit={handleSubmit} />;
}
