import { DurableObject } from "cloudflare:workers";
import type { LeaveOutcomeAccess } from "../../contracts/completed-rooms";
import { defaultDisplayName } from "../../contracts/display-name";
import type { PreviewCheckpoint, PreviewRoom } from "../../contracts/preview";
import { issueCreationId } from "../../contracts/room-creation";
import type {
  ParticipationConfirmation,
  ParticipationFailureContext,
  ParticipationResult,
  ParticipationSource,
  ParticipationTarget,
} from "../../contracts/room-participation";
import type { VerifiedSession } from "../../contracts/session";
import {
  deleteRoom,
  findRoomByCode,
  findRoomById,
  findUserDisplayNameById,
  type RoomRecord,
} from "../lib/db";
import {
  CreationConflict,
  CreationExpired,
  CreationGone,
  type CreationRequest,
  CreationUpdateRequired,
  completeRoomCreation,
  creationIdentity,
  getCreationStatus,
  readCreationControl,
  readCreationRequest,
  reserveRoomCreation,
} from "../lib/room-creation";
import type { PreviewRoomDO } from "../room/preview-room-do";

type Operation = {
  userId: string;
  confirmation: ParticipationConfirmation;
  phase: "confirmation" | "leaving" | "joining" | "ready";
  left: string[];
  outcomeAccess: LeaveOutcomeAccess;
  result?: ParticipationResult;
  destination?: RoomRecord;
  generation?: number;
  sourceHistory?: ParticipationSource[];
  terminalFailure?: { reason: string; error: string };
};
function targetKey(target: ParticipationTarget): string {
  return JSON.stringify(
    target.kind === "create"
      ? {
          kind: target.kind,
          input: {
            requestId: target.input.requestId,
            expectedPrincipal: target.input.expectedPrincipal,
            name: target.input.name?.trim() || "",
          },
        }
      : target,
  );
}
class ParticipationDestinationUnavailable extends Error {
  constructor(
    readonly reason:
      | "destination_unavailable"
      | "destination_full"
      | "destination_closed",
    message: string,
  ) {
    super(message);
  }
}
function creationFailure(cause: unknown): ParticipationResult | null {
  const reason =
    cause instanceof ParticipationDestinationUnavailable
      ? cause.reason
      : cause instanceof CreationConflict
        ? "input_conflict"
        : cause instanceof CreationExpired
          ? "expired"
          : cause instanceof CreationGone
            ? "closed"
            : cause instanceof CreationUpdateRequired
              ? "update_required"
              : null;
  return reason
    ? {
        kind: "rejected",
        reason,
        error:
          cause instanceof ParticipationDestinationUnavailable
            ? cause.message
            : reason === "expired"
              ? "作成受付の期限が過ぎました。結果を確認してください。"
              : reason === "closed"
                ? "この作成要求のルームは終了または削除されています。"
                : "作成要求を確認してください。",
      }
    : null;
}
function participationUnavailable(): ParticipationResult {
  return {
    kind: "rejected",
    reason: "participation_unavailable",
    error: "参加状況を確認できません。もう一度お試しください。",
  };
}
// 各アカウントの要求を直列化する。途中の操作を永続化してから他DOを呼び、
// source側receiptで応答消失と再起動を照合する。共有状態はRoomDOだけが持つ。
export class AccountDO extends DurableObject<Env> {
  private stub(roomId: string) {
    return this.env.ROOM_DO.get(this.env.ROOM_DO.idFromName(roomId));
  }
  // これは在籍の真実ではなく候補索引。解除通知では消さず、参加操作時にRoomDOを再照合する。
  private async indexedRooms(): Promise<RoomRecord[]> {
    return (
      (await this.ctx.storage.get<RoomRecord[]>("participation-index")) ?? []
    );
  }

  private async ensureIndex(userId: string): Promise<boolean> {
    try {
      // 初回だけ旧在籍を全走査する。外部RPCをゲートの外で行い、ページの進捗を保存する。
      while (
        !(await this.ctx.storage.get<boolean>("participation-index-ready"))
      ) {
        const cursor =
          (await this.ctx.storage.get<string>("participation-index-cursor")) ??
          "";
        const rows = await this.env.DB.prepare(
          "SELECT id,invite_code,host_id FROM rooms WHERE creation_visibility IN ('published','legacy') AND id>? ORDER BY id LIMIT 16",
        )
          .bind(cursor)
          .all<{ id: string; invite_code: string; host_id: string }>();
        const found = await Promise.all(
          rows.results.map(async (row) => {
            const source = await this.stub(row.id).participationPreview(
              userId,
              row.id,
              row.invite_code,
              row.host_id,
            );
            return source
              ? {
                  roomId: row.id,
                  inviteCode: row.invite_code,
                  hostId: row.host_id,
                }
              : null;
          }),
        );
        await this.ctx.blockConcurrencyWhile(async () => {
          // 同時の初回照合が先に進んだページを上書きしない。
          if (await this.ctx.storage.get<boolean>("participation-index-ready"))
            return;
          const latest =
            (await this.ctx.storage.get<string>(
              "participation-index-cursor",
            )) ?? "";
          if (latest !== cursor) return;
          const rooms = await this.indexedRooms();
          for (const room of found) if (room) rooms.push(room);
          await this.ctx.storage.put({
            "participation-index": rooms,
            "participation-index-cursor": rows.results.at(-1)?.id ?? cursor,
            "participation-index-ready": rows.results.length < 16,
          });
        });
      }
      return true;
    } catch {
      return false;
    }
  }

