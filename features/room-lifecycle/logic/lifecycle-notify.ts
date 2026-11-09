// ルーム作成・参加フローの通知文言。sonner の toast を薄くラップし、
// この feature の通知文言をここで一元管理する（typo 防止と i18n 移行の足場）。
// 文言を持たない汎用エラー通知は @/lib/notify を使う。
"use client";

import { toast } from "sonner";

type Departure = { operationId: string; names: string[] };
const pending = new Map<string, Departure>();
const delivered = new Set<string>();
export const lifecycleNotify = {
  rememberDeparture(
    roomId: string,
    operationId: string | undefined,
    names: string[] = [],
  ): void {
    if (!operationId || !names.length) return;
    const departure = { operationId, names };
    pending.set(roomId, departure);
    try {
      sessionStorage.setItem(
        `room-departure:${roomId}`,
        JSON.stringify(departure),
      );
    } catch {
      /* 画面内の控えを使う。 */
    }
  },
  arrived(roomId: string): void {
    let departure = pending.get(roomId);
    try {
      const raw = sessionStorage.getItem(`room-departure:${roomId}`);
      if (raw) {
        const value: unknown = JSON.parse(raw);
        if (
          typeof value === "object" &&
          value !== null &&
          "operationId" in value &&
          typeof value.operationId === "string" &&
          "names" in value &&
          Array.isArray(value.names) &&
          value.names.every((name) => typeof name === "string")
        )
          departure = { operationId: value.operationId, names: value.names };
      }
      sessionStorage.removeItem(`room-departure:${roomId}`);
    } catch {
      /* 画面内の控えを使う。 */
    }
    pending.delete(roomId);
    if (!departure?.names.length || delivered.has(departure.operationId))
      return;
    try {
      if (
        sessionStorage.getItem(`room-departure-shown:${departure.operationId}`)
      )
        return;
      sessionStorage.setItem(
        `room-departure-shown:${departure.operationId}`,
        "1",
      );
    } catch {
      /* 同じ画面内では重複させない。 */
    }
    delivered.add(departure.operationId);
    const [first, ...rest] = departure.names;
    toast.success(
      `${first}${rest.length ? `ほか${rest.length}件` : ""}から退出しました`,
    );
  },
  roomCreated(): void {
    toast.success("ルームを作成しました");
  },
  joinedAsGuest(): void {
    toast.success("ルームに参加しました");
  },
};
