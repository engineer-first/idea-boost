// 固定シナリオ。テスト fixture ではなく、ローカルデモで使う説明用コンテンツ。
import { NOTE_SPAWN_X_MIN, NOTE_SPAWN_Y_MIN } from "../../contracts/board";
import { DEMO_HOST } from "../../contracts/demo";
export const DEMO_MEMBERS = [
  { userId: DEMO_HOST.sub, name: DEMO_HOST.name },
  { userId: "d0000000-0000-4000-8000-000000000002", name: "あおい" },
  { userId: "d0000000-0000-4000-8000-000000000003", name: "けんた" },
  { userId: "d0000000-0000-4000-8000-000000000004", name: "みさき" },
  { userId: "d0000000-0000-4000-8000-000000000005", name: "りく" },
] as const;
export const DEMO_BOTS = DEMO_MEMBERS.slice(1);
export const DEMO_NOTES: Record<number, readonly string[]> = {
  1: [
    "空きコマに一緒に勉強する仲間が見つからない",
    "友達の空き時間がわからず、声をかけるのをためらう",
    "授業の質問を気軽にできる相手がほしい",
    "学食が混んでいて昼休みが足りない",
    "課題の締切を見落としてしまう",
  ],
  2: [
    "どうすれば、空きコマに気軽に学び合う仲間と出会えるだろう？",
    "どうすれば、今いっしょに勉強できる人がわかるだろう？",
    "どうすれば、初対面でも質問しやすくなるだろう？",
    "どうすれば、短い空き時間も学びに使えるだろう？",
    "どうすれば、誘う負担を減らせるだろう？",
  ],
  3: [
    "空きコマ勉強マッチ：今いる場所と学びたい科目で仲間を探す",
    "いま勉強中ボタン：参加歓迎の人をキャンパスマップに表示",
    "15分質問カフェ：短い質問から学び合える募集ボード",
    "科目別の匿名質問箱：気軽に質問して助け合う",
    "空き時間カレンダー共有：友達と予定を合わせる",
  ],
};

// 主観票と客観票を分散させ、推奨案以外にも比較できる支持を残す。
export const DEMO_SUBJECTIVE_TARGETS = [0, 0, 1, 0, 2] as const;
export const DEMO_OBJECTIVE_TARGETS = [
  [0, 0, 1],
  [0, 1, 2],
  [0, 0, 3],
  [0, 2, 3],
  [0, 1, 4],
] as const;

// 通常ボードの初期カメラ中心の周囲。ホスト中央、他4人を左右2段に配置。
export const DEMO_NOTE_POSITIONS = [
  { x: NOTE_SPAWN_X_MIN, y: NOTE_SPAWN_Y_MIN },
  { x: NOTE_SPAWN_X_MIN - 240, y: NOTE_SPAWN_Y_MIN - 90 },
  { x: NOTE_SPAWN_X_MIN + 240, y: NOTE_SPAWN_Y_MIN - 90 },
  { x: NOTE_SPAWN_X_MIN - 240, y: NOTE_SPAWN_Y_MIN + 90 },
  { x: NOTE_SPAWN_X_MIN + 240, y: NOTE_SPAWN_Y_MIN + 90 },
] as const;

export const DEMO_IDEA_POSITIONS = [
  { x: 65, y: 80 },
  { x: 35, y: 68 },
  { x: 50, y: 56 },
  { x: 65, y: 44 },
  { x: 80, y: 32 },
] as const;
