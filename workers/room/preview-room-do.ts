import {
  getInitialIdeaMapSizeLevel,
  NOTE_DEFAULT_FONT_SIZE,
} from "../../contracts/board";
import { isResultStep } from "../../contracts/phase";
import {
  type PreviewCheckpoint,
  WS_CLOSE_PREVIEW_RESET,
  WS_CLOSE_PREVIEW_RESET_REASON,
} from "../../contracts/preview";
import {
  type CreationIdentity,
  issueCreationId,
} from "../../contracts/room-creation";
import { DOT_VOTE_LIMITS } from "../../contracts/room-protocol";
import type { SessionPayload } from "../../contracts/session";
import { VERIFICATION_CHECKPOINTS } from "../../contracts/verification";
import {
  LEGACY_ROOM_DO_MIGRATION_IDS,
  migrateRoomStorage,
  ROOM_DO_MIGRATIONS,
} from "../room-do-migrations";
import { setDecision } from "./decisions";
import { getMemberColor } from "./members";
import { insertNote, type NoteRow } from "./notes";
import { savePhase } from "./phase";
import { RoomDO } from "./room-do";
import { getRoomName } from "./room-name";
import { VERIFICATION_NOTES } from "./verification-content";
import { addVoteSticker } from "./votes";

// Preview専用namespaceだけで公開。本番RoomDOとローカル固定ユーザー検証を変えない。
export class PreviewRoomDO extends RoomDO {
  async initializePreview(
    checkpoint: PreviewCheckpoint,
    roomId: string,
    creator: SessionPayload,
    identity?: CreationIdentity,
  ): Promise<void> {
    await this.ctx.blockConcurrencyWhile(async () => {
      const previous = await this.ctx.storage.get<{
        checkpoint: PreviewCheckpoint;
        creator: string;
        identity: CreationIdentity;
      }>("preview-identity");
      if (
        previous &&
        (previous.creator !== creator.sub ||
          previous.checkpoint !== checkpoint ||
          previous.identity.roomId !== roomId)
      )
        throw new Error("既存ルームには投入できません。");
      if (await this.ctx.storage.get("preview-initialized")) {
        if (!previous || !this.isJoinable())
          throw new Error("既存ルームには投入できません。");
        return;
      }
      if (!previous && this.listMembers().length)
        throw new Error("既存ルームには投入できません。");
      const issued = issueCreationId();
      const accepted = previous?.identity ??
        identity ?? {
          creator: creator.sub,
          roomId,
          requestId: issued.requestId,
          expiresAt: issued.expiresAt,
        };
      await this.ctx.storage.put("preview-identity", {
        checkpoint,
        creator: creator.sub,
        identity: accepted,
      });
      const initialized = await this.initializeCreation(accepted, creator.name);
      if (initialized === "closed")
        throw new Error("終了したサンプルは復活できません。");
      if (this.getPhase().kind === "lobby")
        this.seed(checkpoint, [creator.sub]);
      await this.ctx.storage.put("preview-initialized", true);
      await this.initializeSharedOutcome(roomId);
      await this.preserveSharedOutcome();
      await this.flushSharedOutcome();
    });
  }

