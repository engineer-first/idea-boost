import type { AccountLinkIntent } from "@/contracts/account-link";

// 連携intentとOAuthの両方が同じ開始操作を指す場合だけ連携を許可する。
export function classifyAccountLinkCallback(
  token: string | undefined,
  intent: AccountLinkIntent | null,
  state: string | null,
  oauth: { state: string; nonce: string; purpose?: "account_link" } | null,
): "link" | "failed" | "login" {
  if (intent && state && intent.state === state) {
    return oauth?.purpose === "account_link" &&
      oauth.state === state &&
      oauth.nonce === intent.nonce
      ? "link"
      : "failed";
  }
  // 最新のOAuthが連携用なら一致するintentが必須。それ以外では別stateの古いintentを無視する。
  if (oauth?.purpose === "account_link") return "failed";
  if (token && (!state || !oauth || oauth.state !== state)) return "failed";
  return "login";
}
