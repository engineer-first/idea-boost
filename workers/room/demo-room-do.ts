// この派生クラスは demo-worker だけが export する。本番の RoomDO には
// seed・代理操作の RPC を追加しない。初期化も既存ルームには適用できない。
import {
  DEMO_HOST,
  type DemoActionRequest,
  type DemoCheckpoint,
  type DemoStatus,
} from "../../contracts/demo";
import { isVotingStep, type RoomPhase } from "../../contracts/phase";
import {
  type ClientMessage,
  DOT_VOTE_LIMITS,
} from "../../contracts/room-protocol";
import { RoomBroadcaster } from "./broadcast";
import { setDecision } from "./decisions";
import {
  DEMO_BOTS,
  DEMO_IDEA_POSITIONS,
  DEMO_MEMBERS,
  DEMO_NOTE_POSITIONS,
  DEMO_NOTES,
  DEMO_OBJECTIVE_TARGETS,
  DEMO_SUBJECTIVE_TARGETS,
} from "./demo-content";
import type { HandlerCtx } from "./handler-context";
import { getMemberColor, isHostUser } from "./members";
import { noteHandlers } from "./note-handlers";
import { findNote, insertNote, type NoteRow } from "./notes";
import { getBoardMutationForbiddenMessage, getPhase, savePhase } from "./phase";
import { RoomDO } from "./room-do";
import { addVoteSticker, countUserVotes } from "./votes";

const META_KEY = "local-demo-checkpoint";
const PHASES: Record<DemoCheckpoint, RoomPhase> = {
  start: { kind: "step", phase: 1, step: 1 },
  share: { kind: "step", phase: 1, step: 2 },
  vote: { kind: "step", phase: 1, step: 4 },
  ideas: { kind: "step", phase: 3, step: 3 },
  complete: { kind: "step", phase: 3, step: 5 },
};
function noteId(phase: number, index: number): string {
  return `d1000000-0000-4000-8000-${String(phase * 10 + index + 1).padStart(12, "0")}`;
}
export class DemoRoomDO extends RoomDO {
  async initializeDemo(checkpoint: DemoCheckpoint): Promise<void> {
    await this.ctx.blockConcurrencyWhile(async () => {
      if (
        this.listMembers().length > 0 ||
        (await this.ctx.storage.get(META_KEY))
      )
        throw new Error("既存ルームはデモで変更できません。");
      await this.initializeNewRoom(DEMO_HOST.sub, DEMO_HOST.name);
      for (const member of DEMO_BOTS)
        await this.upsertMember(member.userId, member.name);
      const target = PHASES[checkpoint];
      if (target.kind !== "step") throw new Error("初期状態が不正です。");
      this.ctx.storage.transactionSync(() => {
        for (let phase = 1; phase <= target.phase; phase++) {
          const completed = phase < target.phase || checkpoint === "complete";
          const shared = completed || target.step >= 3;
          for (let index = 0; index < DEMO_MEMBERS.length; index++)
            this.seedNote(phase, index, shared);
          if (completed) {
            this.seedVotes(phase);
            const chosen = findNote(this.ctx.storage.sql, noteId(phase, 0));
            if (!chosen) throw new Error("デモの採用候補がありません。");
            setDecision(
              this.ctx.storage.sql,
              phase,
              chosen.id,
              DEMO_HOST.sub,
              chosen.content,
            );
          }
        }
        savePhase(this.ctx.storage.sql, target);
      });
      await this.ctx.storage.put(META_KEY, checkpoint);
    });
  }

  async demoStatus(userId: string): Promise<DemoStatus | null> {
    const checkpoint = await this.ctx.storage.get<DemoCheckpoint>(META_KEY);
    if (
      !checkpoint ||
      userId !== DEMO_HOST.sub ||
      !isHostUser(this.ctx.storage.sql, userId)
    )
      return null;
    return this.status(checkpoint);
  }