  private async sources(
    userId: string,
    except?: string,
  ): Promise<ParticipationSource[]> {
    const rooms = await this.indexedRooms();
    const result: ParticipationSource[] = [];
    const retained: RoomRecord[] = [];
    for (const room of rooms) {
      if (room.roomId === except) {
        retained.push(room);
        continue;
      }
      const preview = await this.stub(room.roomId).participationPreview(
        userId,
        room.roomId,
        room.inviteCode,
        room.hostId,
      );
      if (preview) {
        result.push(preview);
        retained.push(room);
      }
    }
    await this.ctx.storage.put("participation-index", retained);
    return result.sort((a, b) => a.roomId.localeCompare(b.roomId));
  }
  private async destination(
    userId: string,
    target: ParticipationTarget,
  ): Promise<RoomRecord | null> {
    if (target.kind === "create") return null;
    const room =
      target.kind === "join"
        ? await findRoomByCode(this.env.DB, target.code)
        : await findRoomById(this.env.DB, target.roomId);
    if (!room)
      throw new ParticipationDestinationUnavailable(
        "destination_unavailable",
        "参加できるルームが見つかりません。招待元に確認してください。",
      );
    if (
      target.kind === "revisit" &&
      !(await this.stub(room.roomId).isMember(userId))
    )
      throw new ParticipationDestinationUnavailable(
        "destination_unavailable",
        "参加できるルームが見つかりません。招待元に確認してください。",
      );
    const accepted = await this.stub(room.roomId).canAcceptParticipation(
      userId,
    );
    if (accepted !== "ok")
      throw new ParticipationDestinationUnavailable(
        accepted === "room-full" ? "destination_full" : "destination_closed",
        accepted === "room-full"
          ? "このルームは20人までです。"
          : "終了したルームには参加できません。",
      );
    return room;
  }
  async createPreviewSample(
    creator: VerifiedSession,
    checkpoint: PreviewCheckpoint,
  ): Promise<
    | { ok: true; room: PreviewRoom }
    | { ok: false; error: string; status: 409 | 503 }
  > {
    if (!(await this.ensureIndex(creator.sub)))
      return {
        ok: false,
        status: 503,
        error: "参加状況を確認できません。もう一度ステップを選んでください。",
      };
    return this.ctx.blockConcurrencyWhile(async () => {
      type Sample = {
        id: string;
        checkpoint: PreviewCheckpoint;
        creation: CreationRequest;
      };
      const preview = (roomId: string) =>
        this.stub(roomId) as unknown as DurableObjectStub<PreviewRoomDO>;
      // 呼び出しはゲートの中で直列化されるため、残っている準備は再起動などで止まったもの。
      // Previewは検証用なので照合して再開せず、破棄して選ばれたステップで作り直す。
      const stale = await this.ctx.storage.get<Sample>(
        "preview-sample-pending",
      );
      if (stale) {
        try {
          // 公開まで終わったルームは利用者が開いている可能性があるため残す。
          const published = await this.env.DB.prepare(
            "SELECT 1 FROM rooms WHERE id=? AND creation_visibility<>'hidden'",
          )
            .bind(stale.creation.room_id)
            .first();
          if (
            !published &&
            (await preview(stale.creation.room_id).disband(
              undefined,
              creator.sub,
            ))
          )
            await deleteRoom(this.env.DB, stale.creation.room_id);
        } catch {
          // 公開前の部屋は一覧に出ず、作成受付の期限処理でも片付く。
        }
        await this.ctx.storage.transaction(async (tx) => {
          await tx.delete("preview-sample-pending");
          if ((await tx.get<string>("active")) === stale.id)
            await tx.delete("active");
        });
      }
      if (await this.activeOperation())
        return {
          ok: false,
          error:
            "別のルームへの移動を処理しています。少し待ってからステップを選び直してください。",
          status: 409,
        };
      try {
        const sources = await this.sources(creator.sub);
        // 参加中のルームがあれば、同じルームを選んだステップに作り直して全員に反映する。
        const [current] = sources;
        if (
          sources.length === 1 &&
          current &&
          (await preview(current.roomId).resetToCheckpoint(
            checkpoint,
            current.roomId,
            creator,
          )) === "ok"
        )
          return {
            ok: true,
            room: {
              roomId: current.roomId,
              inviteCode: current.inviteCode,
              checkpoint,
            },
          };
        const sample: Sample = {
          id: crypto.randomUUID(),
          checkpoint,
          creation: await reserveRoomCreation(
            this.env.DB,
            creator.sub,
            issueCreationId().requestId,
          ),
        };
        await this.ctx.storage.put("preview-sample-pending", sample);
        await completeRoomCreation(this.env.DB, sample.creation, async () =>
          preview(sample.creation.room_id).initializePreview(
            checkpoint,
            sample.creation.room_id,
            creator,
            creationIdentity(sample.creation),
          ),
        );
        // 新しいルームを用意できてから、通常の作成・参加と同じく参加中のルームを確認なしで退出する。
        for (const source of sources)
          await preview(source.roomId).leave(creator.sub);
        const room: PreviewRoom = {
          roomId: sample.creation.room_id,
          inviteCode: sample.creation.invite_code,
          checkpoint,
        };
        await this.ctx.storage.transaction(async (tx) => {
          await tx.put("participation-index", [
            {
              roomId: room.roomId,
              inviteCode: room.inviteCode,
              hostId: creator.sub,
            },
          ]);
          await tx.delete("preview-sample-pending");
        });
        return { ok: true, room };
      } catch {
        return {
          ok: false,
          error:
            "ルームを準備できませんでした。もう一度ステップを選んでください。",
          status: 503,
        };
      }
    });
  }

