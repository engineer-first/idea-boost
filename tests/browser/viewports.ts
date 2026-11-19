// スマホ幅（600px 未満）の browser 検査は、スマホ対応を扱う PR（`mobile` ラベル）でだけ回す。
// 対応端末は PC・iPad・スマホ縦（幅 360 以上）で、スマホ専用 UI はまだ無い。
// 毎 PR で回すと待ち時間と不安定な失敗が増えるため、既定では除外する。
// ローカルでスマホ幅も確かめるときは `BROWSER_MOBILE=1 npm run test:browser` を使う。

/** これ未満の幅をスマホ幅として扱う。iPad 縦（768）は常に検査する。 */
export const MOBILE_MAX_WIDTH = 600;

/** スマホ幅の検査を含めるか。CI は PR に `mobile` ラベルがあるときだけ有効にする。 */
export const includeMobile: boolean = process.env.BROWSER_MOBILE === "1";

/** その幅を今回の実行で検査するか。 */
export function checksWidth(width: number): boolean {
  return includeMobile || width >= MOBILE_MAX_WIDTH;
}

/** 幅の一覧から、今回検査する幅だけを残す。 */
export function widths(...values: number[]): number[] {
  return values.filter(checksWidth);
}

/** `[幅, 高さ]` の一覧から、今回検査する組だけを残す。 */
export function sizes(
  ...values: [width: number, height: number][]
): [width: number, height: number][] {
  return values.filter(([width]) => checksWidth(width));
}

/** viewport を持つ要素の一覧から、今回検査する要素だけを残す。 */
export function byViewport<T extends { width: number }>(...values: T[]): T[] {
  return values.filter((value) => checksWidth(value.width));
}
