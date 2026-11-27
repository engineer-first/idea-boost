# Discord への通知

GitHub の出来事を Discord に送る workflow と、その設定。webhook の URL は秘密なので secret、メンションに使うユーザー ID は公開してよい値なので variable に置く。

| workflow                                                                               | 送る時                               | 設定                                                                   |
| -------------------------------------------------------------------------------------- | ------------------------------------ | ---------------------------------------------------------------------- |
| [discord-issue-assign-notify](../../.github/workflows/discord-issue-assign-notify.yml) | Issue に担当者が付いた               | secret `DISCORD_WEBHOOK_URL_ISSUE_ASSIGN`                              |
| [discord-needs-human-notify](../../.github/workflows/discord-needs-human-notify.yml)   | open の Issue か PR に `needs-human` | secret `DISCORD_WEBHOOK_URL_ISSUE_ASSIGN`、variable `OWNER_DISCORD_ID` |
| [discord-merge-notify](../../.github/workflows/discord-merge-notify.yml)               | PR のマージ                          | secret `DISCORD_WEBHOOK_URL`                                           |
| [リリースの完了通知](release.md)                                                       | 本番への公開の完了・失敗             | secret `DISCORD_WEBHOOK_URL_RELEASE`                                   |

## 人に頼む通知

`needs-human` は、ループが人にしかできない作業で止まった合図（[ループ開発](../loop/README.md#人に頼むとき)）。ループはオーナーの GitHub アカウントで動くので、GitHub の通知はオーナー本人に届かない。そこで Discord の Issue のチャンネルで、オーナーだけをメンションする。

- `OWNER_DISCORD_ID`：オーナーの Discord のユーザー ID（数字）。未設定か数字でないときは、メンション無しで送り、workflow に警告を残す。ループが設定・変更してよい。
- メンションは `allowed_mentions` でこの1人に限る。タイトルに `@everyone` などが入っていても、ほかの人には通知しない。
- fork からの PR では secret が渡らないので送らない。
