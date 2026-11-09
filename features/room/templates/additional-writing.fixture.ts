import { buildNote } from "@/contracts/room-protocol.fixture";

export const ADDITIONAL_WRITING_USER = "11111111-1111-4111-8111-111111111111";
export const ADDITIONAL_WRITING_PRIVATE_NOTES = Array.from(
  { length: 12 },
  (_, index) =>
    buildNote({
      id: `additional-draft-${index}`,
      authorId: ADDITIONAL_WRITING_USER,
      visibility: "private",
      content: `未共有の下書き ${index + 1}`,
      contentRevision: index === 9 ? 1 : 0,
      updatedAt: index === 9 ? "2026-11-06T05:00:00Z" : "2026-11-06T04:00:00Z",
    }),
);
export function additionalWritingSharedNotes(phase: 1 | 2 | 3) {
  return [
    buildNote({
      id: "reference-one",
      content:
        "共有した考えを読みながら、新しい考えを書き足す。\n全文表示でも本文を書き換えない。",
      x: phase === 3 ? 25 : 160,
      y: phase === 3 ? 75 : 160,
    }),
    buildNote({
      id: "reference-two",
      content: "パネルの下にある考えも、表示位置を移動して確認する。",
      x: phase === 3 ? 70 : 650,
      y: phase === 3 ? 20 : 550,
    }),
  ];
}
