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
            サービス改善のため、すべてのルームの決定内容と共有付箋・配置・グループを自動保存します。個人用の未共有メモや個人別の投票内容は、成果閲覧画面には表示されません。追加の登録や同意操作は必要ありません。
          </p>
        </section>
        <section className="space-y-2">
          <h2 className="font-semibold">秘密リンクを持つ人が閲覧できます</h2>
          <p className="leading-relaxed">
            管理者が発行する秘密リンクを持つ人は、ログインせずに、保存期間内の全ルームの共有成果を閲覧できます。リンクを転送した相手も同じ範囲を閲覧でき、閲覧者を特定することはできません。秘密リンクは公開せず、必要な相手だけに渡してください。
          </p>
          <p className="leading-relaxed">
            共有本文は自動で匿名化されません。氏名・連絡先などの個人情報や機密情報を書かないでください。
          </p>
          <p className="leading-relaxed">
            秘密リンク自体に有効期限はなく、管理者が置換・無効化するまで使えます。同じリンクで、後日作られたルームの成果も閲覧できます。
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
