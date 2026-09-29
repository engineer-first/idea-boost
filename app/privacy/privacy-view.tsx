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
          <h2 className="font-semibold">保存期間は最後の利用から30日間です</h2>
          <p className="leading-relaxed">
            ルームを退出・終了・削除しても、保存済みの共有成果は最後の利用から30日間残ります。期間を過ぎた成果は閲覧できなくなり、削除されます。持ち帰りたい成果は、完了後の画面からテキスト保存・コピーしてください。
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
