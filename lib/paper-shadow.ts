// tldraw の NoteShapeUtil.getNoteShadow から移植した「下方向にだけ落ちる影」。
//
// 仕組み: box-shadow の spread に blur 以上のマイナス値を与えると、影は
// 要素の輪郭より内側に縮む。そこへ正のYオフセットを足すと下辺からだけ
// 影がはみ出し、「机に貼った付箋の下端が浮いている」見た目になる。
// 通常の shadow-sm のような全方向の影だと、貼り付いた紙ではなく
// 浮いたカードに見えてしまう。
//
// lift（浮き量）は紙の識別子から決定的に導出し、紙ごとに影の出方を僅かに
// 変える。すべての紙の影が均一だと並べたときに人工的に見えるため（tldraw踏襲）。

const MIN_LIFT = 0.5;
const MAX_LIFT_VARIANCE = 1;

// 紙の識別子から 0.5〜1.5 の浮き量を決定的に得る簡易ハッシュ。
function getPaperLift(paperId: string): number {
  let hash = 0;
  for (let i = 0; i < paperId.length; i++) {
    hash = (hash * 31 + paperId.charCodeAt(i)) | 0;
  }
  return MIN_LIFT + ((Math.abs(hash) % 100) / 100) * MAX_LIFT_VARIANCE;
}

function px(value: number): string {
  return `${Number(value.toFixed(2))}px`;
}

export function getPaperShadow(
  paperId: string,
  options: { isLifted?: boolean } = {},
): string {
  const baseLift = getPaperLift(paperId);
  // ドラッグ中は付箋を「持ち上げた」状態として浮きを増やす。
  const lift = options.isLifted ? baseLift + 1 : baseLift;

  // 接地影: 浮きが増えるほど下辺との接点から離れて薄れる。
  const contactY = Math.max(0, 5 - lift);
  // 拡散影: 浮きが増えるほど遠く・柔らかく落ちる。
  const softY = 4 + lift * 7;
  const softBlur = 6 + lift * 7;
  const softSpread = -(4 + lift * 6);
  const softAlpha = (0.3 + lift * 0.1).toFixed(2);
  // 紙面のごく薄い内側の陰影。紙の質感を出すためのもので、ほぼ見えない濃さ。
  const insetAlpha = (0.022 + (baseLift - MIN_LIFT) * 0.005).toFixed(3);

  return [
    `0px ${px(contactY)} 5px -5px rgba(15, 23, 31, 0.6)`,
    `0px ${px(softY)} ${px(softBlur)} ${px(softSpread)} rgba(15, 23, 31, ${softAlpha})`,
    `0px 36px 10px -10px rgba(15, 23, 44, ${insetAlpha}) inset`,
  ].join(", ");
}
