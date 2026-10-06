import { z } from "zod";
import {
  CreationRequestIdSchema,
  ROOM_CREATION_NAME_MAX,
} from "@/contracts/room-creation";

export const ROOM_CREATION_STORAGE_PREFIX = "idea-boost:room-creation:";
export const ROOM_CREATION_DB = "idea-boost-room-creations";
const IntentSchema = z.object({
  expectedPrincipal: z.string().uuid(),
  requestId: CreationRequestIdSchema,
  name: z.string().trim().max(ROOM_CREATION_NAME_MAX),
  issuedAt: z.number().int(),
  expiresAt: z.number().int(),
  state: z.enum([
    "prepared",
    "submitted",
    "known",
    "expired",
    "closed",
    "actor_mismatch",
    "conflict",
  ]),
  roomId: z.string().uuid().optional(),
  generation: z.string(),
});
export type RoomCreationIntent = z.infer<typeof IntentSchema>;
function key(userId: string, id: string): string {
  return `${userId}:${id}`;
}
function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(ROOM_CREATION_DB, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore("intents");
      request.result.createObjectStore("active");
    };
    request.onerror = () => reject(request.error);
    request.onblocked = () =>
      reject(new Error("別タブの保存処理を閉じて再読み込みしてください。"));
    request.onsuccess = () => {
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
  });
}
// request.successではなくtransaction.completeまで待つ。ネットワークはこの外。
async function transaction<T>(
  mode: IDBTransactionMode,
  run: (tx: IDBTransaction, set: (result: T) => void) => void,
): Promise<T> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(["intents", "active"], mode);
    let result: T;
    tx.oncomplete = () => {
      db.close();
      resolve(result);
    };
    tx.onabort = () => {
      db.close();
      reject(tx.error ?? new Error("作成要求の保存を中止しました。"));
    };
    tx.onerror = () => {};
    try {
      run(tx, (value) => {
        result = value;
      });
    } catch (error) {
      tx.abort();
      db.close();
      reject(error);
    }
  });
}
function readIntent(value: unknown, userId: string): RoomCreationIntent | null {
  if (value === undefined) return null;
  const parsed = IntentSchema.parse(value);
  if (parsed.expectedPrincipal !== userId)
    throw new Error("作成要求の利用者が一致しません。");
  return parsed;
}
function guarded(tx: IDBTransaction, fn: () => void): void {
  try {
    fn();
  } catch {
    tx.abort();
  }
}
export async function readRoomCreationIntent(
  userId: string,
): Promise<RoomCreationIntent | null> {
  await importLegacyIntent(userId);
  return transaction("readonly", (tx, set) => {
    const pointer = tx.objectStore("active").get(userId);
    pointer.onsuccess = () => {
      if (!pointer.result) {
        set(null);
        return;
      }
      const record = tx.objectStore("intents").get(key(userId, pointer.result));
      record.onsuccess = () =>
        guarded(tx, () => {
          const value = readIntent(record.result, userId);
          if (!value) throw new Error("控えがありません。");
          set(value);
        });
    };
  });
}
export function listRoomCreationIntents(
  userId: string,
): Promise<RoomCreationIntent[]> {
  return transaction("readonly", (tx, set) => {
    const records = tx
      .objectStore("intents")
      .getAll(IDBKeyRange.bound(`${userId}:`, `${userId}:\uffff`));
    records.onsuccess = () =>
      guarded(tx, () =>
        set(
          records.result
            .map((v) => readIntent(v, userId))
            .filter((v): v is RoomCreationIntent => v !== null)
            .sort((a, b) => b.issuedAt - a.issuedAt),
        ),
      );
  });
}
export function saveRoomCreationIntent(
  userId: string,
  intent: RoomCreationIntent,
  expectedActive: string | null = null,
): Promise<RoomCreationIntent> {
  const parsed = IntentSchema.parse(intent);
  if (parsed.expectedPrincipal !== userId)
    throw new Error("利用者が一致しません。");
  return transaction("readwrite", (tx, set) => {
    const active = tx.objectStore("active").get(userId);
    active.onsuccess = () => {
      if ((active.result ?? null) !== expectedActive) {
        if (!active.result) {
          tx.abort();
          return;
        }
        const winner = tx
          .objectStore("intents")
          .get(key(userId, active.result));
        winner.onsuccess = () =>
          guarded(tx, () => {
            const value = readIntent(winner.result, userId);
            if (!value) throw new Error();
            set(value);
          });
        return;
      }
      tx.objectStore("intents").add(parsed, key(userId, parsed.requestId));
      tx.objectStore("active").put(parsed.requestId, userId);
      set(parsed);
    };
  });
}
export function selectRoomCreationIntent(
  userId: string,
  requestId: string,
): Promise<void> {
  return transaction("readwrite", (tx, set) => {
    const record = tx.objectStore("intents").get(key(userId, requestId));
    record.onsuccess = () =>
      guarded(tx, () => {
        if (!readIntent(record.result, userId)) throw new Error();
        tx.objectStore("active").put(requestId, userId);
        set(undefined);
      });
  });
}
export function clearRoomCreationIntent(
  userId: string,
  expectedId?: string,
): Promise<void> {
  return transaction("readwrite", (tx, set) => {
    const active = tx.objectStore("active").get(userId);
    active.onsuccess = () => {
      if (expectedId === undefined || active.result === expectedId)
        tx.objectStore("active").delete(userId);
      set(undefined);
    };
  });
}
export function isRoomCreationSelected(
  userId: string,
  id: string,
  generation: string,
): Promise<boolean> {
  return transaction("readonly", (tx, set) => {
    const active = tx.objectStore("active").get(userId);
    active.onsuccess = () => {
      if (active.result !== id) {
        set(false);
        return;
      }
      const record = tx.objectStore("intents").get(key(userId, id));
      record.onsuccess = () =>
        guarded(tx, () =>
          set(readIntent(record.result, userId)?.generation === generation),
        );
    };
  });
}
export function updateRoomCreationIntent(
  userId: string,
  intent: RoomCreationIntent,
  changes: Partial<Pick<RoomCreationIntent, "state" | "roomId" | "name">>,
  requireSelected = false,
): Promise<RoomCreationIntent> {
  return transaction("readwrite", (tx, set) => {
    const active = tx.objectStore("active").get(userId);
    active.onsuccess = () => {
      if (requireSelected && active.result !== intent.requestId) {
        tx.abort();
        return;
      }
      const record = tx
        .objectStore("intents")
        .get(key(userId, intent.requestId));
      record.onsuccess = () =>
        guarded(tx, () => {
          const current = readIntent(record.result, userId);
          if (!current || current.generation !== intent.generation)
            throw new Error("古い作成要求です。");
          const next = IntentSchema.parse({ ...current, ...changes });
          // knownを遅いunknown/submittedで上書きしない。
          if (current.state === "known" && next.state !== "known") {
            set(current);
            return;
          }
          tx.objectStore("intents").put(next, key(userId, intent.requestId));
          set(next);
        });
    };
  });
}
export const markRoomCreationSubmitted = (
  userId: string,
  intent: RoomCreationIntent,
): Promise<RoomCreationIntent> =>
  updateRoomCreationIntent(userId, intent, { state: "submitted" }, true);
