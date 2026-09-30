// 本文・ルーム・投稿者を保持せず、緊急削除した受付の再送を拒否する。
const WINDOW_MS = 24 * 60 * 60 * 1000;
export async function hashFeedbackReceipt(id: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(id.toLowerCase()),
  );
  return Array.from(new Uint8Array(digest), (value) =>
    value.toString(16).padStart(2, "0"),
  ).join("");
}
export async function feedbackDeletionSql(id: string): Promise<string> {
  const hash = await hashFeedbackReceipt(id);
  const issuedAt =
    /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      id,
    )
      ? Number.parseInt(id.slice(0, 8) + id.slice(9, 13), 16)
      : 0;
  // CLI端末の時計ではなくDBの時刻を使用する。実際の再受付窓を越えて保持しない。
  const serverNow =
    "CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)";
  return `INSERT OR REPLACE INTO feedback_revocations(id_hash,expires_at) VALUES('${hash}',MAX(${serverNow},MIN(${serverNow} + ${2 * WINDOW_MS},${issuedAt + WINDOW_MS})))`;
}
