import type { AppLocale } from "@/lib/i18n/locale";
import { getLandingContent } from "./landing-content";
import { landingUrl, SITE_ORIGIN } from "./landing-metadata";

type StructuredData = Record<string, unknown>;

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
        "@type": "WebSite",
        "@id": `${url}#website`,
        name: copy.brand,
        url,
        inLanguage: locale,
      },
      {
        "@type": "WebApplication",
        "@id": `${url}#app`,
        name: copy.brand,
        url,
        description: copy.description,
        inLanguage: locale,
        applicationCategory: "BusinessApplication",
        operatingSystem: "Web",
        image: `${SITE_ORIGIN}/brand/ogp.png`,
        // FAQ の「現在は無料で使えます」と同じ事実。
        offers: { "@type": "Offer", price: "0", priceCurrency: "JPY" },
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
