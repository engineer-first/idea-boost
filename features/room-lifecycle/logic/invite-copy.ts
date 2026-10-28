export type InviteStatusKind =
  | "invalid"
  | "not_found"
  | "ended"
  | "unavailable";

export const inviteCopy = {
  retryLabel: "もう一度読み込む",
  homeLabel: "ホームへ戻る",
  codeLabel: "招待コード",
  codeError: "英数字6桁で入力してください。",
  loadingHeading: "招待を確認しています",
} as const;

export const inviteStatusCopy = {
  invalid: {
    heading: "招待コードの形式が正しくありません",
    description:
      "招待コードは英数字6桁です。届いたリンクやコードを確認してください。",
  },
  not_found: {
    heading: "招待されたルームが見つかりません",
    description:
      "コードが間違っているか、ルームが解散された可能性があります。招待元に確認してください。",
  },
  ended: {
    heading: "このルームは終了しています",
    description: "新しい招待をホストに確認してください。",
  },
  unavailable: {
    heading: "ルームの情報を取得できませんでした",
    description: "通信状況を確認して、もう一度お試しください。",
  },
} as const satisfies Record<
  InviteStatusKind,
  { heading: string; description: string }
>;

export const inviteGuestNameCopy = {
  heading: "招待されたルームに参加します",
  description: "名前を設定すると、ルームの確認画面に進みます。",
} as const;
