import Link from "next/link";
export function PrivacyView() {
  return (
    <main className="flex-1 overflow-y-auto bg-muted/30 p-6">
      <article className="mx-auto max-w-2xl space-y-8 rounded-xl border bg-card p-6 sm:p-10">
        <header className="space-y-3">
          <p className="text-sm text-muted-foreground">Idea Boost</p>
          <h1 className="text-2xl font-semibold">保存とプライバシーについて</h1>
          <p className="leading-relaxed">
            安心して話し合いを始めるために、共有した内容の扱いをご確認ください。
          </p>
        </header>
        <section className="space-y-2">
          <h2 className="font-semibold">共有成果を自動保存します</h2>
          <p className="leading-relaxed">
            サービス改善のため、すべてのルームの決定内容と共有付箋・配置・グループを自動保存します。ステップを離れる直前の共有盤面、公開済みの主観票・客観票の合計と進行時刻も保存します。未共有メモとその枚数、作者のID・氏名・メール、参加者一覧、個人別の投票先・シール位置、入力履歴、画面の画像・動画は、この記録には含めません。追加の登録や同意操作は必要ありません。
          </p>
        </section>
        <section className="space-y-2">
          <h2 className="font-semibold">権限を持つ運営者が閲覧します</h2>
          <p className="leading-relaxed">
            サービス改善のため、Googleでログインし、成果閲覧権限を付与された運営者が、保存期間内の全ルームの共有成果を閲覧します。
          </p>
          <p className="leading-relaxed">
            共有本文は自動で匿名化されません。氏名・連絡先などの個人情報や機密情報を書かないでください。
          </p>
        </section>
        <section className="space-y-2">
          <h2 className="font-semibold">
            完了したルームは完了から30日間見返せます
          </h2>
          <p className="leading-relaxed">
            完了時に在籍していた参加者は、ホームの「以前のルーム」から成果と5つの場面を読み取り専用で見返せます。保存できなかった場面は理由を表示します。票数・順位・個人の投票先は表示しません。閲覧権を確認するため、完了時の参加者のアカウントIDを保存します。完了後に退出しても閲覧権は変わりません。
          </p>
        </section>
        <section className="space-y-2">
          <h2 className="font-semibold">期限を過ぎると削除します</h2>
          <p className="leading-relaxed">
            完了したルームの保存期限は初回完了から30日間です。閲覧・再取得・退出で延長されません。未完了のルームの共有成果は最後の利用から30日間保持します。期限以後は閲覧できず、本文・盤面・閲覧者と索引を自動削除します。持ち帰りたい成果はテキスト保存・コピーしてください。導入前に完了済みのルームは本人向け再訪の対象外です。
          </p>
        </section>
        <Link
          href="/home"
          className="inline-flex min-h-11 items-center underline underline-offset-4"
        >
          ホームへ
        </Link>
      </article>
    </main>
  );
}
