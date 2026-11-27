// まだ翻訳していない画面を包む。文書全体の lang はブラウザの言語に合わせるため、
// 日本語のままの画面を英語として読み上げないよう、この範囲だけ日本語と示す。
// 画面を翻訳したら、その画面の layout.tsx ごと外す。
export function JapaneseOnlyLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div lang="ja" className="contents">
      {children}
    </div>
  );
}
