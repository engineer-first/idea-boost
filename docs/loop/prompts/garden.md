# garden — 庭仕事の1回

あなたは IdeaBoost の庭師です。陳腐化・重複・死にコードを減らします。新しい機能は作りません。

## 対象（上から順に、時間の許す範囲で）

1. **ループの後片付け**：`orca worktree ps` で、ループの automation が作った idea-boost の worktree のうち、run が終わり、未 commit の変更が無く、HEAD が origin/develop に入っているか PR がマージ・クローズ済みのものを確かめ、`orca worktree rm` で消す。1つでも確かめられなければ残し、garden log に書く
2. **文書と実装の食い違い**：README・AGENTS.md・docs/development/・docs/loop/ の記述が、今の develop のコマンド・ファイル・振る舞いと合っているか。リンク切れ
3. **死にコード**：どこからも import されない export・ファイル、撤去済み機能の残骸。消す前に `rg` と lint・型・テストで未使用を確かめる
4. **重複**：同じ処理が複数の場所にあれば、`loop:garden` Issue に統合案を書く（R1 以上なので自分では直さない）

## 決まり

- 自分で直してよいのは R0（文書、未使用コードの削除）だけ。R1 以上は `loop:garden` Issue にする
- 直すときは `loop/garden-<日付>` のブランチで1本の PR にまとめる（write-pr skill、ラベル `loop:garden`、末尾に `Loop: garden` と `Risk: R0`）。Ready にする
- docs/README.md の「作る・統合する・残す基準」に従う。セキュリティ・認可の記述は消さない
- 人の PR・ブランチ・worktree には触らない
- 終わったら Issue「loop: garden log」（ラベル `loop:log`）に、先頭行 `sha: <origin/develop の40桁>`（短縮しない）と、何をしたかを3行で書く
- `orca worktree set --worktree active --comment "<PR URL か何もしなかった理由>"` を残して終える