  private async normalizeConfirmation(op: Operation): Promise<void> {
    // 旧保存形式の版を補完する。利用者の再確認には使わず、サーバー内で在籍を再照合する。
    if (op.confirmation.version === undefined) {
      op.confirmation.version = 1;
      await this.ctx.storage.put(`op:${op.confirmation.operationId}`, op);
    }
  }
  private async activeOperation(): Promise<string | undefined> {
    const active = await this.ctx.storage.get<string>("active");
    if (!active) return undefined;
    const op = await this.ctx.storage.get<Operation>(`op:${active}`);
    // result保存とactive解除の間で停止しても、確定済みのロックを回復する。
    if (op?.phase === "ready") {
      await this.ctx.storage.delete("active");
      return undefined;
    }
    return active;
  }
  async mayOperate(_userId: string, roomId: string): Promise<boolean> {
    // 未照合は拒否。初回の照合は参加・再訪の入口で完了させ、WSから逆RPCをしない。
    return this.ctx.blockConcurrencyWhile(async () => {
      try {
        if (!(await this.ctx.storage.get<boolean>("participation-index-ready")))
          return false;
        if (await this.activeOperation()) return false;
        const current = await this.indexedRooms();
        return current.length === 1 && current[0].roomId === roomId;
      } catch {
        return false;
      }
    });
  }
  async inspect(
    userId: string,
    roomId: string,
  ): Promise<ParticipationResult | null> {
    if (!(await this.ensureIndex(userId))) return participationUnavailable();
    return this.ctx.blockConcurrencyWhile(async () => {
      try {
        const active = await this.activeOperation();
        if (active) {
          const op = await this.ctx.storage.get<Operation>(`op:${active}`);
          if (!op)
            return {
              kind: "rejected",
              reason: "busy",
              error:
                "検証ステップを準備しています。同じステップを再試行してください。",
            };
          await this.normalizeConfirmation(op);
          if (op.userId === userId && op.phase !== "ready") {
            const result = await this.resumeInside(userId, active);
            return result.kind === "ready"
              ? { ...result, operationId: active }
              : result;
          }
        }
        // 検証サンプルなど、専用経路で準備された再訪先もRoomDOの事実を確認して候補に加える。
        const rooms = await this.indexedRooms();
        if (!rooms.some((room) => room.roomId === roomId)) {
          const room = await findRoomById(this.env.DB, roomId);
          if (
            room &&
            (await this.stub(roomId).isMember(userId)) &&
            (await this.stub(roomId).isJoinable())
          ) {
            rooms.push(room);
            await this.ctx.storage.put("participation-index", rooms);
          }
        }
        const sources = await this.sources(userId, roomId);
        if (!sources.length) return null;
        return await this.prepareInside(
          userId,
          { kind: "revisit", roomId },
          true,
        );
      } catch {
        return participationUnavailable();
      }
    });
  }
  async prepare(
    userId: string,
    target: ParticipationTarget,
    automatic = true,
    operationId?: string,
  ): Promise<ParticipationResult> {
    if (!(await this.ensureIndex(userId))) return participationUnavailable();
    return this.ctx.blockConcurrencyWhile(() =>
      this.prepareInside(userId, target, automatic, operationId),
    );
  }
  private pending(op: Operation): ParticipationResult {
    return {
      kind: "pending",
      operationId: op.confirmation.operationId,
      progress: op.phase === "joining" ? "joining" : "leaving",
      target: op.confirmation.target,
      targetName: op.confirmation.targetName,
      error: "移動の結果を確認しています。同じ操作を再試行してください。",
    };
  }
  private async prepareInside(
    userId: string,
    target: ParticipationTarget,
    _automatic: boolean,
    operationId?: string,
  ): Promise<ParticipationResult> {
    operationId ??=
      target.kind === "create" ? target.input.requestId : undefined;
    if (operationId) {
      const alias = await this.ctx.storage.get<{
        userId: string;
        target: ParticipationTarget;
        operationId: string;
      }>(`request:${operationId}`);
      if (alias) {
        if (
          alias.userId !== userId ||
          targetKey(alias.target) !== targetKey(target)
        )
          return {
            kind: "rejected",
            reason: "input_conflict",
            error: "ページを読み直して、もう一度お試しください。",
          };
        if (target.kind === "create") {
          const accepted = await this.ctx.storage.get<Operation>(
            `op:${alias.operationId}`,
          );
          if (
            accepted &&
            targetKey(accepted.confirmation.target) !== targetKey(target)
          )
            return {
              kind: "rejected",
              reason: "input_conflict",
              error:
                "別のルームへの移動が先に進んでいます。ホームからもう一度お試しください。",
            };
        }
        return this.resumeInside(userId, alias.operationId);
      }
      const previous = await this.ctx.storage.get<Operation>(
        `op:${operationId}`,
      );
      if (previous) {
        if (
          previous.userId !== userId ||
          targetKey(previous.confirmation.target) !== targetKey(target)
        )
          return {
            kind: "rejected",
            reason: "input_conflict",
            error: "ページを読み直して、もう一度お試しください。",
          };
        if (target.kind === "create" && previous.result?.kind === "ready") {
          try {
            await reserveRoomCreation(
              this.env.DB,
              userId,
              target.input.requestId,
              target.input.name,
            );
          } catch (cause) {
            return creationFailure(cause) ?? participationUnavailable();
          }
        }
        return this.resumeInside(userId, operationId);
      }
    }
    const active = await this.activeOperation();
    if (active) {
      const op = await this.ctx.storage.get<Operation>(`op:${active}`);
      if (!op)
        return {
          kind: "rejected",
          reason: "busy",
          error:
            "検証ステップを準備しています。同じステップを再試行してください。",
        };
      await this.normalizeConfirmation(op);
      if (op.phase !== "ready") {
        if (operationId && operationId !== active)
          await this.ctx.storage.put(`request:${operationId}`, {
            userId,
            target,
            operationId: active,
          });
        if (targetKey(op.confirmation.target) === targetKey(target))
          return this.resumeInside(userId, active);
        return this.pending(op);
      }
    }
    // ready済みの作成再送は、現在の参加先を動かす新しい意思として扱わない。
    try {
      if (target.kind === "create") {
        const status = await getCreationStatus(
          this.env.DB,
          userId,
          target.input.requestId,
        );
        if (status.kind === "ready") {
          await reserveRoomCreation(
            this.env.DB,
            userId,
            target.input.requestId,
            target.input.name,
          );
          return {
            kind: "ready",
            roomId: status.roomId,
            inviteCode: status.inviteCode,
          };
        }
        if (status.kind === "closed") throw new CreationGone();
      }
      const destination = await this.destination(userId, target);
      const sources = await this.sources(userId, destination?.roomId);
      if (target.kind === "join" && sources.length && !operationId)
        return {
          kind: "rejected",
          reason: "update_required",
          error: "ページを読み直して、もう一度お試しください。",
        };
      const confirmation: ParticipationConfirmation = {
        operationId: operationId ?? crypto.randomUUID(),
        version: 0,
        target,
        targetName:
          target.kind === "create"
            ? target.input.name || "新しいルーム"
            : destination
              ? await this.stub(destination.roomId).participationName(
                  destination.inviteCode,
                )
              : "ルーム",
        sources,
      };
      const op: Operation = {
        userId,
        confirmation,
        phase: "confirmation",
        left: [],
        sourceHistory: [...sources],
        outcomeAccess: "retain",
        ...(destination ? { destination } : {}),
      };
      await this.ctx.storage.transaction(async (tx) => {
        await tx.put(`op:${confirmation.operationId}`, op);
        await tx.put("active", confirmation.operationId);
      });
      return this.resumeInside(userId, confirmation.operationId);
    } catch (cause) {
      const known = creationFailure(cause);
      if (known) return known;
      return {
        kind: "rejected",
        reason: "destination_unavailable",
        error:
          cause instanceof Error ? cause.message : "移動先を確認できません。",
      };
    }
  }
  async status(userId: string, id: string): Promise<ParticipationResult> {
    if (!(await this.ensureIndex(userId))) return participationUnavailable();
    return this.ctx.blockConcurrencyWhile(async () => {
      const op = await this.ctx.storage.get<Operation>(`op:${id}`);
      if (!op || op.userId !== userId)
        return {
          kind: "rejected",
          reason: "not_found",
          error: "この操作を確認できません。",
        };
      await this.normalizeConfirmation(op);

      if (op.result) {
        if ((await this.activeOperation()) === id)
          await this.ctx.storage.delete("active");
        return op.result;
      }
      return this.resumeInside(userId, id);
    });
  }
  async commit(
    userId: string,
    id: string,
    _outcomeAccess: LeaveOutcomeAccess,
    _confirmationVersion: number,
  ): Promise<ParticipationResult> {
    if (!(await this.ensureIndex(userId))) return participationUnavailable();
    return this.ctx.blockConcurrencyWhile(() => this.resumeInside(userId, id));
  }
  private sourceHistory(op: Operation): ParticipationSource[] {
    const sources = new Map(
      (op.sourceHistory ?? op.confirmation.sources).map((source) => [
        source.roomId,
        source,
      ]),
    );
    for (const source of op.confirmation.sources)
      sources.set(source.roomId, source);
    op.sourceHistory = [...sources.values()];
    return op.sourceHistory;
  }