  // 参加中のルームを選んだステップのサンプルで作り直す。同じURL・招待コード・参加者のまま、
  // 付箋・投票・決定は捨てて、サンプルの付箋を参加者全員に順番に配る。
  async resetToCheckpoint(
    checkpoint: PreviewCheckpoint,
    roomId: string,
    actor: SessionPayload,
  ): Promise<"ok" | "not-member" | "closed"> {
    return this.ctx.blockConcurrencyWhile(async () => {
      if (!this.isMember(actor.sub)) return "not-member";
      if (!this.isJoinable()) return "closed";
      const members = this.listMembers();
      const name = getRoomName(this.ctx.storage.sql) ?? undefined;
      for (const socket of this.ctx.getWebSockets()) {
        socket.serializeAttachment(null);
        try {
          socket.close(WS_CLOSE_PREVIEW_RESET, WS_CLOSE_PREVIEW_RESET_REASON);
        } catch {
          // 既に閉じている接続は作り直しを妨げない。
        }
      }
      await this.ctx.storage.deleteAlarm();
      await this.ctx.storage.deleteAll();
      migrateRoomStorage(
        this.ctx.storage,
        ROOM_DO_MIGRATIONS,
        LEGACY_ROOM_DO_MIGRATION_IDS,
      );
      const issued = issueCreationId();
      const identity: CreationIdentity = {
        creator: actor.sub,
        roomId,
        requestId: issued.requestId,
        expiresAt: issued.expiresAt,
      };
      await this.ctx.storage.put("preview-identity", {
        checkpoint,
        creator: actor.sub,
        identity,
      });
      const actorName = members.find((m) => m.userId === actor.sub)?.name;
      if (
        (await this.initializeCreation(
          identity,
          actorName ?? actor.name,
          name,
        )) !== "ready"
      )
        throw new Error("ルームを作り直せませんでした。");
      for (const member of members)
        if (member.userId !== actor.sub)
          await this.upsertMember(member.userId, member.name);
      this.seed(checkpoint, [
        actor.sub,
        ...members.map((m) => m.userId).filter((id) => id !== actor.sub),
      ]);
      await this.ctx.storage.put("preview-initialized", true);
      await this.initializeSharedOutcome(roomId, name);
      await this.preserveSharedOutcome();
      await this.flushSharedOutcome();
      return "ok";
    });
  }

  // 選んだステップまでのサンプルを置く。付箋は書き手を順番に割り当てる。
  private seed(checkpoint: PreviewCheckpoint, authors: string[]): void {
    const target = VERIFICATION_CHECKPOINTS.find(
      (c) => c.id === checkpoint,
    )?.phase;
    if (target?.kind !== "step") throw new Error("ステップが不正です。");
    const sql = this.ctx.storage.sql;
    this.ctx.storage.transactionSync(() => {
      for (let phase = 1; phase <= target.phase; phase++) {
        const completed = phase < target.phase;
        const notes: NoteRow[] = [];
        for (const [index, content] of VERIFICATION_NOTES[phase].entries()) {
          const author = authors[index % authors.length];
          const shared =
            completed || target.step > 2 || (target.step === 2 && index >= 3);
          const now = new Date().toISOString();
          const order = sql
            .exec<{ value: number }>(
              "UPDATE room_state SET next_note_stack_order = next_note_stack_order + 1 WHERE id = 1 RETURNING next_note_stack_order - 1 AS value",
            )
            .one();
          const note: NoteRow = {
            id: crypto.randomUUID(),
            author_id: author,
            content,
            visibility: shared ? "shared" : "private",
            color: getMemberColor(sql, author) ?? "yellow",
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
          insertNote(sql, note);
          notes.push(note);
        }
        if (completed || isResultStep(target))
          for (const kind of ["subjective", "objective"] as const) {
            for (let count = 0; count < DOT_VOTE_LIMITS[kind]; count++) {
              const note = notes[kind === "subjective" ? 0 : count + 1];
              addVoteSticker(
                sql,
                {
                  id: crypto.randomUUID(),
                  kind,
                  x: 0.2 + count * 0.25,
                  y: kind === "subjective" ? 0.25 : 0.65,
                },
                note.id,
                authors[0],
              );
            }
          }
        if (completed)
          setDecision(
            sql,
            phase,
            notes[0].id,
            authors[0],
            VERIFICATION_NOTES[phase][0],
          );
      }
      if (target.phase === 3 && target.step >= 2)
        sql.exec(
          "UPDATE room_state SET idea_map_size_level = ?, idea_map_size_initialized = 1 WHERE id = 1",
          getInitialIdeaMapSizeLevel(VERIFICATION_NOTES[3].length),
        );
      savePhase(sql, target);
    });
  }
}
