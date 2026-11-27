import Link from "next/link";
import { getGuide } from "../logic/guide-content";
import {
  GUIDES_PATH,
  getGuideStructuredData,
  guidePath,
} from "../logic/guide-metadata";
import type { Guide, GuideBlock } from "../logic/guide-types";
import { getLandingEntry } from "../logic/landing-entry";
import { serializeStructuredData } from "../logic/landing-structured-data";
import { landingCtaClass, landingLinkClass } from "../logic/landing-styles";
import { GuidePage } from "./guide-page";

function GuideBlockView({ block }: { block: GuideBlock }) {
  switch (block.kind) {
    case "paragraph":
      return <p className="text-base leading-8">{block.text}</p>;
    case "list": {
      const List = block.ordered ? "ol" : "ul";
      return (
        <List
          className={`space-y-2 pl-6 text-base leading-8 ${block.ordered ? "list-decimal" : "list-disc"}`}
        >
          {block.items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </List>
      );
    }
    case "table":
      return (
        <div className="overflow-x-auto rounded-xl border border-[var(--lp-line)] bg-[var(--lp-paper)]">
          <table className="w-full min-w-[32rem] border-collapse text-left text-sm leading-7">
            <caption className="sr-only">{block.caption}</caption>
            <thead>
              <tr className="border-b border-[var(--lp-line)]">
                {block.head.map((cell) => (
                  <th
                    key={cell}
                    scope="col"
                    className="whitespace-nowrap px-4 py-3 font-bold"
                  >
                    {cell}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row) => (
                <tr
                  key={row.join("|")}
                  className="border-b border-[var(--lp-line)] last:border-b-0"
                >
                  {row.map((cell, index) => (
                    <td
                      // 行の中の位置で列が決まる。
                      // biome-ignore lint/suspicious/noArrayIndexKey: 列の位置が key
                      key={index}
                      className={`px-4 py-3 align-top ${index === 0 ? "font-bold" : ""} ${cell.length <= 4 ? "whitespace-nowrap" : ""}`}
                    >
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case "example":
      return (
        <figure className="rounded-xl bg-[var(--lp-soft)] px-5 py-4">
          <figcaption className="text-sm font-bold text-[var(--lp-body)]">
            {block.label}
          </figcaption>
          <dl className="mt-2 space-y-2">
            {block.items.map((item) => (
              <div key={item.label} className="sm:flex sm:gap-4">
                <dt className="shrink-0 text-sm font-bold leading-7 sm:w-48">
                  {item.label}
                </dt>
                <dd className="text-base leading-7">{item.text}</dd>
              </div>
            ))}
          </dl>
        </figure>
      );
  }
}

/** 解説ページ（/guides/[slug]）の本文。冒頭で答え、手順・例・よくある質問・出典の順に読む。 */
export function GuideArticleView({ guide }: { guide: Guide }) {
  const entry = getLandingEntry(false, undefined, "ja");
  const related = guide.related
    .map((slug) => getGuide(slug))
    .filter((item): item is Guide => item !== undefined);
  return (
    <GuidePage>
      <script
        type="application/ld+json"
        // 自前の固定文言だけを、< を逃がした JSON で埋め込む（Next.js の JSON-LD ガイドの形）。
        // biome-ignore lint/security/noDangerouslySetInnerHtml: 構造化データは実行しない JSON
        dangerouslySetInnerHTML={{
          __html: serializeStructuredData(getGuideStructuredData(guide)),
        }}
      />
      <nav aria-label="パンくずリスト" className="text-sm">
        <ol className="flex flex-wrap items-center gap-x-2 text-[var(--lp-body)]">
          <li>
            <Link href="/" className={landingLinkClass}>
              Idea Boost
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li>
            <Link href={GUIDES_PATH} className={landingLinkClass}>
              ガイド
            </Link>
          </li>
        </ol>
      </nav>
      <article className="mt-4 space-y-12">
        <header className="space-y-6">
          <h1 className="text-balance text-2xl font-bold leading-snug sm:text-3xl">
            {guide.heading}
          </h1>
          <p className="rounded-xl border border-[var(--lp-line)] bg-[var(--lp-paper)] px-5 py-4 text-base leading-8">
            {guide.summary}
          </p>
          <nav aria-label="目次">
            <p className="text-sm font-bold text-[var(--lp-body)]">目次</p>
            <ol className="mt-2 list-decimal space-y-1 pl-6 text-base">
              {guide.sections.map((section) => (
                <li key={section.id}>
                  <a href={`#${section.id}`} className={landingLinkClass}>
                    {section.heading}
                  </a>
                </li>
              ))}
            </ol>
          </nav>
        </header>
        {guide.sections.map((section) => (
          <section
            key={section.id}
            aria-labelledby={section.id}
            className="space-y-4"
          >
            <h2
              id={section.id}
              className="scroll-mt-6 text-xl font-bold leading-snug sm:text-2xl"
            >
              {section.heading}
            </h2>
            {section.blocks.map((block, index) => (
              <GuideBlockView
                // 節の中の並び順で本文が決まる。
                // biome-ignore lint/suspicious/noArrayIndexKey: 固定の本文の並び
                key={index}
                block={block}
              />
            ))}
          </section>
        ))}
        <section aria-labelledby="faq" className="space-y-4">
          <h2 id="faq" className="text-xl font-bold leading-snug sm:text-2xl">
            よくある質問
          </h2>
          {guide.faq.map((item) => (
            <div key={item.question} className="space-y-1">
              <h3 className="text-base font-bold leading-7">{item.question}</h3>
              <p className="text-base leading-8">{item.answer}</p>
            </div>
          ))}
        </section>
        <section
          aria-labelledby="start"
          className="space-y-4 rounded-2xl bg-[var(--lp-paper)] px-6 py-8 text-center"
        >
          <h2 id="start" className="text-xl font-bold leading-snug sm:text-2xl">
            この進め方を、Idea Boostで試す
          </h2>
          <p className="text-base leading-8">
            Idea
            Boostは、課題・問い・案の順にチームのアイデアを決めるWebアプリです。画面のガイドとタイマーに沿って進めるので、進行役がいなくても使えます。無料です。
          </p>
          <Link href={entry.href} className={landingCtaClass}>
            {entry.label}
          </Link>
          <p>
            <Link href="/" className={landingLinkClass}>
              Idea Boostについて
            </Link>
          </p>
        </section>
        {related.length > 0 ? (
          <section aria-labelledby="related" className="space-y-2">
            <h2 id="related" className="text-xl font-bold leading-snug">
              関連するガイド
            </h2>
            <ul className="space-y-1">
              {related.map((item) => (
                <li key={item.slug}>
                  <Link
                    href={guidePath(item.slug)}
                    className={landingLinkClass}
                  >
                    {item.heading}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        <section aria-labelledby="sources" className="space-y-2">
          <h2 id="sources" className="text-base font-bold">
            出典
          </h2>
          <ul className="space-y-1 text-sm">
            {guide.sources.map((source) => (
              <li key={source.url}>
                <a
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={landingLinkClass}
                >
                  {source.label}
                </a>
              </li>
            ))}
          </ul>
          <p className="text-sm text-[var(--lp-body)]">
            公開 {guide.datePublished}・更新 {guide.dateModified}
          </p>
        </section>
      </article>
    </GuidePage>
  );
}