  private async reconcileExits(userId: string, op: Operation): Promise<void> {
    for (const source of this.sourceHistory(op)) {
      const receipt = await this.stub(source.roomId).participationReceipt(
        userId,
        op.confirmation.operationId,
      );
      if (receipt) {
        if (!op.left.includes(source.roomId)) op.left.push(source.roomId);
      }
    }
    await this.ctx.storage.put(`op:${op.confirmation.operationId}`, op);
  }

  private async failureContext(
    userId: string,
    op: Operation,
  ): Promise<ParticipationFailureContext> {
    const exitedSources: ParticipationFailureContext["exitedSources"] = [];
    for (const source of this.sourceHistory(op)) {
      const stub = this.stub(source.roomId);
      const receipt = await stub.participationReceipt(
        userId,
        op.confirmation.operationId,
      );
      if (receipt) {
        exitedSources.push({
          roomId: source.roomId,
          name: source.name,
          result: receipt,
        });
      } else if (!(await stub.isMember(userId)) || !(await stub.isJoinable()))
        exitedSources.push({
          roomId: source.roomId,
          name: source.name,
          result: "inactive",
        });
    }
    const remainingSources = await this.sources(userId);
    return {
      operationId: op.confirmation.operationId,
      exitedSources,
      remainingSources,
      ...(remainingSources.length === 1
        ? { currentRoomId: remainingSources[0].roomId }
        : {}),
    };
  }

