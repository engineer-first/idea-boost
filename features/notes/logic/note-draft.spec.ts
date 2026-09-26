import { afterEach, expect, it, vi } from "vitest";
import { readNoteDraft, removeNoteDraft, writeNoteDraft } from "./note-draft";

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  sessionStorage.clear();
});

it("同じブラウザの別タブが同じ付箋を編集しても各下書きを再読込後まで保持する", () => {
  const makeTabStorage = (): Storage => {
    const items = new Map<string, string>();
    return {
      get length() {
        return items.size;
      },
      clear: () => items.clear(),
      getItem: (key) => items.get(key) ?? null,
      key: (index) => [...items.keys()][index] ?? null,
      removeItem: (key) => items.delete(key),
      setItem: (key, value) => items.set(key, value),
    };
  };
  const firstTab = makeTabStorage();
  const secondTab = makeTabStorage();
  let activeTab = firstTab;
  vi.spyOn(window, "sessionStorage", "get").mockImplementation(() => activeTab);

  const scope = { roomId: "room-a", userId: "author-a" };
  const firstDraft = { baseContent: "保存済み", content: "先のタブの下書き" };
  const secondDraft = { baseContent: "保存済み", content: "後のタブの下書き" };
  writeNoteDraft(scope, "note-a", firstDraft);
  activeTab = secondTab;
  writeNoteDraft(scope, "note-a", secondDraft);
  removeNoteDraft(scope, "note-a"); // 後のタブが保存 ACK を受けた場合

  activeTab = firstTab; // 先のタブでの再読込
  expect(readNoteDraft(scope, "note-a")).toEqual(firstDraft);
  activeTab = secondTab;
  expect(readNoteDraft(scope, "note-a")).toBeNull();
});
