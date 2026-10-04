import { describe, expect, it } from "vitest";
import { CANVAS_COORDINATE_LIMIT } from "./board";
import { parseClientMessage } from "./room-protocol";

const operationId = "55555555-5555-4555-8555-555555555555";
const noteId = "33333333-3333-4333-8333-333333333333";
describe("move transaction boundary", () => {
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
