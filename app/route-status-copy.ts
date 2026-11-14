export type RouteStatusKind = "not_found" | "error";

export const routeStatusCopy = {
  not_found: {
    title: "ページが見つかりません | Idea Boost",
    heading: "ページが見つかりません",
    description:
      "URLが間違っているか、ページが移動・削除された可能性があります。",
  },
  error: {
    title: "ページを表示できません | Idea Boost",
    heading: "ページを表示できませんでした",
    description: "時間をおいて、もう一度お試しください。",
  },
} as const satisfies Record<
  RouteStatusKind,
  { title: string; heading: string; description: string }
>;

export const routeStatusActionCopy = {
  topLabel: "トップへ戻る",
  backLabel: "前の画面へ戻る",
} as const;
