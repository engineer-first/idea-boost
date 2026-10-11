import {
  getInitialIdeaMapSizeLevel,
  NOTE_DEFAULT_FONT_SIZE,
} from "../../contracts/board";
import { isResultStep } from "../../contracts/phase";
import type { PreviewCheckpoint } from "../../contracts/preview";
import { issueCreationId } from "../../contracts/room-creation";
import { DOT_VOTE_LIMITS } from "../../contracts/room-protocol";
import type { SessionPayload } from "../../contracts/session";
import { VERIFICATION_CHECKPOINTS } from "../../contracts/verification";
import { setDecision } from "./decisions";
import { getMemberColor } from "./members";
import { insertNote, type NoteRow } from "./notes";
import { savePhase } from "./phase";
import { RoomDO } from "./room-do";
import { VERIFICATION_NOTES } from "./verification-content";
import { addVoteSticker } from "./votes";

// Preview専用namespaceだけで公開。本番RoomDOとローカル固定ユーザー検証を変えない。
export class PreviewRoomDO extends RoomDO {
  async initializePreview(
    checkpoint: PreviewCheckpoint,
    roomId: string,
    creator: SessionPayload,
  ): Promise<void> {
    await this.ctx.blockConcurrencyWhile(async () => {
      if (
        this.listMembers().length ||
        (await this.ctx.storage.get("preview-initialized"))
      )
        throw new Error("既存ルームには投入できません。");
      const issued = issueCreationId();
      await this.initializeCreation(
        {
          creator: creator.sub,
          roomId,
          requestId: issued.requestId,
          expiresAt: issued.expiresAt,
        },
        creator.name,
      );
      const target = VERIFICATION_CHECKPOINTS.find(
        (c) => c.id === checkpoint,
      )?.phase;
      if (target?.kind !== "step") throw new Error("ステップが不正です。");
      this.ctx.storage.transactionSync(() => {
        for (let phase = 1; phase <= target.phase; phase++) {
          const completed = phase < target.phase;
          const noteIds: string[] = [];
          for (const [index, content] of VERIFICATION_NOTES[phase].entries()) {
            const shared =
              completed || target.step > 2 || (target.step === 2 && index >= 3);
            const now = new Date().toISOString();
            const order = this.ctx.storage.sql
              .exec<{ value: number }>(
                "UPDATE room_state SET next_note_stack_order = next_note_stack_order + 1 WHERE id = 1 RETURNING next_note_stack_order - 1 AS value",
              )
              .one();
            const note: NoteRow = {
              id: crypto.randomUUID(),
              author_id: creator.sub,
              content,
              visibility: shared ? "shared" : "private",
              color:
                getMemberColor(this.ctx.storage.sql, creator.sub) ?? "yellow",
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
            noteIds.push(note.id);
          }
          if (completed || isResultStep(target))
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
                  noteIds[kind === "subjective" ? 0 : count + 1],
                  creator.sub,
                );
            }
          if (completed)
            setDecision(
              this.ctx.storage.sql,
              phase,
              noteIds[0],
              creator.sub,
              VERIFICATION_NOTES[phase][0],
            );
        }
        if (target.phase === 3 && target.step >= 2)
          this.ctx.storage.sql.exec(
            "UPDATE room_state SET idea_map_size_level = ?, idea_map_size_initialized = 1 WHERE id = 1",
            getInitialIdeaMapSizeLevel(VERIFICATION_NOTES[3].length),
          );
        savePhase(this.ctx.storage.sql, target);
      });
      await this.ctx.storage.put("preview-initialized", true);
      await this.initializeSharedOutcome(roomId);
      await this.preserveSharedOutcome();
      await this.flushSharedOutcome();
    });
  }
}
