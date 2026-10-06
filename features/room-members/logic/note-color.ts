import type { NoteColor } from "@/contracts/room-protocol";

// 保存・通信上の色IDは保ち、通常表示の付箋が白背景に埋もれない色へ置き換える。
// 複数色の本文は共通の暗色にして、付箋・アバター・カーソル名のコントラストを保つ。
const FOREGROUND_COLOR = "#0F172A";
const AVATAR_BORDER_CLASS_NAME = "border-transparent";

export const NOTE_COLOR_STYLES: Record<
  NoteColor,
  { backgroundColor: string; foregroundColor: string; avatarClassName: string }
> = {
  yellow: {
    backgroundColor: "#F4D35E",
    foregroundColor: FOREGROUND_COLOR,
    avatarClassName: AVATAR_BORDER_CLASS_NAME,
  },
  green: {
    backgroundColor: "#94C97E",
    foregroundColor: FOREGROUND_COLOR,
    avatarClassName: AVATAR_BORDER_CLASS_NAME,
  },
  blue: {
    backgroundColor: "#88BDF2",
    foregroundColor: FOREGROUND_COLOR,
    avatarClassName: AVATAR_BORDER_CLASS_NAME,
  },
  pink: {
    backgroundColor: "#F39AB5",
    foregroundColor: FOREGROUND_COLOR,
    avatarClassName: AVATAR_BORDER_CLASS_NAME,
  },
  orange: {
    backgroundColor: "#F5AA63",
    foregroundColor: FOREGROUND_COLOR,
    avatarClassName: AVATAR_BORDER_CLASS_NAME,
  },
  purple: {
    backgroundColor: "#B6A0E2",
    foregroundColor: FOREGROUND_COLOR,
    avatarClassName: AVATAR_BORDER_CLASS_NAME,
  },
  red: {
    backgroundColor: "#E8817B",
    foregroundColor: FOREGROUND_COLOR,
    avatarClassName: AVATAR_BORDER_CLASS_NAME,
  },
  lime: {
    backgroundColor: "#C3D76B",
    foregroundColor: FOREGROUND_COLOR,
    avatarClassName: AVATAR_BORDER_CLASS_NAME,
  },
  teal: {
    backgroundColor: "#6BC7BC",
    foregroundColor: FOREGROUND_COLOR,
    avatarClassName: AVATAR_BORDER_CLASS_NAME,
  },
  cyan: {
    backgroundColor: "#8BD5E5",
    foregroundColor: FOREGROUND_COLOR,
    avatarClassName: AVATAR_BORDER_CLASS_NAME,
  },
  indigo: {
    backgroundColor: "#8996D8",
    foregroundColor: FOREGROUND_COLOR,
    avatarClassName: AVATAR_BORDER_CLASS_NAME,
  },
  violet: {
    backgroundColor: "#CDACEA",
    foregroundColor: FOREGROUND_COLOR,
    avatarClassName: AVATAR_BORDER_CLASS_NAME,
  },
  fuchsia: {
    backgroundColor: "#D991CF",
    foregroundColor: FOREGROUND_COLOR,
    avatarClassName: AVATAR_BORDER_CLASS_NAME,
  },
  rose: {
    backgroundColor: "#DB7698",
    foregroundColor: FOREGROUND_COLOR,
    avatarClassName: AVATAR_BORDER_CLASS_NAME,
  },
  amber: {
    backgroundColor: "#DDB65A",
    foregroundColor: FOREGROUND_COLOR,
    avatarClassName: AVATAR_BORDER_CLASS_NAME,
  },
  emerald: {
    backgroundColor: "#66B994",
    foregroundColor: FOREGROUND_COLOR,
    avatarClassName: AVATAR_BORDER_CLASS_NAME,
  },
  sky: {
    backgroundColor: "#65ACCE",
    foregroundColor: FOREGROUND_COLOR,
    avatarClassName: AVATAR_BORDER_CLASS_NAME,
  },
  slate: {
    backgroundColor: "#A993C6",
    foregroundColor: FOREGROUND_COLOR,
    avatarClassName: AVATAR_BORDER_CLASS_NAME,
  },
  stone: {
    backgroundColor: "#C69B72",
    foregroundColor: FOREGROUND_COLOR,
    avatarClassName: AVATAR_BORDER_CLASS_NAME,
  },
  // zinc は旧IDとの互換性を保ち、表示色をオリーブへ変更する。
  zinc: {
    backgroundColor: "#9BAE68",
    foregroundColor: FOREGROUND_COLOR,
    avatarClassName: AVATAR_BORDER_CLASS_NAME,
  },
};

// 表示色を文字でも識別し、同じ呼び名や色の見分けにくさを補う。
export const NOTE_COLOR_NAMES: Record<NoteColor, string> = {
  yellow: "黄色",
  green: "緑色",
  blue: "青色",
  pink: "ピンク",
  orange: "オレンジ",
  purple: "紫色",
  red: "赤色",
  lime: "黄緑",
  teal: "青緑",
  cyan: "水色",
  indigo: "藍色",
  violet: "すみれ色",
  fuchsia: "赤紫",
  rose: "ローズ",
  amber: "琥珀色",
  emerald: "エメラルド",
  sky: "空色",
  slate: "藤色",
  stone: "茶色",
  zinc: "オリーブ",
};
