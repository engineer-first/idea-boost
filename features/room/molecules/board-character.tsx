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
          className="absolute top-1 left-full ml-1.5 w-max max-w-[min(15rem,calc(100vw-6.5rem))] rounded-2xl rounded-tl-sm border bg-background px-3.5 py-2.5 font-medium text-[13px] text-foreground leading-snug shadow-[0_8px_20px_rgb(0_0_0/0.05)]"
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
          src="/room/teacher.webp"
          width={118}
          height={139}
          alt=""
          aria-hidden="true"
          className="h-auto w-12 sm:w-14"
          draggable={false}
        />
      </button>
    </div>
  );
}
