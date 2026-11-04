import Image from "next/image";

export type BoardCharacterProps = {
  message: string | null;
  onReplay: () => void;
};

export function BoardCharacter({ message, onReplay }: BoardCharacterProps) {
  return (
    <div
      className="pointer-events-none relative flex flex-col items-start gap-1"
      data-testid="board-character"
    >
      {message ? (
        <div
          role="status"
          className="absolute bottom-full left-0 mb-2 w-52 max-w-[calc(100vw-2rem)] rounded-2xl rounded-bl-sm border bg-background/95 px-3 py-2 text-xs leading-relaxed shadow-sm"
        >
          {message}
        </div>
      ) : null}
      <button
        type="button"
        aria-label="直前の一言をもう一度見る"
        onClick={onReplay}
        className="pointer-events-auto rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <Image
          src="/landing/mood-g.webp"
          width={180}
          height={173}
          alt=""
          aria-hidden="true"
          className="h-auto w-16 sm:w-20"
          draggable={false}
        />
      </button>
    </div>
  );
}
