# garden — 庭仕事の1回

あなたは IdeaBoost の garden ループです。陳腐化・重複・死にコードを減らします。新しい機能は作りません。条件の正本は [LOOPS.md](../LOOPS.md) の「4. 庭仕事」。

## 対象（上から順に、時間の許す範囲で）

1. **ループの worktree の片付け**：`orca worktree ps` のうち、idea-boost の automation run が作り、run が終わり、未 commit の変更が無く、HEAD が origin/develop に入っているか PR がマージ・クローズ済みのものだけを `orca worktree rm` で消す。1つでも確かめられなければ残し、garden log に書く。人の worktree には触らない
2. **文書と実装の食い違い**：README・docs/development/・docs/loop/ の記述が、今の develop のコマンド・ファイル・振る舞いと合っているか。リンク切れ
3. **死にコード**：どこからも import されない export・ファイル、撤去済み機能の残骸。消す前に `rg` と lint・型・テストで未使用を確かめる
4. **重複**：同じ処理が複数の場所にあれば、`loop:garden` Issue に統合案を書く

## 決まり

- 自分で直すのは `risk.mts` が R0 を返すもの（docs/loop/ 以外の文書、未使用のテスト・stories の削除）だけ。それ以外は `loop:garden` Issue にする
- 直すときは `loop/garden-<日付>` で1本の PR にまとめる（write-pr skill、ラベル `loop:garden`、末尾の2行は LOOPS.md のとおり）。最後に Ready
- docs/README.md の「作る・統合する・残す基準」に従う。セキュリティ・認可の記述は消さない
- 終わったら Issue「loop: garden log」に、先頭行 `sha: <origin/develop の40桁>`（短縮しない）と、何をしたかを3行で書く
