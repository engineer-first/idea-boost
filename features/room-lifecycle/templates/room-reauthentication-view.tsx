import { Button } from "@/components/ui/button";
export type RoomReauthenticationViewProps = {
  pending?: boolean;
  message?: string;
  onContinue: () => void;
  onBack: () => void;
};
export function RoomReauthenticationView({
  pending,
  message,
  onContinue,
  onBack,
}: RoomReauthenticationViewProps) {
  return (
    <section
      aria-labelledby="room-reauth-title"
      className="mx-auto w-full max-w-md space-y-5 p-6"
    >
      <h1
        id="room-reauth-title"
        className="text-xl font-semibold leading-snug text-balance"
      >
        ログインし直して続けてください
      </h1>
      {message && (
        <p role="status" className="text-sm leading-relaxed">
          {message}
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        <Button
          className="min-h-11 whitespace-normal"
          disabled={pending}
          onClick={onContinue}
        >
          {pending ? "準備中…" : "Googleでログインして続ける"}
        </Button>
        <Button
          variant="outline"
          className="min-h-11"
          disabled={pending}
          onClick={onBack}
        >
          戻る
        </Button>
      </div>
    </section>
  );
}
