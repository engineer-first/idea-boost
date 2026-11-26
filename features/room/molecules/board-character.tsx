import Image from "next/image";
import type { CSSProperties } from "react";
import styles from "./board-character.module.css";

export type BoardCharacterProps = {
  message: string | null;
};

// 話しかけるように一文字ずつ出す。吹き出しが開き終えてから（CSS の開始 300ms）
// 文字数によらずこの時間で全文を出し切り、全体で1秒前後に収める。
const REVEAL_TOTAL_MS = 650;
// 絵文字の組み合わせや国旗を途中で分けないよう、見た目の1文字（書記素）で区切る。
const graphemes = new Intl.Segmenter("ja", { granularity: "grapheme" });

export function BoardCharacter({ message }: BoardCharacterProps) {
  const chars = message
    ? Array.from(graphemes.segment(message), ({ segment }) => segment)
    : [];
  const bubbleStyle = {
    "--char-step": `${REVEAL_TOTAL_MS / Math.max(chars.length, 1)}ms`,
  } as CSSProperties;
  return (
    <>
      {/* 読み上げソフトは既存の枠の中身の変化を読むため、枠は常に置いておく。 */}
      <p role="status" className="sr-only">
        {message ?? ""}
      </p>
      {message ? (
        <div
          key={message}
          className="pointer-events-none relative flex flex-col items-start gap-1"
          data-testid="board-character"
        >
          <div
            aria-hidden="true"
            data-testid="board-character-bubble"
            style={bubbleStyle}
            className={`${styles.bubble} absolute top-1 left-full ml-1.5 w-max max-w-[min(22rem,calc(100vw-var(--board-character-mobile-inline-space,6.5rem)))] rounded-2xl rounded-tl-sm border bg-background px-3.5 py-2.5 text-sm text-foreground leading-snug shadow-[0_8px_20px_rgb(0_0_0/0.05)] sm:top-[var(--board-character-bubble-top,0.25rem)] sm:left-[var(--board-character-bubble-left,100%)] sm:ml-[var(--board-character-bubble-gap,0.375rem)] sm:max-w-[var(--board-character-bubble-max-width,22rem)] sm:whitespace-nowrap`}
          >
            {/* 全文を最初から置いて透明から順に見せるので、表示中も吹き出しの大きさは変わらない。
                文字は並び替わらず key={message} で丸ごと作り直すため、位置を key にする。 */}
            {chars.map((char, index) => (
              <span
                // biome-ignore lint/suspicious/noArrayIndexKey: 文字の並びは固定で、文が変わると親ごと作り直す
                key={index}
                data-char
                className={styles.char}
                style={{ "--char-index": index } as CSSProperties}
              >
                {char}
              </span>
            ))}
          </div>
          <Image
            src="/room/teacher.webp"
            width={118}
            height={139}
            alt=""
            aria-hidden="true"
            className={`${styles.teacher} h-auto w-12 origin-bottom sm:w-14`}
            draggable={false}
          />
        </div>
      ) : null}
    </>
  );
}
