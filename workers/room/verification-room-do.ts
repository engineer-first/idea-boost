import {
  getInitialIdeaMapSizeLevel,
  NOTE_DEFAULT_FONT_SIZE,
} from "../../contracts/board";
import { isResultStep, isVotingStep } from "../../contracts/phase";
import { DOT_VOTE_LIMITS } from "../../contracts/room-protocol";
import {
  VERIFICATION_CHECKPOINTS,
  type VerificationCheckpoint,
  type VerificationStatus,
  type VerificationVoteRequest,
} from "../../contracts/verification";
import { DEV_USERS } from "../../lib/session/dev-users";
import { RoomBroadcaster } from "./broadcast";
import { setDecision } from "./decisions";
import { groupHandlers } from "./groups";
import type { HandlerCtx } from "./handler-context";
import { getMemberColor, isHostUser } from "./members";
import { noteHandlers } from "./note-handlers";
import { findNote, insertNote, type NoteRow, toProtocolNote } from "./notes";
import { getPhase, savePhase } from "./phase";
import { RoomDO } from "./room-do";
import { VERIFICATION_NOTES } from "./verification-content";
import { addVoteSticker, countUserVotes, hasCompletedVoting } from "./votes";

const META_KEY = "verification-checkpoint";
function noteId(phase: number, index: number): string {
  return `d1000000-0000-4000-8000-${String(phase * 100 + index).padStart(12, "0")}`;
}

// 本番のWorkerからはexportしない。初期投入は新しい検証ルームに限定する。
export class VerificationRoomDO extends RoomDO {
  async initializeVerification(
    checkpoint: VerificationCheckpoint,
  ): Promise<void> {
    await this.ctx.blockConcurrencyWhile(async () => {
      if (this.listMembers().length || (await this.ctx.storage.get(META_KEY)))
        throw new Error("既存ルームには投入できません。");
      const owner = DEV_USERS[0];
      await this.initializeNewRoom(owner.id, owner.name);
      for (const user of DEV_USERS.slice(1))
        await this.upsertMember(user.id, user.name);
      const target = VERIFICATION_CHECKPOINTS.find(
        (item) => item.id === checkpoint,
      )?.phase;
      if (!target) throw new Error("検証状態が不正です。");
      this.ctx.storage.transactionSync(() => {
        if (target.kind === "step") {
          for (let phase = 1; phase <= target.phase; phase++) {
            const completed = phase < target.phase;
            for (
              let index = 0;
              index < VERIFICATION_NOTES[phase].length;
              index++
            ) {
              const shared =
                completed ||
                target.step > 2 ||
                (target.step === 2 && index >= 3);
              this.seedNote(phase, index, shared);
            }
            if (completed || isResultStep(target)) {
              for (const user of DEV_USERS) this.seedVotes(phase, user.id);
            } else if (isVotingStep(target)) {
              this.seedVotes(phase, DEV_USERS[1].id);
            }
            if (completed)
              setDecision(
                this.ctx.storage.sql,
                phase,
                noteId(phase, 0),
                owner.id,
                VERIFICATION_NOTES[phase][0],
              );
          }
          if (target.phase === 1 && target.step >= 3) this.seedGroups();
          if (target.phase === 3 && target.step >= 2) {
            this.ctx.storage.sql.exec(
              "UPDATE room_state SET idea_map_size_level = ?1, idea_map_size_initialized = 1 WHERE id = 1",
              getInitialIdeaMapSizeLevel(VERIFICATION_NOTES[3].length),
            );
          }
        }
        savePhase(this.ctx.storage.sql, target);
      });
      await this.ctx.storage.put(META_KEY, checkpoint);
      if (target.kind === "step")
        for (let phase = 1; phase <= target.phase; phase++)
          await this.ctx.storage.put(`verification-prepared-${phase}`, true);
    });
  }

  override async webSocketMessage(
    ws: WebSocket,
    raw: ArrayBuffer | string,
  ): Promise<void> {
    await this.ctx.blockConcurrencyWhile(async () => {
      await super.webSocketMessage(ws, raw);
      const phase = getPhase(this.ctx.storage.sql);
      if (
        phase.kind !== "step" ||
        phase.step !== 1 ||
        !(await this.ctx.storage.get(META_KEY)) ||
        (await this.ctx.storage.get(`verification-prepared-${phase.phase}`))
      )
        return;
      const notes: NoteRow[] = [];
      this.ctx.storage.transactionSync(() => {
        for (
          let index = 0;
          index < VERIFICATION_NOTES[phase.phase].length;
          index++
        )
          notes.push(this.seedNote(phase.phase, index, false));
      });
      await this.ctx.storage.put(`verification-prepared-${phase.phase}`, true);
      const broadcaster = new RoomBroadcaster(this.ctx);
      for (const note of notes)
        broadcaster.broadcastNote((viewerId) => ({
          type: "note:inserted",
          note: toProtocolNote(this.ctx.storage.sql, note, viewerId),
        }));
    });
  }

  async verificationStatus(userId: string): Promise<VerificationStatus | null> {
    if (
      !(await this.ctx.storage.get(META_KEY)) ||
      !this.listMembers().some((member) => member.userId === userId)
    )
      return null;
    const phase = getPhase(this.ctx.storage.sql);
    return {
      phase,
      canCompleteVotes:
        isVotingStep(phase) && isHostUser(this.ctx.storage.sql, userId),
      completedOtherVoters:
        phase.kind === "step"
          ? DEV_USERS.slice(1).filter((user) =>
              hasCompletedVoting(this.ctx.storage.sql, user.id, phase.phase),
            ).length
          : 0,
    };
  }

