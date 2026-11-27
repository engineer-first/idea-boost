import type { AppLocale } from "@/lib/i18n/locale";
import { SHARE_IMAGE } from "@/lib/share-image";
import { getLandingContent } from "./landing-content";
import { landingUrl, SITE_ORIGIN } from "./landing-metadata";

type StructuredData = Record<string, unknown>;

/** 表記ゆれ（IdeaBoost）で探されても、同じサービスだと分かるよう別名として示す。 */
const ALTERNATE_NAMES = ["IdeaBoost"];

/**
 * アプリが取り入れている手法。検索エンジンと AI が、手法の名前で探した人に
 * このアプリを結び付けられるよう、出典と同じページを示す。
 */
const RELATED_METHODS: Record<AppLocale, { name: string; sameAs: string }[]> = {
  ja: [
    {
      name: "デザインスプリント",
      sameAs: "https://en.wikipedia.org/wiki/Design_sprint",
    },
    {
      name: "ブレインストーミング",
      sameAs:
        "https://ja.wikipedia.org/wiki/%E3%83%96%E3%83%AC%E3%82%A4%E3%83%B3%E3%82%B9%E3%83%88%E3%83%BC%E3%83%9F%E3%83%B3%E3%82%B0",
    },
    {
      name: "How Might We（どうしたら〜できる？）",
      sameAs: "https://www.designkit.org/methods/how-might-we.html",
    },
  ],
  en: [
    {
      name: "Design sprint",
      sameAs: "https://en.wikipedia.org/wiki/Design_sprint",
    },
    {
      name: "Brainstorming",
      sameAs: "https://en.wikipedia.org/wiki/Brainstorming",
    },
    {
      name: "How Might We questions",
      sameAs: "https://www.designkit.org/methods/how-might-we.html",
    },
  ],
};

/**
 * LP の中身を schema.org の JSON-LD で表す。検索エンジンと AI が、何のアプリで、
 * 無料か、何ができるか、よくある質問の答えを、画面と同じ文言で読み取れるようにする。
 */
export function getLandingStructuredData(locale: AppLocale): StructuredData {
  const copy = getLandingContent(locale).landingCopy;
  const url = landingUrl(locale);
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        // サイト名は言語によらず1つ。Google のサイト名はドメインのトップの WebSite から読む。
        "@type": "WebSite",
        "@id": `${SITE_ORIGIN}/#website`,
        name: copy.brand,
        alternateName: ALTERNATE_NAMES,
        url: `${SITE_ORIGIN}/`,
        inLanguage: ["ja", "en"],
      },
      {
        "@type": "WebApplication",
        "@id": `${url}#app`,
        isPartOf: { "@id": `${SITE_ORIGIN}/#website` },
        name: copy.brand,
        alternateName: ALTERNATE_NAMES,
        url,
        description: copy.description,
        inLanguage: locale,
        applicationCategory: "BusinessApplication",
        operatingSystem: "Web",
        image: `${SITE_ORIGIN}${SHARE_IMAGE.url}`,
        // FAQ の「現在は無料で使えます」と同じ事実。
        offers: { "@type": "Offer", price: "0", priceCurrency: "JPY" },
        isAccessibleForFree: true,
        about: RELATED_METHODS[locale].map((method) => ({
          "@type": "Thing",
          ...method,
        })),
        featureList: copy.features.items.map((item) => item.title),
      },
      {
        "@type": "FAQPage",
        "@id": `${url}#faq`,
        inLanguage: locale,
        mainEntity: copy.faq.items.map((item) => ({
          "@type": "Question",
          name: item.question,
          acceptedAnswer: { "@type": "Answer", text: item.answer },
        })),
      },
    ],
  };
}

/** script 要素の中に置ける JSON にする。`</script>` で要素が閉じないよう `<` を逃がす。 */
export function serializeStructuredData(data: StructuredData): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
