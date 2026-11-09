// ログイン後の戻り先（next）を扱うヘルパー。
// 招待URL（/invite/[code]）をログアウト状態で開いたとき、ログイン後に
// 元の招待URLへ戻すために next を使う。オープンリダイレクトにならないよう、
// next は必ず sanitizeNextPath を通してアプリ内の相対パスに限定する。

// アプリ内の相対パスだけを許可する。それ以外（絶対URL・プロトコル相対・
// バックスラッシュ）は "/" に落とす。
export function sanitizeNextPath(
  value: FormDataEntryValue | string | null | undefined,
): string {
  if (typeof value !== "string") {
    return "/";
  }
  if (
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\")
  ) {
    return "/";
  }
  try {
    const parsed = new URL(value, "http://localhost");
    if (parsed.origin !== "http://localhost") {
      return "/";
    }
    const normalized = `${parsed.pathname}${parsed.search}${parsed.hash}`;
    if (normalized.startsWith("//") || normalized.includes("\\")) {
      return "/";
    }
    return normalized;
  } catch {
    return "/";
  }
}

export function getLoginPath(next?: string, guestNext?: string): string {
  const safeNext = sanitizeNextPath(next);
  const safeGuestNext = sanitizeNextPath(guestNext ?? next);
  if (safeGuestNext === safeNext) {
    return safeNext === "/"
      ? "/login"
      : `/login?next=${encodeURIComponent(safeNext)}`;
  }
  const query = new URLSearchParams({ next: safeNext });
  query.set("guest_next", safeGuestNext);
  return `/login?${query}`;
}
