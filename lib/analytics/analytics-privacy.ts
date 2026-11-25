/** 個別の会・人を特定できる ID を含む画面。ID の部分を置き換える。 */
const ID_SEGMENTS: ReadonlyArray<
  readonly [prefix: string, placeholder: string]
> = [
  ["invite", ":code"],
  ["rooms", ":id"],
  ["completed-rooms", ":id"],
  ["shared-outcomes", ":id"],
];

/** 流入元を見るために残すクエリ。戻り先（next）などは招待コードを含みうるので落とす。 */
const KEPT_QUERY = /^utm_(source|medium|campaign|content|term)$/;

const SITE_HOSTS = new Set(["ideaboost.dev", "localhost"]);

/** 値に URL を持つプロパティのキー（$current_url・$initial_pathname・$referrer など）。 */
const URL_KEY = /(url|pathname|referrer)$/i;

function sanitizePath(pathname: string): string {
  const parts = pathname.split("/");
  for (let index = 1; index < parts.length - 1; index++) {
    const rule = ID_SEGMENTS.find(([prefix]) => prefix === parts[index]);
    if (rule && parts[index + 1] !== "") parts[index + 1] = rule[1];
  }
  return parts.join("/");
}

/**
 * 計測へ送る URL・パスから、招待コード・ルーム ID・クエリ（utm_* 以外）・ハッシュを落とす。
 * 外部サイトの URL（参照元）は検索語などを含みうるので origin だけにする。
 */
export function sanitizeAnalyticsUrl(value: string): string {
  if (value.startsWith("/")) {
    const url = new URL(value, "https://ideaboost.dev");
    return `${sanitizePath(url.pathname)}${keptQuery(url)}`;
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return value;
  }
  if (!SITE_HOSTS.has(url.hostname)) return url.origin;
  return `${url.origin}${sanitizePath(url.pathname)}${keptQuery(url)}`;
}

function keptQuery(url: URL): string {
  const kept = new URLSearchParams();
  for (const [key, value] of url.searchParams) {
    if (KEPT_QUERY.test(key)) kept.append(key, value);
  }
  const query = kept.toString();
  return query === "" ? "" : `?${query}`;
}

type Properties = Record<string, unknown>;

/** イベントのプロパティ（$set / $set_once の中も含む）の URL を整える。 */
export function sanitizeAnalyticsProperties(
  properties: Properties,
): Properties {
  const result: Properties = {};
  for (const [key, value] of Object.entries(properties)) {
    if (typeof value === "string" && URL_KEY.test(key)) {
      result[key] = sanitizeAnalyticsUrl(value);
    } else if ((key === "$set" || key === "$set_once") && isRecord(value)) {
      result[key] = sanitizeAnalyticsProperties(value);
    } else {
      result[key] = value;
    }
  }
  return result;
}

function isRecord(value: unknown): value is Properties {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