  private async finishReady(
    userId: string,
    op: Operation,
    result: Extract<ParticipationResult, { kind: "ready" }>,
  ): Promise<ParticipationResult> {
    await this.reconcileExits(userId, op);
    const exitedRoomNames: string[] = [];
    for (const source of this.sourceHistory(op)) {
      const receipt = await this.stub(source.roomId).participationReceipt(
        userId,
        op.confirmation.operationId,
      );
      if (receipt === "left" || receipt === "disbanded")
        exitedRoomNames.push(source.name);
    }
    result = {
      ...result,
      operationId: op.confirmation.operationId,
      exitedRoomNames,
    };
    op.result = result;
    op.phase = "ready";
    op.terminalFailure = undefined;
    const destination =
      op.destination ?? (await findRoomById(this.env.DB, result.roomId));
    if (!destination) throw new Error("参加先を確認できません。");
    await this.ctx.storage.transaction(async (tx) => {
      await tx.put(`op:${op.confirmation.operationId}`, op);
      const rooms = (await tx.get<RoomRecord[]>("participation-index")) ?? [];
      const current = rooms.filter(
        (room) =>
          !op.left.includes(room.roomId) && room.roomId !== result.roomId,
      );
      current.push(destination);
      await tx.put("participation-index", current);
      if ((await tx.get("active")) === op.confirmation.operationId)
        await tx.delete("active");
    });
    return result;
  }
  private async committedCreation(
    userId: string,
    op: Operation,
  ): Promise<Extract<ParticipationResult, { kind: "ready" }> | null> {
    const target = op.confirmation.target;
    if (target.kind !== "create") return null;
    const status = await getCreationStatus(
      this.env.DB,
      userId,
      target.input.requestId,
    );
    if (status.kind !== "ready") return null;
    const detail = await readCreationRequest(
      this.env.DB,
      userId,
      target.input.requestId,
    );
    if (
      (!detail && op.phase !== "joining") ||
      (detail && detail.name !== (target.input.name?.trim() || ""))
    )
      return null;
    return {
      kind: "ready",
      roomId: status.roomId,
      inviteCode: status.inviteCode,
    };
  }

