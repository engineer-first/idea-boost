import { Button } from "@/components/ui/button";
import { GUEST_IDENTITY_UNAVAILABLE_MESSAGE } from "../logic/guest-identity-message";

export type GuestIdentityUnavailableProps = { returnHref: string };

export function GuestIdentityUnavailable({
  returnHref,
}: GuestIdentityUnavailableProps) {
  return (
    <section className="relative mx-auto my-8 w-full max-w-lg space-y-6 rounded-xl border bg-background p-6">
      <h1 className="text-xl font-semibold leading-snug text-balance">
        このブラウザでは、以前の参加者として確認できません
      </h1>
      <p className="text-base leading-relaxed">
        {GUEST_IDENTITY_UNAVAILABLE_MESSAGE}
      </p>
      <div className="flex flex-col gap-3">
        <Button asChild className="min-h-11">
          <a href="/">新しく始める</a>
        </Button>
        <a
          className="inline-flex min-h-11 items-center justify-center text-sm underline underline-offset-4"
          href={`/login?next=${encodeURIComponent(returnHref)}`}
        >
          Googleと連携済みの方はログイン
        </a>
      </div>
    </section>
  );
}
