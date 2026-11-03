import { describe, expect, it } from "vitest";
import { parseClientMessage } from "./room-protocol";

const boundaries = [
  {
    name: "host:transfer",
    parse: parseClientMessage,
    message: (id: unknown) => ({
      type: "host:transfer",
      targetUserId: id,
      expectedHostRevision: 0,
    }),
  },
];

describe.each(boundaries)("$name の既存 ID 互換性", ({ parse, message }) => {
  it.each([
    "11111111-1111-1111-1111-111111111111",
    "ABCDEFAB-CDEF-ABCD-EFAB-CDEFABCDEFAB",
    "00000000-0000-0000-0000-000000000000",
    "123e4567-e89b-42d3-a456-426614174000",
  ])("8-4-4-4-12 の既存 ID %s を変更せず受け入れる", (id) => {
    const input = message(id);
    expect(parse(JSON.stringify(input))).toEqual(input);
  });

  it.each([
    "",
    "not-a-uuid",
    "11111111111111111111111111111111",
    "g1111111-1111-1111-1111-111111111111",
    "11111111-1111-1111-1111-11111111111",
    " 11111111-1111-1111-1111-111111111111",
    "11111111-1111-1111-1111-111111111111/ws",
    1,
    {},
  ])("不正な形式 %j は拒否する", (id) => {
    expect(parse(JSON.stringify(message(id)))).toBeNull();
  });
});
