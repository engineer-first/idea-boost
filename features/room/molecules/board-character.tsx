import Image from "next/image";
import styles from "./board-character.module.css";

export type BoardCharacterProps = {
  message: string | null;
};

export function BoardCharacter({ message }: BoardCharacterProps) {
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
            className={`${styles.bubble} absolute top-1 left-full ml-1.5 w-max max-w-[min(15rem,calc(100vw-6.5rem))] rounded-2xl rounded-tl-sm border bg-background px-3.5 py-2.5 font-medium text-[13px] text-foreground leading-snug shadow-[0_8px_20px_rgb(0_0_0/0.05)] sm:top-[var(--board-character-bubble-top,0.25rem)] sm:left-[var(--board-character-bubble-left,100%)] sm:ml-[var(--board-character-bubble-gap,0.375rem)] sm:max-w-[var(--board-character-bubble-max-width,15rem)]`}
          >
            {message}
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
