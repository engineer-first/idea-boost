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
function creationFailure(cause: unknown): ParticipationResult | null {
  const reason =
    cause instanceof CreationConflict
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
          reason === "expired"
            ? "作成受付の期限が過ぎました。結果を確認してください。"
            : reason === "closed"
              ? "この作成要求のルームは終了または削除されています。"
              : "作成要求を確認してください。",
      }
    : null;
}
// 各アカウントの要求を直列化する。途中の操作を永続化してから他DOを呼び、
// source側receiptで応答消失と再起動を照合する。共有状態はRoomDOだけが持つ。
export class AccountDO extends DurableObject<Env> {
  private stub(roomId: string) {
    return this.env.ROOM_DO.get(this.env.ROOM_DO.idFromName(roomId));
  }
  private async sources(
    userId: string,
    except?: string,
  ): Promise<ParticipationSource[]> {
    const rows = await this.env.DB.prepare(
      "SELECT id,invite_code,host_id FROM rooms WHERE creation_visibility IN ('published','legacy') ORDER BY id",
    ).all<{ id: string; invite_code: string; host_id: string }>();
    const result: ParticipationSource[] = [];
    for (const row of rows.results) {
      if (row.id === except) continue;
      const preview = await this.stub(row.id).participationPreview(
        userId,
        row.id,
        row.invite_code,
        row.host_id,
      );
      if (preview) result.push(preview);
    }
    return result;
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
    if (!room) throw new Error("移動先のルームが見つかりません。");
    if (
      target.kind === "revisit" &&
      !(await this.stub(room.roomId).isMember(userId))
    )
      throw new Error("移動先のルームが見つかりません。");
    const accepted = await this.stub(room.roomId).canAcceptParticipation(
      userId,
    );
    if (accepted !== "ok")
      throw new Error(
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
    return this.ctx.blockConcurrencyWhile(async () => {
      type Sample = {
        id: string;
        checkpoint: PreviewCheckpoint;
        creation: CreationRequest;
        sources: string[];
      };
      let sample = await this.ctx.storage.get<Sample>("preview-sample-pending");
      const active = await this.activeOperation();
      if (active && active !== sample?.id)
        return {
          ok: false,
          error: "移動中の処理を確認・完了してからステップを準備してください。",
          status: 409,
        };
      const preview = (roomId: string) =>
        this.stub(roomId) as unknown as DurableObjectStub<PreviewRoomDO>;
      try {
        if (!sample) {
          const sources = await this.sources(creator.sub);
          for (const source of sources)
            if (!(await preview(source.roomId).isPreviewSample(creator.sub)))
              return {
                ok: false,
                error:
                  "通常ルームに参加中です。ホームから参加中のルームを開き、退出を確認してからステップを準備してください。",
                status: 409,
              };
          const issued = issueCreationId();
          const creation = await reserveRoomCreation(
            this.env.DB,
            creator.sub,
            issued.requestId,
          );
          sample = {
            id: crypto.randomUUID(),
            checkpoint,
            creation,
            sources: sources.map((source) => source.roomId),
          };
          const generation =
            (await this.ctx.storage.get<number>("generation")) ?? 0;
          await this.ctx.storage.transaction(async (tx) => {
            await tx.put("preview-sample-pending", sample);
            await tx.put("active", sample?.id);
            await tx.put("generation", generation + 1);
          });
        } else if (sample.checkpoint !== checkpoint)
          return {
            ok: false,
            error: "準備中の同じステップを再試行してください。",
            status: 409,
          };
        for (const roomId of sample.sources) {
          if (!(await preview(roomId).archivePreviewSample(creator.sub))) {
            await preview(sample.creation.room_id).disband(
              undefined,
              creator.sub,
            );
            await deleteRoom(this.env.DB, sample.creation.room_id);
            await this.ctx.storage.transaction(async (tx) => {
              await tx.delete("preview-sample-pending");
              await tx.delete("active");
            });
            return {
              ok: false,
              status: 409,
              error:
                "参加状況が変わったため、新しいサンプルは作成していません。参加中のルームで退出を確認してください。以前のサンプルは閲覧専用のままです。",
            };
          }
        }
        const current = sample;
        await completeRoomCreation(this.env.DB, current.creation, async () =>
          preview(current.creation.room_id).initializePreview(
            checkpoint,
            current.creation.room_id,
            creator,
            creationIdentity(current.creation),
          ),
        );
        const room: PreviewRoom = {
          roomId: current.creation.room_id,
          inviteCode: current.creation.invite_code,
          checkpoint,
        };
        await this.ctx.storage.transaction(async (tx) => {
          await tx.delete("preview-sample-pending");
          await tx.delete("active");
        });
        return { ok: true, room };
      } catch {
        return {
          ok: false,
          error:
            "準備の結果を確認できません。同じステップを再試行してください。",
          status: 503,
        };
      }
    });
  }

  private async normalizeConfirmation(op: Operation): Promise<void> {
    // 旧保存形式は新しいversionとして提示し、古いversion0の決定で実行しない。
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
  async mayOperate(userId: string, roomId: string): Promise<boolean> {
    return this.ctx.blockConcurrencyWhile(async () => {
      const active = await this.activeOperation();
      if (active) return false;
      const current = await this.sources(userId);
      return current.length === 1 && current[0].roomId === roomId;
    });
  }
  async inspect(
    userId: string,
    roomId: string,
  ): Promise<ParticipationResult | null> {
    return this.ctx.blockConcurrencyWhile(async () => {
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
        if (op.userId === userId && op.phase !== "ready")
          return op.phase === "confirmation"
            ? {
                kind: "confirmation",
                confirmation: op.confirmation,
                reason: "state_changed",
              }
            : this.pending(op);
      }
      const sources = await this.sources(userId, roomId);
      if (!sources.length) return null;
      return this.prepareInside(userId, { kind: "revisit", roomId }, false);
    });
  }
  async prepare(
    userId: string,
    target: ParticipationTarget,
    automatic = false,
  ): Promise<ParticipationResult> {
    return this.ctx.blockConcurrencyWhile(() =>
      this.prepareInside(userId, target, automatic),
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
    automatic: boolean,
  ): Promise<ParticipationResult> {
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
        if (
          automatic &&
          JSON.stringify(op.confirmation.target) === JSON.stringify(target) &&
          op.phase !== "confirmation"
        )
          return this.commitInside(
            userId,
            active,
            op.outcomeAccess,
            op.confirmation.version,
          );
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
      const confirmation: ParticipationConfirmation = {
        operationId: crypto.randomUUID(),
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
        outcomeAccess: "discard",
        ...(destination ? { destination } : {}),
      };
      await this.ctx.storage.put(`op:${confirmation.operationId}`, op);
      if (automatic && !sources.length)
        return this.commitInside(
          userId,
          confirmation.operationId,
          "discard",
          confirmation.version,
        );
      return { kind: "confirmation", confirmation };
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
    return this.ctx.blockConcurrencyWhile(async () => {
      const op = await this.ctx.storage.get<Operation>(`op:${id}`);
      if (!op || op.userId !== userId)
        return {
          kind: "rejected",
          reason: "not_found",
          error: "この操作を確認できません。",
        };
      await this.normalizeConfirmation(op);
      if (op.phase === "confirmation")
        return { kind: "confirmation", confirmation: op.confirmation };
      if (op.result) {
        if ((await this.activeOperation()) === id)
          await this.ctx.storage.delete("active");
        return op.result;
      }
      return this.commitInside(
        userId,
        id,
        op.outcomeAccess,
        op.confirmation.version,
      );
    });
  }
  async commit(
    userId: string,
    id: string,
    outcomeAccess: LeaveOutcomeAccess,
    confirmationVersion: number,
  ): Promise<ParticipationResult> {
    return this.ctx.blockConcurrencyWhile(() =>
      this.commitInside(userId, id, outcomeAccess, confirmationVersion),
    );
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
        if (receipt === "disbanded")
          await deleteRoom(this.env.DB, source.roomId);
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
        if (receipt === "disbanded")
          await deleteRoom(this.env.DB, source.roomId);
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
    op.result = result;
    op.phase = "ready";
    op.terminalFailure = undefined;
    await this.ctx.storage.transaction(async (tx) => {
      await tx.put(`op:${op.confirmation.operationId}`, op);
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

  private async commitInside(
    userId: string,
    id: string,
    outcomeAccess: LeaveOutcomeAccess,
    confirmationVersion: number,
  ): Promise<ParticipationResult> {
    const op = await this.ctx.storage.get<Operation>(`op:${id}`);
    if (!op || op.userId !== userId)
      return {
        kind: "rejected",
        reason: "not_found",
        error: "この操作を確認できません。",
      };
    await this.normalizeConfirmation(op);
    if (
      op.phase === "confirmation" &&
      confirmationVersion !== op.confirmation.version
    )
      return {
        kind: "confirmation",
        confirmation: op.confirmation,
        reason: "state_changed",
      };
    if (op.generation !== undefined && op.outcomeAccess !== outcomeAccess)
      return {
        kind: "rejected",
        reason: "input_conflict",
        error: "同じ操作の成果の選択は変更できません。",
      };
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
          return {
            kind: "confirmation",
            confirmation: op.confirmation,
            reason: "state_changed",
          };
        }
        op.generation =
          ((await this.ctx.storage.get<number>("generation")) ?? 0) + 1;
        await this.ctx.storage.put("generation", op.generation);
        op.outcomeAccess = outcomeAccess;
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
              if (op.left.length)
                op.confirmation.outcomeAccess = op.outcomeAccess;
              else {
                if (op.destination)
                  await this.stub(
                    op.destination.roomId,
                  ).cancelParticipationReservation(userId, id);
                op.generation = undefined;
              }
              op.phase = "confirmation";
              await this.ctx.storage.transaction(async (tx) => {
                await tx.put(`op:${id}`, op);
                if (!op.left.length) await tx.delete("active");
              });
              return {
                kind: "confirmation",
                confirmation: op.confirmation,
                reason: "state_changed",
              };
            }
            result = leaving;
          }
          if (result === "disbanded")
            await deleteRoom(this.env.DB, source.roomId);
          op.left.push(source.roomId);
          await save();
        }
        op.phase = "joining";
        await save();
      }
      if (op.phase === "joining") {
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
          op.result = {
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
          op.result = { kind: "ready", roomId: room.roomId };
        }
        op.phase = "ready";
        await save();
        await this.ctx.storage.delete("active");
        return op.result;
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
