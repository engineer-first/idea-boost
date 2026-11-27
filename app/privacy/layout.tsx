// この配下の画面はまだ翻訳していない。文書全体の lang はブラウザの言語に合わせるため、
// 日本語のままの画面を英語として読み上げないよう、この範囲だけ日本語と示す。
// 画面を翻訳したら、この layout ごと外す。
export default function JapaneseOnlyLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div lang="ja" className="contents">
      {children}
    </div>
  );
}