  async completeVerificationVotes(
    userId: string,
    expected: VerificationVoteRequest,
  ): Promise<VerificationStatus | null> {
    const result = await this.ctx.blockConcurrencyWhile(async () => {
      // このコールバックのrejectはDOをリセットし、接続中の全WSを切断する。
      // 古い操作などの通常エラーは値として返し、ゲートの外でRPCエラーにする。
      try {
        const status = await this.verificationStatus(userId);
        if (
          !status ||
          userId !== DEV_USERS[0].id ||
          !isHostUser(this.ctx.storage.sql, userId)
        )
          return null;
        const phase = status.phase;
        if (
          phase.kind !== "step" ||
          phase.phase !== expected.phase ||
          phase.step !== expected.step ||
          !isVotingStep(phase)
        )
          throw new Error("ステップが変わりました。再取得してください。");
        for (const user of DEV_USERS.slice(1)) {
          for (const kind of ["subjective", "objective"] as const) {
            while (
              countUserVotes(this.ctx.storage.sql, user.id, kind, phase.phase) <
              DOT_VOTE_LIMITS[kind]
            ) {
              const count = countUserVotes(
                this.ctx.storage.sql,
                user.id,
                kind,
                phase.phase,
              );
              const target = findNote(
                this.ctx.storage.sql,
                noteId(phase.phase, kind === "subjective" ? 0 : count + 1),
              );
              if (target?.visibility !== "shared")
                throw new Error(
                  "投票先のサンプルがありません。状態を作り直してください。",
                );
              noteHandlers["note:vote"](this.handlerContext(user.id), {
                type: "note:vote",
                noteId: target.id,
                kind,
              });
            }
          }
        }
        return await this.verificationStatus(userId);
      } catch (error) {
        return {
          error:
            error instanceof Error ? error.message : "投票に失敗しました。",
        };
      }
    });
    if (result && "error" in result) throw new Error(result.error);
    return result;
  }

  private seedNote(phase: number, index: number, shared: boolean): NoteRow {
    const user = DEV_USERS[index % DEV_USERS.length];
    const now = new Date().toISOString();
    const order = this.ctx.storage.sql
      .exec<{ value: number }>(
        "UPDATE room_state SET next_note_stack_order = next_note_stack_order + 1 WHERE id = 1 RETURNING next_note_stack_order - 1 AS value",
      )
      .one();
    const note: NoteRow = {
      id: noteId(phase, index),
      author_id: user.id,
      content: VERIFICATION_NOTES[phase][index],
      visibility: shared ? "shared" : "private",
      color: getMemberColor(this.ctx.storage.sql, user.id) ?? "yellow",
      font_size: NOTE_DEFAULT_FONT_SIZE,
      x: phase === 3 ? 15 + (index % 4) * 23 : 380 + (index % 4) * 280,
      y:
        phase === 3
          ? 20 + Math.floor(index / 4) * 30
          : 380 + Math.floor(index / 4) * 240,
      stack_order: order.value,
      created_at: now,
      updated_at: now,
      phase,
      excluded: false,
    };
    insertNote(this.ctx.storage.sql, note);
    return note;
  }

  private seedVotes(phase: number, userId: string): void {
    for (const kind of ["subjective", "objective"] as const) {
      for (let count = 0; count < DOT_VOTE_LIMITS[kind]; count++)
        addVoteSticker(
          this.ctx.storage.sql,
          {
            id: crypto.randomUUID(),
            kind,
            x: 0.2 + count * 0.25,
            y: kind === "subjective" ? 0.25 : 0.65,
          },
          noteId(phase, kind === "subjective" ? 0 : count + 1),
          userId,
        );
    }
  }

  private seedGroups(): void {
    // 2つの代表群と未分類の付箋。個数別のプリセットは増やさない。
    const now = new Date().toISOString();
    for (const [groupIndex, indexes] of [
      [0, 1, 2, 7],
      [3, 4, 5, 6],
    ].entries()) {
      for (const [position, index] of indexes.entries())
        this.ctx.storage.sql.exec(
          "UPDATE notes SET x = ?2, y = ?3 WHERE id = ?1",
          noteId(1, index),
          400 + groupIndex * 650 + (position % 2) * 220,
          400 + Math.floor(position / 2) * 180,
        );
      groupHandlers["group:create"](this.handlerContext(DEV_USERS[0].id), {
        type: "group:create",
        group: {
          id: crypto.randomUUID(),
          name: groupIndex === 0 ? "学び合う相手探し" : "昼休みの混雑",
          noteIds: indexes.map((index) => noteId(1, index)),
          createdAt: now,
          updatedAt: now,
        },
      });
    }
  }

  private handlerContext(userId: string): HandlerCtx {
    return {
      sql: this.ctx.storage.sql,
      storage: this.ctx.storage,
      userId,
      ws: new WebSocketPair()[1],
      reply: (message) => {
        if (message.type === "error") throw new Error(message.message);
      },
      broadcaster: new RoomBroadcaster(this.ctx),
      refreshSnapshots: () => {},
    };
  }
}
