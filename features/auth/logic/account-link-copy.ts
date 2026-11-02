import {
  type AccountLinkResult,
  AccountLinkResultSchema,
} from "@/contracts/account-link";

const messages: Record<AccountLinkResult, string> = {
  linked:
    "Googleと連携しました。別の端末でもGoogleでログインすると、この記録を見返せます。",
  cancelled: "Googleとの連携をやめました。このまま引き続き使えます。",
  failed:
    "Googleと連携できませんでした。いまの記録はそのまま残っています。もう一度お試しください。",
  google_account_in_use:
    "このGoogleアカウントは別の記録で使われているため連携できませんでした。いまの記録はそのまま残っています。別のGoogleアカウントなら連携できます。",
  already_linked: "この記録はすでに別のGoogleアカウントと連携しています。",
  session_changed:
    "連携を始めたときと利用状態が変わったため、連携しませんでした。いまの記録はそのまま残っています。",
  unavailable: "いまはGoogleと連携できません。このまま引き続き使えます。",
};
export const accountLinkButtonLabel =
  "Googleと連携して、別の端末からも記録を見返す";
export const accountLinkPendingLabel = "Googleへ移動しています…";
export const accountLinkGuestNotice =
  "このままでも閲覧・保存できます。成果の保存期限は変わりません";
export const accountLinkedNotice =
  "Googleと連携済みです。別の端末でもGoogleでログインすると記録を見返せます。";

export function getAccountLinkResultMessage(result: AccountLinkResult): string {
  return messages[result];
}
export function parseAccountLinkResult(
  value: unknown,
): AccountLinkResult | undefined {
  const parsed = AccountLinkResultSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}
