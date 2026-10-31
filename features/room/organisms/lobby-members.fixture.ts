import { NOTE_COLOR_PALETTE } from "@/contracts/room-protocol";
import { buildMembers } from "@/contracts/room-protocol.fixture";
import type { Member } from "../logic/room-reducer";

const NAMES = [
  "はな",
  "たろう",
  "りん",
  "ゆう",
  "さくら",
  "けん",
  "あおい",
  "そうた",
  "みお",
  "だいき",
  "ゆい",
  "はると",
  "なお",
  "まい",
  "りく",
  "えま",
  "かい",
  "ひなた",
  "しおり",
  "つばさ",
];

export function buildLobbyMembers(
  count: number,
  currentUserId: string,
): Member[] {
  return buildMembers(count, currentUserId).map((member, index) => ({
    ...member,
    name: NAMES[index] ?? member.name,
    color: NOTE_COLOR_PALETTE[index % NOTE_COLOR_PALETTE.length],
  }));
}