  private async finishFailure(
    userId: string,
    op: Operation,
    reason: string,
    error: string,
  ): Promise<ParticipationResult> {
    const id = op.confirmation.operationId;
    op.terminalFailure = { reason, error };
    this.sourceHistory(op);
    // RPCの応答消失中にリセットされても、次の再開は退出へ戻らず取消fenceを完了する。
    await this.ctx.storage.put(`op:${id}`, op);
    if (
      op.confirmation.target.kind === "create" &&
      op.phase !== "confirmation" &&
      reason !== "input_conflict" &&
      reason !== "update_required"
    ) {
      const target = op.confirmation.target;
      const committed = await this.committedCreation(userId, op);
      if (committed && op.phase === "joining")
        return await this.finishReady(userId, op, committed);
      const control = await readCreationControl(
        this.env.DB,
        userId,
        target.input.requestId,
      );
      // readyは確定済み結果。新しい受付の拒否で既存の公開ルームを解散しない。
      if (control && control.status !== "ready") {
        await this.env.DB.prepare(
          "UPDATE room_creation_control SET status='closed' WHERE user_id=? AND request_id=? AND status='pending'",
        )
          .bind(userId, control.request_id)
          .run();
        const published = await this.committedCreation(userId, op);
        if (published && op.phase === "joining")
          return await this.finishReady(userId, op, published);
        const current = await readCreationControl(
          this.env.DB,
          userId,
          target.input.requestId,
        );
        if (current?.status === "closed") {
          await this.stub(control.room_id).closeCreationForParticipation(
            creationIdentity(control),
          );
          await deleteRoom(this.env.DB, control.room_id);
        }
      }
    }
    const roomIds = new Set(op.sourceHistory?.map((source) => source.roomId));
    if (op.destination) roomIds.add(op.destination.roomId);
    for (const roomId of roomIds)
      await this.stub(roomId).cancelParticipation(
        userId,
        id,
        op.generation ?? 0,
      );
    const failure = await this.failureContext(userId, op);
    op.result = { kind: "rejected", reason, error, failure };
    op.phase = "ready";
    await this.ctx.storage.transaction(async (tx) => {
      await tx.put(`op:${id}`, op);
      const generation = (await tx.get<number>("generation")) ?? 0;
      await tx.put(
        "generation",
        Math.max(generation, (op.generation ?? 0) + 1),
      );
      if ((await tx.get("active")) === id) await tx.delete("active");
    });
    return op.result;
  }

  private async admission(
    userId: string,
    op: Operation,
  ): Promise<
    | { kind: "admitted"; expiresAt: number }
    | { kind: "joined" }
    | { kind: "rejected"; reason: string; error: string }
  > {
    const target = op.confirmation.target;
    if (target.kind === "create") {
      const creation = await reserveRoomCreation(
        this.env.DB,
        userId,
        target.input.requestId,
        target.input.name,
      );
      if (
        !(await this.env.DB.prepare("SELECT id FROM rooms WHERE id=?")
          .bind(creation.room_id)
          .first())
      )
        throw new CreationGone();
      op.destination = {
        roomId: creation.room_id,
        inviteCode: creation.invite_code,
        hostId: userId,
      };
      const status = await this.stub(
        creation.room_id,
      ).inspectOrCloseExpiredCreation(creationIdentity(creation));
      if (status === "closed")
        return {
          kind: "rejected",
          reason: "closed",
          error: "作成先は終了しています。この移動の処理を終了しました。",
        };
      return { kind: "admitted", expiresAt: creation.expires_at };
    }
    const room = op.destination;
    if (!room) throw new Error("移動先を確認できません。");
    const stub = this.stub(room.roomId),
      id = op.confirmation.operationId,
      generation = op.generation ?? 0;
    if (
      (await stub.participationAdmission(userId, id, generation)) === "joined"
    )
      return { kind: "joined" };
    const reserved = await stub.reserveParticipation(userId, id, generation);
    if (reserved !== "ok")
      return {
        kind: "rejected",
        reason:
          reserved === "room-full"
            ? "destination_full"
            : reserved === "room-closed"
              ? "destination_closed"
              : "stale_operation",
        error:
          reserved === "room-full"
            ? "移動先は満員です。この移動の処理を終了しました。"
            : reserved === "room-closed"
              ? "移動先は終了しています。この移動の処理を終了しました。"
              : "古い移動の処理を終了しました。現在の参加先を確認してください。",
      };
    const expiresAt = await stub.participationReservationExpiresAt(
      userId,
      id,
      generation,
    );
    if (expiresAt === null)
      throw new Error(
        "参加枠の有効期限を確認できません。同じ操作で結果を確認してください。",
      );
    return { kind: "admitted", expiresAt };
  }

