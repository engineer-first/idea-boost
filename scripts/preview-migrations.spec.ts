// @vitest-environment node
import { expect, it } from "vitest";
import { previewMigrationHash } from "./preview-migrations.mts";

const entries = [
  {
    path: "workers/migrations/0001_test.sql",
    type: "blob",
    mode: "100644",
    sha: "a".repeat(40),
  },
  {
    path: "workers/room-do-migrations/20261011000000-test.sql",
    type: "blob",
    mode: "100644",
    sha: "b".repeat(40),
  },
];
const hash = (tree = entries) =>
  previewMigrationHash({ truncated: false, tree });
it("通常のコード変更と一覧の順序では保存先を作り直さない", () => {
  expect(hash([...entries].reverse())).toBe(hash());
  expect(
    hash([
      ...entries,
      { ...entries[0], path: "app/page.tsx", sha: "c".repeat(40) },
    ]),
  ).toBe(hash());
});
it.each([0, 1])(
  "D1またはRoomDOのSQLの編集・追加・削除・名前変更を検出する: %i",
  (index) => {
    const other = 1 - index;
    const entry = entries[index];
    for (const changed of [
      [entries[other], { ...entry, sha: "c".repeat(40) }],
      [
        ...entries,
        { ...entry, path: entry.path.replace("test.sql", "added.sql") },
      ],
      [
        entries[other],
        { ...entry, path: entry.path.replace("test.sql", "renamed.sql") },
      ],
    ])
      expect(hash(changed)).not.toBe(hash());
    const extra = {
      ...entry,
      path: entry.path.replace("test.sql", "extra.sql"),
    };
    expect(hash([entries[other], extra])).not.toBe(hash([...entries, extra]));
    expect(() => hash([entries[other]])).toThrow();
  },
);
it("一覧の省略やSQLのsymlinkでは、リセットを判断しない", () => {
  expect(() =>
    previewMigrationHash({ truncated: true, tree: entries }),
  ).toThrow();
  expect(() => hash([entries[0], { ...entries[1], mode: "120000" }])).toThrow();
});
