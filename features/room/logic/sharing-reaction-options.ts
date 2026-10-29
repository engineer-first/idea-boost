import type { SharingReactionKind } from "@/contracts/sharing-reactions";

type SharingReactionOption = {
  label: string;
  sendLabel: string;
  tooltip: string;
  imageSrc: string;
};

export const SHARING_REACTION_OPTIONS: Readonly<
  Record<SharingReactionKind, SharingReactionOption>
> = {
  like: {
    label: "いいね",
    sendLabel: "いいねを送る",
    tooltip: "いいね",
    imageSrc: "/reactions/like-3d.webp",
  },
  clap: {
    label: "拍手",
    sendLabel: "拍手を送る",
    tooltip: "拍手",
    imageSrc: "/reactions/clap-3d.webp",
  },
  surprised: {
    label: "おお！",
    sendLabel: "おお！を送る",
    tooltip: "おお！",
    imageSrc: "/reactions/surprised-3d.webp",
  },
  insight: {
    label: "なるほど",
    sendLabel: "なるほどを送る",
    tooltip: "なるほど",
    imageSrc: "/reactions/insight-3d.webp",
  },
  question: {
    label: "どうして？",
    sendLabel: "どうして？のリアクションを送る",
    tooltip: "どうして？",
    imageSrc: "/reactions/question-3d.webp",
  },
};
