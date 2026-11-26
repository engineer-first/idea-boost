"use client";

import {
  ArrowLeft,
  DoorOpen,
  KeyRound,
  ShieldAlert,
  UserRound,
} from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import {
  type ReactNode,
  useActionState,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import type { DevAuthState } from "../logic/actions";
import {
  DEV_AUTH_DEFAULT_EMAIL,
  DEV_AUTH_DEFAULT_PASSWORD,
} from "../logic/dev-auth-defaults";

export type LoginCardProps = {
  guestForm: ReactNode;
  guestPending?: boolean;
  error?: string;
  aboutHref?: string;
  // 招待URLから来た人に、ログインの先でルームへ参加することを示す。
  invited?: boolean;
  isConfigured: boolean;
  showDevAuth: boolean;
  googleAction: (formData: FormData) => void | Promise<void>;
  passwordAction: (
    previousState: DevAuthState,
    formData: FormData,
  ) => Promise<DevAuthState>;
};

const startButtonClassName =
  "w-full min-h-11 flex items-center justify-center gap-2 py-3 border border-border rounded-lg text-base font-semibold hover:bg-muted transition-colors focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer";

export function LoginCard({
  guestForm,
  guestPending = false,
  error,
  aboutHref = "/about",
  invited = false,
  isConfigured,
  showDevAuth,
  googleAction,
  passwordAction,
}: LoginCardProps) {
  const t = useTranslations("app.login");
  const [step, setStep] = useState<"choice" | "guest">("choice");
  const previousStep = useRef(step);
  const guestHeadingId = useId();
  const guestHeadingRef = useRef<HTMLHeadingElement>(null);
  const guestSectionRef = useRef<HTMLElement>(null);
  const guestButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (previousStep.current === step) return;
    previousStep.current = step;
    if (step === "guest") {
      // ゲスト段階でやることは名前の入力だけなので、入力欄へ直接フォーカスする。
      const input = guestSectionRef.current?.querySelector("input");
      if (input) input.focus();
      else guestHeadingRef.current?.focus();
    } else {
      guestButtonRef.current?.focus();
    }
  }, [step]);

  const [state, devAction, pending] = useActionState(passwordAction, {});
  const [email, setEmail] = useState(DEV_AUTH_DEFAULT_EMAIL);
  const [password, setPassword] = useState(DEV_AUTH_DEFAULT_PASSWORD);
  const loginError = state.error ?? error;

  return (
    <main className="flex h-full min-h-0 flex-1 flex-col overflow-y-auto bg-background p-4 text-foreground">
      <div className="mx-auto my-auto w-full max-w-md space-y-6 bg-card p-8 rounded-lg border border-border">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-black text-primary">Idea Boost</h1>
          <p className="text-balance text-base text-muted-foreground">
            <span className="inline-block">{t("sloganFirst")}</span>
            <span className="inline-block">{t("sloganSecond")}</span>
          </p>
        </div>

        {invited && (
          <p className="flex items-start gap-2 rounded-lg bg-primary-soft p-3 text-base text-primary-strong">
            <DoorOpen aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0" />
            <span className="[word-break:auto-phrase]">
              {t("invitedNotice")}
            </span>
          </p>
        )}

        <Link
          href={aboutHref}
          className="flex min-h-11 items-center justify-center text-base text-primary underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-4"
        >
          {t("about")}
        </Link>

        {loginError && (
          <div
            role="alert"
            className="p-3 text-base bg-danger-soft text-danger-text rounded-lg border border-danger/20"
          >
            <span className="font-bold">{t("errorPrefix")}: </span>
            {loginError}
            <p className="mt-1">{t("retry")}</p>
          </div>
        )}

        {!isConfigured && (
          <div className="p-3 text-xs bg-warning-soft text-warning rounded-lg border border-warning/20 flex gap-2">
            <ShieldAlert className="h-4 w-4 shrink-0" />
            <span>
              {t("authSetup")}
            </span>
          </div>
        )}

        {step === "choice" ? (
          <div className="space-y-4">
            <form action={googleAction}>
              <button
                type="submit"
                disabled={!isConfigured}
                className={startButtonClassName}
              >
                <svg
                  className="h-5 w-5 text-primary"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path d="M12.24 10.285V14.4h6.887c-.648 2.41-2.519 4.114-5.136 4.114-3.535 0-6.4-2.865-6.4-6.4s2.865-6.4 6.4-6.4c1.554 0 2.973.55 4.077 1.458L20.89 4.09C18.57 1.92 15.43 1 12 1 5.925 1 1 5.925 1 12s4.925 11 11 11c6.28 0 11-4.42 11-11 0-.74-.08-1.285-.2-1.715H12.24z" />
                </svg>
                {t("google")}
              </button>
            </form>
            <div className="flex items-center gap-3 text-base text-muted-foreground">
              <span aria-hidden="true" className="h-px flex-1 bg-border" />
              <span>{t("divider")}</span>
              <span aria-hidden="true" className="h-px flex-1 bg-border" />
            </div>
            <button
              type="button"
              disabled={!isConfigured}
              className={startButtonClassName}
              ref={guestButtonRef}
              onClick={() => setStep("guest")}
            >
              <UserRound aria-hidden="true" className="h-5 w-5 text-primary" />
              {t("guest")}
            </button>
          </div>
        ) : (
          <section
            ref={guestSectionRef}
            className="space-y-4"
            aria-labelledby={guestHeadingId}
          >
            <h2
              id={guestHeadingId}
              ref={guestHeadingRef}
              tabIndex={-1}
              className="text-lg font-semibold focus:outline-none"
            >
              {t("guestHeading")}
            </h2>
            {guestForm}
            <button
              type="button"
              disabled={guestPending}
              onClick={() => setStep("choice")}
              className="flex min-h-11 items-center gap-2 rounded-lg px-3 text-base text-muted-foreground hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
            >
              <ArrowLeft aria-hidden="true" className="h-4 w-4" />
              {t("back")}
            </button>
          </section>
        )}

        {showDevAuth && (
          <div className="space-y-4 pt-4 border-t border-border">
            <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground justify-center">
              <KeyRound className="h-4 w-4" />
              <span>{t("devHeading")}</span>
            </div>
            <form action={devAction} className="space-y-3">
              <label
                htmlFor="dev-auth-email"
                className="block text-base font-medium"
              >
                {t("email")}
              </label>
              <input
                id="dev-auth-email"
                name="email"
                type="email"
                placeholder={t("email")}
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                className="w-full px-3 py-2 border border-border rounded-md text-base focus:outline-primary bg-muted/50"
              />
              <label
                htmlFor="dev-auth-password"
                className="block text-base font-medium"
              >
                {t("password")}
              </label>
              <input
                id="dev-auth-password"
                name="password"
                type="password"
                placeholder="パスワード"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                className="w-full px-3 py-2 border border-border rounded-md text-base focus:outline-primary bg-muted/50"
              />
              <button
                type="submit"
                disabled={!isConfigured || pending}
                className="w-full py-2.5 bg-primary hover:bg-primary-strong text-primary-foreground rounded-lg text-base font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                {pending ? t("pending") : t("devSubmit")}
              </button>
            </form>
          </div>
        )}
      </div>
    </main>
  );
}
