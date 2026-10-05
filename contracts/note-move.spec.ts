import { describe, expect, it } from "vitest";
import { CANVAS_COORDINATE_LIMIT } from "./board";
import { parseClientMessage, parseServerMessage } from "./room-protocol";

const operationId = "55555555-5555-4555-8555-555555555555";
const noteId = "33333333-3333-4333-8333-333333333333";
describe("move transaction boundary", () => {
  it("分類の版だけの通知を受理し、非公開分類の内容は拒否する", () => {
    const message = { type: "group:revision", groupRevision: 3 };
    expect(parseServerMessage(JSON.stringify(message))).toEqual(message);
    expect(
      parseServerMessage(JSON.stringify({ ...message, groupId: noteId })),
    ).toBeNull();
  });
  it("保存しないstart/preview/cancelとcommit/結果照会を別メッセージとして受理する", () => {
    for (const message of [
      {
        type: "note:move:start",
        operationId,
        expectedPhaseRevision: 1,
        expectedGroupRevision: 0,
        expectedMapRevision: 0,
        coordinateSpace: "canvas",
        targets: [{ noteId, positionRevision: 0, visibilityRevision: 0 }],
      },
      { type: "note:move:preview", operationId, delta: { x: 20, y: 0 } },
      { type: "note:move:cancel", operationId },
      { type: "note:move:commit", operationId, delta: { x: 20, y: 0 } },
      { type: "note:move:status", operationId },
    ])
      expect(parseClientMessage(JSON.stringify(message))).toEqual(message);
  });
});

it("有効なcanvasの両端間deltaを受理し位置上限より大きな異常deltaを拒否する", () => {
  const message = {
    type: "note:move:commit",
    operationId,
    delta: { x: 2 * CANVAS_COORDINATE_LIMIT, y: -2 * CANVAS_COORDINATE_LIMIT },
  };
  expect(parseClientMessage(JSON.stringify(message))).toEqual(message);
  expect(
    parseClientMessage(
      JSON.stringify({
        ...message,
        delta: { x: 2 * CANVAS_COORDINATE_LIMIT + 1, y: 0 },
      }),
    ),
  ).toBe(null);
});

it("peer途中位置境界は本文・票・分類を持たず、clientの権威字段を拒否する", () => {
  const preview = {
    type: "notes:move-preview",
    operationId,
    userId: operationId,
    phaseRevision: 0,
    sequence: 1,
    leaseMs: 15000,
    positions: [
      { noteId, x: 200, y: 100, positionRevision: 0, visibilityRevision: 0 },
    ],
  };
  expect(parseServerMessage(JSON.stringify(preview))).toEqual(preview);
  expect(
    parseServerMessage(JSON.stringify({ ...preview, content: "secret" })),
  ).toBe(null);
  expect(
    parseServerMessage(
      JSON.stringify({
        ...preview,
        positions: [{ ...preview.positions[0], dotVotes: {} }],
      }),
    ),
  ).toBe(null);
  expect(
    parseClientMessage(
      JSON.stringify({
        type: "note:move:preview",
        operationId,
        delta: { x: 20, y: 0 },
        authorId: operationId,
      }),
    ),
  ).toBe(null);
});

it("peer previewはstartと同じ256枚まで受信できる", () => {
  const preview = {
    type: "notes:move-preview",
    operationId,
    userId: operationId,
    phaseRevision: 0,
    sequence: 1,
    leaseMs: 15000,
    positions: Array.from({ length: 256 }, (_, index) => ({
      noteId: `00000000-0000-4000-8000-${index.toString().padStart(12, "0")}`,
      x: 100,
      y: 100,
      positionRevision: 0,
      visibilityRevision: 0,
    })),
  };
  expect(parseServerMessage(JSON.stringify(preview))).toEqual(preview);
});
