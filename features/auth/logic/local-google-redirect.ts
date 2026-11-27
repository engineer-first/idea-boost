// ローカル開発で Google の戻り先（redirect_uri）が、いま開いている worktree の
// サーバーと一致するかを判定する。Google のウェブ アプリケーション クライアントは
// ポートまで完全一致が必要で、ローカル用には localhost の 3000〜3009 だけを登録している。
export const LOCAL_GOOGLE_PORT_MIN = 3000;
export const LOCAL_GOOGLE_PORT_MAX = 3009;

const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** 止める理由を返す。問題なければ null。ループバック（localhost・127.0.0.1・[::1]）以外の SITE_URL は対象外。 */
export function describeLocalGoogleRedirectIssue(
  baseUrl: string,
  requestHost: string | null,
): string | null {
  const base = new URL(baseUrl);
  if (!LOCAL_HOSTNAMES.has(base.hostname)) return null;
  const port = Number(base.port || (base.protocol === "https:" ? 443 : 80));
  const range = `${LOCAL_GOOGLE_PORT_MIN}〜${LOCAL_GOOGLE_PORT_MAX}`;
  if (
    base.hostname !== "localhost" ||
    base.protocol !== "http:" ||
    port < LOCAL_GOOGLE_PORT_MIN ||
    port > LOCAL_GOOGLE_PORT_MAX
  ) {
    return `ローカルの Google ログインは http://localhost のポート ${range} だけで使えます（Google Cloud に登録した戻り先がこの範囲のため）。いまの NEXT_PUBLIC_SITE_URL は ${base.origin} です。範囲内のポートで起動し直すか（npm run dev -- --port ${LOCAL_GOOGLE_PORT_MIN + 1}、検証環境なら IDEA_BOOST_VERIFY_APP_PORT=${LOCAL_GOOGLE_PORT_MIN + 1}）、開発用ログインを使ってください。`;
  }
  if (requestHost !== base.host) {
    return `NEXT_PUBLIC_SITE_URL（${base.origin}）と開いている URL（${requestHost ?? "不明"}）が違います。このまま進むと Google から別の worktree のサーバーへ戻ります。${base.origin} で開き直すか、npm run dev -- --port <番号> で起動し直してください（npm run dev は起動ポートに合わせて NEXT_PUBLIC_SITE_URL を設定します）。`;
  }
  return null;
}
