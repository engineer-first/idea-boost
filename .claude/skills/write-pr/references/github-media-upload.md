# GitHub への画面資料の添付

ローカルで撮影した画像や動画を PR 本文へ載せるときに読む。GitHub CLI は PR 本文を更新できるが、ローカルのバイナリを `user-attachments` へアップロードしないため、アップロードだけは GitHub の本文編集 UI を使う。

## 添付する

1. 画像・動画が絶対パスに存在し、意図した画面かを確認する。一時ファイルでもよいが、アップロードが終わるまでは移動・削除しない。
2. サインイン済みの GitHub を操作できるブラウザで対象 PR を開き、本文の編集欄を表示する。PR がまだなければ先に作成してよいが、画面資料の反映と表示確認までは完了扱いにしない。
3. Codex Desktop ではブラウザ操作の file upload 手順を読み、本文編集欄に属する `input[type="file"]` または添付ボタンを使う。file chooser を待ち受けてから添付欄を押し、chooser にローカルファイルの絶対パスを渡す。
4. アップロード中の表示が消え、本文編集欄へ `https://github.com/user-attachments/assets/...` などの Markdown / HTML が挿入されるまで待つ。複数ファイルでは、それぞれの挿入を確認する。
5. 画像の直前または直後に、条件と確認箇所を一文で書く。既存本文、人の追記、Bot 管理部分を保持して保存する。

本文編集欄の添付入力を安定して特定できない場合は、ページ下部のコメント入力欄にある `Attach files` または `Paste, drop, or click to add files` をアップロード専用の下書き場所として使う。挿入された画像 Markdown を取得して最新の PR 本文へ移し、`gh pr edit --body-file` または本文編集 UI で保存する。このためだけのコメントは投稿せず、本文へ移した後に下書きを破棄する。

Codex Desktop のブラウザ操作に file chooser がある場合、コメント入力欄を下書き場所にするフォールバックは次の形になる。

```javascript
const chooserPromise = tab.playwright.waitForEvent("filechooser", {
  timeoutMs: 10000,
});
const commentForm = tab.playwright.getByRole("form", { name: "Add a comment" });
await commentForm.getByRole("button", { name: "Attach files" }).click();
const chooser = await chooserPromise;
await chooser.setFiles(["/absolute/path/to/screenshot.png"]);
```

## 反映を確認する

1. 保存後に PR 本文を再取得し、挿入された添付 URL と説明が残っていることを確認する。
2. PR ページを読み直し、画像ならプレビュー、動画なら再生要素が本文中に描画されることを目視確認する。リンク文字列があるだけでは完了しない。
3. 表示されなければ最新の本文編集画面を開き直し、アップロード未完了、Markdown の欠損、保存前の画面遷移がなかったかを確認して一度修正する。

ブラウザが利用不能、GitHub が未ログイン、またはアップロードがエラーになる場合は、その具体的な停止箇所を報告する。Storybook URL、ローカルパス、テスト結果を、GitHub 上で表示できる画面資料の代わりとして扱わない。
