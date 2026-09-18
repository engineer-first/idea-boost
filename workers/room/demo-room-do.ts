// この派生クラスは demo-worker だけが export する。本番の RoomDO には
// seed・代理操作の RPC を追加しない。初期化も既存ルームには適用できない。
import {
  DEMO_CHECKPOINT_PHASES,
  DEMO_HOST,
  type DemoActionRequest,
  type DemoCheckpoint,
  type DemoStatus,
} from "../../contracts/demo";
import { isResultStep, isVotingStep } from "../../contracts/phase";
import {
  type ClientMessage,
  DOT_VOTE_LIMITS,
} from "../../contracts/room-protocol";
import { RoomBroadcaster } from "./broadcast";
import { setDecision } from "./decisions";
import {
  DEMO_BOTS,
  DEMO_GROUPS,
  DEMO_IDEA_POSITIONS,
  DEMO_MEMBERS,
  DEMO_NOTE_AUTHORS,
  DEMO_NOTE_POSITIONS,
  DEMO_NOTES,
  DEMO_OBJECTIVE_TARGETS,
  DEMO_SUBJECTIVE_TARGETS,
} from "./demo-content";
import { groupHandlers, listGroups } from "./groups";
import type { HandlerCtx } from "./handler-context";
import { getMemberColor, isHostUser } from "./members";
import { noteHandlers } from "./note-handlers";
import { findNote, insertNote, type NoteRow, toProtocolNote } from "./notes";
import { getBoardMutationForbiddenMessage, getPhase, savePhase } from "./phase";
import { RoomDO } from "./room-do";
import { addVoteSticker, countUserVotes } from "./votes";

const META_KEY = "local-demo-checkpoint";
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
      const target = DEMO_CHECKPOINT_PHASES[checkpoint];
      if (target.kind !== "step") throw new Error("初期状態が不正です。");
      this.ctx.storage.transactionSync(() => {
        for (let phase = 1; phase <= target.phase; phase++) {
          const completed = phase < target.phase || checkpoint === "complete";
          const shared = completed || target.step >= 3;
          for (let index = 0; index < DEMO_NOTES[phase].length; index++)
            this.seedNote(phase, index, shared);
          if (completed || (phase === target.phase && isResultStep(target)))
            this.seedVotes(phase);
          if (completed) {
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
        if (target.phase === 1 && target.step >= 3) {
          savePhase(this.ctx.storage.sql, { kind: "step", phase: 1, step: 3 });
          this.groupSamples();
        }
        savePhase(this.ctx.storage.sql, target);
      });
      await this.ctx.storage.put(META_KEY, checkpoint);
      for (let phase = 1; phase <= target.phase; phase++)
        await this.ctx.storage.put(`local-demo-prepared-${phase}`, true);
    });
  }

  override async webSocketMessage(
    ws: WebSocket,
    raw: ArrayBuffer | string,
  ): Promise<void> {
    // 通常ルームの動作・認可は親に任せ、デモのphase初回開始だけを補う。
    await this.ctx.blockConcurrencyWhile(async () => {
      const before = getPhase(this.ctx.storage.sql);
      await super.webSocketMessage(ws, raw);
      const after = getPhase(this.ctx.storage.sql);
      if (
        after.kind !== "step" ||
        after.step !== 1 ||
        (before.kind === "step" && before.phase === after.phase) ||
        !(await this.ctx.storage.get(META_KEY)) ||
        (await this.ctx.storage.get(`local-demo-prepared-${after.phase}`))
      )
        return;
      const notes: NoteRow[] = [];
      this.ctx.storage.transactionSync(() => {
        for (let index = 0; index < DEMO_NOTES[after.phase].length; index++) {
          if (!findNote(this.ctx.storage.sql, noteId(after.phase, index)))
            notes.push(this.seedNote(after.phase, index, false));
        }
      });
      await this.ctx.storage.put(`local-demo-prepared-${after.phase}`, true);
      const broadcaster = new RoomBroadcaster(this.ctx);
      for (const note of notes)
        broadcaster.broadcastNote((viewerId) => ({
          type: "note:inserted",
          note: toProtocolNote(this.ctx.storage.sql, note, viewerId),
        }));
    });
  }

  private groupSamples(): void {
    // 全サンプル共有が前提。未共有ホストを代理publishしたり部分配置しない。
    for (let index = 0; index < DEMO_NOTES[1].length; index++)
      if (
        findNote(this.ctx.storage.sql, noteId(1, index))?.visibility !==
        "shared"
      )
        throw new Error(
          "先に自分の2枚と他4人のサンプルを共有してください。足りない場合は見せ場をやり直してください。",
        );
    for (const group of DEMO_GROUPS)
      for (const [positionIndex, index] of group.indexes.entries())
        this.apply(DEMO_HOST.sub, {
          type: "note:move",
          noteId: noteId(1, index),
          ...group.positions[positionIndex],
        });
    for (const sample of DEMO_GROUPS) {
      const ids = sample.indexes.map((index) => noteId(1, index));
      const group = listGroups(this.ctx.storage.sql).find(
        (group) =>
          group.noteIds.length === ids.length &&
          ids.every((id) => group.noteIds.includes(id)),
      );
      if (group) {
        this.apply(DEMO_HOST.sub, {
          type: "group:update-name",
          groupId: group.id,
          name: sample.name,
        });
      } else {
        const now = new Date().toISOString();
        this.apply(DEMO_HOST.sub, {
          type: "group:create",
          group: {
            id: crypto.randomUUID(),
            name: sample.name,
            noteIds: ids,
            createdAt: now,
            updatedAt: now,
          },
        });
      }
    }
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
      // 準備はフェーズ開始時だけ。削除されたサンプルは復活させない。
      for (let index = 0; index < DEMO_NOTES[phase.phase].length; index++) {
        const member = DEMO_MEMBERS[DEMO_NOTE_AUTHORS[index]];
        if (member.userId === DEMO_HOST.sub) continue;
        const note = findNote(this.ctx.storage.sql, noteId(phase.phase, index));
        if (note?.visibility === "private")
          this.apply(member.userId, {
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
    } else if (
      request.action === "group" &&
      phase.phase === 1 &&
      phase.step === 3
    ) {
      this.groupSamples();
    } else if (request.action === "vote" && isVotingStep(phase)) {
      // 固定サンプルの順序を使う。任意の手入力付箋やID順には投票を委ねない。
      const candidates = DEMO_NOTES[phase.phase]
        .map((_, index) =>
          findNote(this.ctx.storage.sql, noteId(phase.phase, index)),
        )
        .filter((note): note is NoteRow => note?.visibility === "shared");
      if (!candidates.length)
        throw new Error(
          "共有されたデモのサンプル付箋がありません。見せ場をやり直してください。",
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
                : candidates[targetIndex % candidates.length].id;
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
          : phase.kind === "step" && phase.phase === 1 && phase.step === 3
            ? ["group"]
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

  private seedNote(phase: number, index: number, shared: boolean): NoteRow {
    const member = DEMO_MEMBERS[DEMO_NOTE_AUTHORS[index]];
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
    return note;
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
    message: Extract<
      ClientMessage,
      {
        type:
          | "note:publish"
          | "note:vote"
          | "note:move"
          | "group:create"
          | "group:update-name";
      }
    >,
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
    else if (message.type === "note:vote")
      noteHandlers["note:vote"](ctx, message);
    else if (message.type === "note:move")
      noteHandlers["note:move"](ctx, message);
    else if (message.type === "group:create")
      groupHandlers["group:create"](ctx, message);
    else groupHandlers["group:update-name"](ctx, message);
  }
}