  /** 同じ永続操作を最大3回進める。応答喪失もRoomDOのreceiptで照合する。 */
  private async resumeInside(
    userId: string,
    id: string,
  ): Promise<ParticipationResult> {
    let result: ParticipationResult = {
      kind: "rejected",
      reason: "not_found",
      error: "もう一度お試しください。",
    };
    for (let attempt = 0; attempt < 3; attempt++) {
      result = await this.commitInside(userId, id, "retain", 0);
      if (result.kind !== "pending") return result;
    }
    return {
      ...result,
      error: "ルームに移動できませんでした。もう一度お試しください。",
    };
  }

  private async commitInside(
    userId: string,
    id: string,
    _outcomeAccess: LeaveOutcomeAccess,
    _confirmationVersion: number,
  ): Promise<ParticipationResult> {
    const op = await this.ctx.storage.get<Operation>(`op:${id}`);
    if (!op || op.userId !== userId)
      return {
        kind: "rejected",
        reason: "not_found",
        error: "この操作を確認できません。",
      };
    await this.normalizeConfirmation(op);
    // 本人退出の成果は常に保持するため、旧discardとretainの再送を同じ操作として扱う。
    if (op.result) {
      if ((await this.activeOperation()) === id)
        await this.ctx.storage.delete("active");
      return op.result;
    }
    try {
      if (op.phase === "joining" && !op.terminalFailure) {
        const committed = await this.committedCreation(userId, op);
        if (committed) return await this.finishReady(userId, op, committed);
      }
    } catch {
      return this.pending(op);
    }
    if (op.terminalFailure) {
      try {
        return await this.finishFailure(
          userId,
          op,
          op.terminalFailure.reason,
          op.terminalFailure.error,
        );
      } catch {
        return this.pending(op);
      }
    }
    this.sourceHistory(op);
    const latestGeneration =
      (await this.ctx.storage.get<number>("generation")) ?? 0;
    if (op.generation !== undefined && op.generation < latestGeneration) {
      op.result = {
        kind: "rejected",
        reason: "stale_operation",
        error: "この移動は古い操作です。現在の参加先を確認してください。",
      };
      op.phase = "ready";
      await this.ctx.storage.put(`op:${id}`, op);
      if ((await this.activeOperation()) === id)
        await this.ctx.storage.delete("active");
      return op.result;
    }
    const active = await this.activeOperation();
    if (active && active !== id) {
      const other = await this.ctx.storage.get<Operation>(`op:${active}`);
      return other
        ? this.pending(other)
        : {
            kind: "rejected",
            reason: "busy",
            error: "別の移動を処理しています。",
          };
    }
    const save = () => this.ctx.storage.put(`op:${id}`, op);
    try {
      if (op.phase === "confirmation") {
        const committed = await this.committedCreation(userId, op);
        if (committed && op.confirmation.target.kind === "create") {
          await reserveRoomCreation(
            this.env.DB,
            userId,
            op.confirmation.target.input.requestId,
            op.confirmation.target.input.name,
          );
          return await this.finishReady(userId, op, committed);
        }
        const destination = await this.destination(
          userId,
          op.confirmation.target,
        );
        const current = await this.sources(userId, destination?.roomId);
        if (
          JSON.stringify(current) !== JSON.stringify(op.confirmation.sources)
        ) {
          op.confirmation.sources = current;
          op.confirmation.version = op.confirmation.version + 1;
          await save();
          this.sourceHistory(op);
        }
        op.generation ??=
          ((await this.ctx.storage.get<number>("generation")) ?? 0) + 1;
        await this.ctx.storage.transaction(async (tx) => {
          await tx.put("generation", op.generation);
          await tx.put("active", id);
          await tx.put(`op:${id}`, op);
        });
        op.outcomeAccess = "retain";
        if (op.confirmation.target.kind === "create") {
          const input = op.confirmation.target.input;
          const creation = await reserveRoomCreation(
            this.env.DB,
            userId,
            input.requestId,
            input.name,
          );
          if (
            !(await this.env.DB.prepare("SELECT id FROM rooms WHERE id=?")
              .bind(creation.room_id)
              .first())
          )
            throw new CreationGone();
          op.destination = {
            roomId: creation.room_id,
            inviteCode: creation.invite_code,
            hostId: userId,
          };
        } else if (destination) {
          const reservation = await this.stub(
            destination.roomId,
          ).reserveParticipation(userId, id, op.generation);
          if (reservation !== "ok")
            return await this.finishFailure(
              userId,
              op,
              reservation === "room-full"
                ? "destination_full"
                : reservation === "room-closed"
                  ? "destination_closed"
                  : "stale_operation",
              "移動先の参加枠を確保できないため、この移動の処理を終了しました。",
            );
        }
        op.phase = "leaving";
        await this.ctx.storage.transaction(async (tx) => {
          await tx.put("active", id);
          await tx.put(`op:${id}`, op);
        });
      }
      if (op.phase === "leaving") {
        await this.reconcileExits(userId, op);
        for (const source of op.confirmation.sources) {
          if (op.left.includes(source.roomId)) continue;
          const stub = this.stub(source.roomId);
          let result = await stub.participationReceipt(userId, id);
          if (!result) {
            const room = await findRoomById(this.env.DB, source.roomId);
            // 完了・除外・通常退出などはRoomDOで再照合し、未確定の退出と区別する。
            if (
              !room ||
              !(await stub.isMember(userId)) ||
              !(await stub.isJoinable())
            ) {
              op.left.push(source.roomId);
              await save();
              continue;
            }
            // 保存待ち・DO停止・部分退出の再開では、破壊的処理の直前にも予約を再照合する。
            const admission = await this.admission(userId, op);
            if (admission.kind === "rejected")
              return await this.finishFailure(
                userId,
                op,
                admission.reason,
                admission.error,
              );
            if (admission.kind === "joined")
              throw new Error(
                "移動先の参加は確定しています。元ルームの処理結果を確認してください。",
              );
            await stub.ensureSharedOutcome(source.roomId, room.createdAt);
            const leaving = await stub.leaveForParticipation(
              userId,
              id,
              source,
              room.hostId,
              op.outcomeAccess,
              op.generation ?? 0,
              admission.expiresAt,
            );
            if (leaving === "busy" || leaving === "reservation-expired")
              return this.pending(op);
            if (leaving === "changed") {
              const current = await this.sources(
                userId,
                op.destination?.roomId,
              );
              op.confirmation.sources = current;
              op.confirmation.version = op.confirmation.version + 1;
              op.confirmation.progress = op.left.length
                ? "partially_left"
                : "confirming";
              op.phase = "confirmation";
              await save();
              return this.pending(op);
            }
            result = leaving;
          }
          op.left.push(source.roomId);
          await save();
        }
        op.phase = "joining";
        await save();
      }
      if (op.phase === "joining") {
        let result: Extract<ParticipationResult, { kind: "ready" }>;
        const target = op.confirmation.target;
        const name =
          (await findUserDisplayNameById(this.env.DB, userId)) ??
          defaultDisplayName(userId);
        if (target.kind === "create") {
          const creation = await reserveRoomCreation(
            this.env.DB,
            userId,
            target.input.requestId,
            target.input.name,
          );
          await completeRoomCreation(this.env.DB, creation, async () => {
            const result = await this.stub(creation.room_id).initializeCreation(
              creationIdentity(creation),
              name,
              creation.name,
            );
            if (result === "closed") throw new CreationGone();
          });
          result = {
            kind: "ready",
            roomId: creation.room_id,
            inviteCode: creation.invite_code,
          };
        } else {
          const room = op.destination;
          if (!room) throw new Error("移動先を確認できません。");
          const stub = this.stub(room.roomId);
          const admission = await this.admission(userId, op);
          if (admission.kind === "rejected")
            return await this.finishFailure(
              userId,
              op,
              admission.reason,
              admission.error,
            );
          const joined = await stub.commitParticipation(
            userId,
            name,
            id,
            op.generation ?? 0,
          );
          if (joined !== "ok")
            throw new Error(
              "移動先の参加結果を確認できません。同じ操作を再試行してください。",
            );
          result = { kind: "ready", roomId: room.roomId };
        }
        return await this.finishReady(userId, op, result);
      }
      return this.pending(op);
    } catch (cause) {
      const known = creationFailure(cause);
      if (known?.kind === "rejected") {
        try {
          return await this.finishFailure(
            userId,
            op,
            known.reason,
            known.error,
          );
        } catch {
          return this.pending(op);
        }
      }
      const result = this.pending(op);
      if (result.kind === "pending")
        result.error = cause instanceof Error ? cause.message : result.error;
      return result;
    }
  }
}
