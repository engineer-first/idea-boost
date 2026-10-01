import { beforeEach, describe, expect, it } from "vitest";
import { loadNoteDrafts, noteDraftStorageKey } from "./note-draft-storage";

describe("破損したタブ内下書きの回収", () => {
  beforeEach(() => sessionStorage.clear());
  it("JSONが途中で壊れていても残っている全文を手動コピー用に返す", () => {
    const key = noteDraftStorageKey("room", "user");
    const raw = '{"version":1,"drafts":[{"text":"中断した本人の文章"';
    sessionStorage.setItem(key, raw);
    expect(loadNoteDrafts(key)).toEqual({ drafts: [], failureText: raw });
    expect(sessionStorage.getItem(key)).toBe(raw);
  });
});