export const saveRoomCreationResult = (
  userId: string,
  intent: RoomCreationIntent,
  roomId: string,
): Promise<RoomCreationIntent> =>
  updateRoomCreationIntent(userId, intent, {
    state: "known",
    roomId,
    name: "",
  });
async function importLegacyIntent(userId: string): Promise<void> {
  const raw = sessionStorage.getItem(ROOM_CREATION_STORAGE_PREFIX + userId);
  if (!raw) return;
  const legacy = z
    .object({
      requestId: CreationRequestIdSchema,
      name: z.string().trim().max(ROOM_CREATION_NAME_MAX).optional(),
    })
    .parse(JSON.parse(raw));
  // 旧控えには発行時刻がない。受付はserverへ照会し、送信済みとして扱う。
  const legacyRecord: RoomCreationIntent = {
    ...legacy,
    name: legacy.name ?? "",
    expectedPrincipal: userId,
    issuedAt: 0,
    expiresAt: 0,
    state: "submitted",
    generation: legacy.requestId,
  };
  await transaction<void>("readwrite", (tx, set) => {
    const records = tx.objectStore("intents");
    const existing = records.get(key(userId, legacy.requestId));
    existing.onsuccess = () =>
      guarded(tx, () => {
        if (existing.result === undefined)
          records.add(legacyRecord, key(userId, legacy.requestId));
        else readIntent(existing.result, userId);
        const active = tx.objectStore("active").get(userId);
        active.onsuccess = () => {
          if (!active.result)
            tx.objectStore("active").put(legacy.requestId, userId);
          set(undefined);
        };
      });
  });
  sessionStorage.removeItem(ROOM_CREATION_STORAGE_PREFIX + userId);
}
export function subscribeRoomCreations(onChange: () => void): () => void {
  const channel =
    typeof BroadcastChannel !== "undefined"
      ? new BroadcastChannel(ROOM_CREATION_DB)
      : null;
  if (channel) channel.onmessage = onChange;
  window.addEventListener("focus", onChange);
  return () => {
    channel?.close();
    window.removeEventListener("focus", onChange);
  };
}
export function notifyRoomCreations(): void {
  if (typeof BroadcastChannel !== "undefined") {
    const c = new BroadcastChannel(ROOM_CREATION_DB);
    c.postMessage("changed");
    c.close();
  }
}

// 利用者が重複の可能性を確認して明示破棄した場合だけ呼ぶ。
export async function discardRoomCreationRecords(
  userId: string,
): Promise<void> {
  await transaction<void>("readwrite", (tx, set) => {
    tx.objectStore("active").delete(userId);
    const cursor = tx
      .objectStore("intents")
      .openCursor(IDBKeyRange.bound(`${userId}:`, `${userId}:\uffff`));
    cursor.onsuccess = () => {
      if (cursor.result) {
        cursor.result.delete();
        cursor.result.continue();
      } else set(undefined);
    };
  });
  sessionStorage.removeItem(ROOM_CREATION_STORAGE_PREFIX + userId);
  notifyRoomCreations();
}
