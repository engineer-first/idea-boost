import { Button } from "@/components/ui/button";
import {
  GUEST_IDENTITY_CHOICE_LABEL,
  GUEST_IDENTITY_CHOICE_MESSAGE,
  GUEST_IDENTITY_HOME_LABEL,
  GUEST_IDENTITY_UNAVAILABLE_MESSAGE,
  GUEST_IDENTITY_UNAVAILABLE_TITLE,
} from "../logic/guest-identity-message";

export type GuestIdentityUnavailableProps = { loginHref?: string };

export function GuestIdentityUnavailable({
  loginHref,
}: GuestIdentityUnavailableProps) {
  return (
    <section className="relative mx-auto my-8 w-full max-w-lg space-y-6 rounded-xl border bg-background p-6">
      <h1 className="text-xl font-semibold leading-snug text-balance">
        {GUEST_IDENTITY_UNAVAILABLE_TITLE}
      </h1>
      <p className="text-base leading-relaxed">
        {GUEST_IDENTITY_UNAVAILABLE_MESSAGE}
      </p>
      {loginHref && (
        <p className="text-sm leading-relaxed text-muted-foreground">
          {GUEST_IDENTITY_CHOICE_MESSAGE}
        </p>
      )}
      <Button asChild className="min-h-11">
        <a href={loginHref ?? "/home"}>
          {loginHref ? GUEST_IDENTITY_CHOICE_LABEL : GUEST_IDENTITY_HOME_LABEL}
        </a>
      </Button>
    </section>
  );
}