  async demoAction(
    userId: string,
    request: DemoActionRequest,
  ): Promise<DemoStatus | null> {
    const checkpoint = await this.ctx.storage.get<DemoCheckpoint>(META_KEY);
    if (
      !checkpoint ||
      userId !== DEMO_HOST.sub ||
      !isHostUser(this.ctx.storage.sql, userId)
    )
      return null;
    const phase = getPhase(this.ctx.storage.sql);
    if (
      phase.kind !== "step" ||
      phase.phase !== request.phase ||
      phase.step !== request.step
    )
      throw new Error(
        "場面が変わりました。最新の状態でもう一度操作してください。",
      );
    if (request.action === "share" && phase.step === 2) {
      // 次フェーズの未共有付箋は通常進行で破棄されるため、合図の時点で
      // 各デモ参加者の固定下書きを用意し、通常と同じ publish 認可を通す。
      for (let index = 1; index < DEMO_MEMBERS.length; index++) {
        let note = findNote(this.ctx.storage.sql, noteId(phase.phase, index));
        if (!note) {
          this.seedNote(phase.phase, index, false);
          note = findNote(this.ctx.storage.sql, noteId(phase.phase, index));
        }
        if (note?.visibility === "private")
          this.apply(DEMO_MEMBERS[index].userId, {
            type: "note:publish",
            noteId: note.id,
            x:
              phase.phase === 3
                ? DEMO_IDEA_POSITIONS[index].x
                : DEMO_NOTE_POSITIONS[index].x,
            y:
              phase.phase === 3
                ? DEMO_IDEA_POSITIONS[index].y
                : DEMO_NOTE_POSITIONS[index].y,
          });
      }
    } else if (request.action === "vote" && isVotingStep(phase)) {
      const candidates = this.ctx.storage.sql
        .exec(
          "SELECT id FROM notes WHERE phase = ?1 AND visibility = 'shared' ORDER BY id",
          phase.phase,
        )
        .toArray();
      if (!candidates.length)
        throw new Error(
          "共有された付箋がありません。見せ場をやり直してください。",
        );
      for (const [botIndex, bot] of DEMO_BOTS.entries())
        for (const kind of ["subjective", "objective"] as const) {
          while (
            countUserVotes(
              this.ctx.storage.sql,
              bot.userId,
              kind,
              phase.phase,
            ) < DOT_VOTE_LIMITS[kind]
          ) {
            const count = countUserVotes(
              this.ctx.storage.sql,
              bot.userId,
              kind,
              phase.phase,
            );
            const targetIndex =
              kind === "subjective"
                ? DEMO_SUBJECTIVE_TARGETS[botIndex + 1]
                : DEMO_OBJECTIVE_TARGETS[botIndex + 1][count];
            const recommended = findNote(
              this.ctx.storage.sql,
              noteId(phase.phase, targetIndex),
            );
            const target =
              recommended?.visibility === "shared"
                ? recommended.id
                : String(candidates[targetIndex % candidates.length].id);
            this.apply(bot.userId, { type: "note:vote", noteId: target, kind });
          }
        }
    } else throw new Error("この場面ではその合図を実行できません。");
    return this.status(checkpoint);
  }

  private status(checkpoint: DemoCheckpoint): DemoStatus {
    const phase = getPhase(this.ctx.storage.sql);
    const phaseNumber = phase.kind === "step" ? phase.phase : 1;
    const sql = this.ctx.storage.sql;
    return {
      checkpoint,
      phase,
      availableActions:
        phase.kind === "step" && phase.step === 2
          ? ["share"]
          : isVotingStep(phase)
            ? ["vote"]
            : [],
      sharedCount: DEMO_BOTS.filter(
        (bot) =>
          sql
            .exec(
              "SELECT id FROM notes WHERE phase = ?1 AND author_id = ?2 AND visibility = 'shared'",
              phaseNumber,
              bot.userId,
            )
            .toArray().length > 0,
      ).length,
      votedCount: DEMO_BOTS.filter((bot) =>
        (["subjective", "objective"] as const).every(
          (kind) =>
            countUserVotes(sql, bot.userId, kind, phaseNumber) >=
            DOT_VOTE_LIMITS[kind],
        ),
      ).length,
    };
  }

  private seedNote(phase: number, index: number, shared: boolean): void {
    const member = DEMO_MEMBERS[index];
    const timestamp = new Date().toISOString();
    const note: NoteRow = {
      id: noteId(phase, index),
      author_id: member.userId,
      content: DEMO_NOTES[phase][index],
      visibility: shared ? "shared" : "private",
      color: getMemberColor(this.ctx.storage.sql, member.userId) ?? "yellow",
      x:
        phase === 3
          ? DEMO_IDEA_POSITIONS[index].x
          : DEMO_NOTE_POSITIONS[index].x,
      y:
        phase === 3
          ? DEMO_IDEA_POSITIONS[index].y
          : DEMO_NOTE_POSITIONS[index].y,
      created_at: timestamp,
      updated_at: timestamp,
      phase,
    };
    insertNote(this.ctx.storage.sql, note);
  }

  private seedVotes(phase: number): void {
    for (const [memberIndex, member] of DEMO_MEMBERS.entries())
      for (const kind of ["subjective", "objective"] as const)
        for (let count = 0; count < DOT_VOTE_LIMITS[kind]; count++) {
          addVoteSticker(
            this.ctx.storage.sql,
            {
              id: crypto.randomUUID(),
              kind,
              x: 0.15 + count * 0.2,
              y: kind === "subjective" ? 0.25 : 0.65,
            },
            noteId(
              phase,
              kind === "subjective"
                ? DEMO_SUBJECTIVE_TARGETS[memberIndex]
                : DEMO_OBJECTIVE_TARGETS[memberIndex][count],
            ),
            member.userId,
          );
        }
  }

  private apply(
    userId: string,
    message: Extract<ClientMessage, { type: "note:publish" | "note:vote" }>,
  ): void {
    const forbidden = getBoardMutationForbiddenMessage(
      getPhase(this.ctx.storage.sql),
      message,
    );
    if (forbidden) throw new Error(forbidden);
    // publish/vote は送信元ソケットを参照しない。返信は呼出元 API へ返し、
    // 接続中の本物の WS へは通常の RoomBroadcaster（visibleTo）で届ける。
    const ctx: HandlerCtx = {
      sql: this.ctx.storage.sql,
      storage: this.ctx.storage,
      userId,
      ws: new WebSocketPair()[1],
      reply: (reply) => {
        if (reply.type === "error") throw new Error(reply.message);
      },
      broadcaster: new RoomBroadcaster(this.ctx),
      refreshSnapshots: () => {},
    };
    if (message.type === "note:publish")
      noteHandlers["note:publish"](ctx, message);
    else noteHandlers["note:vote"](ctx, message);
  }
}
