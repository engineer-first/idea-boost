/** 解説ページの本文の1かたまり。画面と構造化データは同じ中身から作る。 */
export type GuideBlock =
  | { kind: "paragraph"; text: string }
  | { kind: "list"; items: readonly string[]; ordered?: boolean }
  | {
      kind: "table";
      caption: string;
      head: readonly string[];
      rows: readonly (readonly string[])[];
    }
  | {
      kind: "example";
      label: string;
      items: readonly { label: string; text: string }[];
    };

export type GuideSection = {
  /** ページ内リンクの id。ページ内で重複させない。 */
  id: string;
  heading: string;
  blocks: readonly GuideBlock[];
};

export type Guide = {
  slug: string;
  /** 検索結果に出す title。狙う検索語を前に置く。 */
  title: string;
  /** ページの h1。 */
  heading: string;
  /** 検索結果の抜粋に出す説明文。 */
  description: string;
  /** 冒頭で問いに答える要約。AI が引用しやすいよう、これだけで意味が通るようにする。 */
  summary: string;
  /** 狙う検索語。先頭が主な語（空白区切りの各語を title と説明文に入れる）。 */
  keywords: readonly string[];
  /** YYYY-MM-DD */
  datePublished: string;
  /** YYYY-MM-DD */
  dateModified: string;
  sections: readonly GuideSection[];
  faq: readonly { question: string; answer: string }[];
  sources: readonly { label: string; url: string }[];
  /** 関連する解説の slug。 */
  related: readonly string[];
};
