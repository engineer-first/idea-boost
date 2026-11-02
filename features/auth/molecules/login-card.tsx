"use client";

import { ArrowLeft, KeyRound, ShieldAlert, UserRound } from "lucide-react";
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
import {
  googleStartLabel,
  guestStartLabel,
  loginAboutLabel,
  loginBackLabel,
  loginChoiceDivider,
  loginRetryLabel,
} from "../logic/login-copy";

export type LoginCardProps = {
  guestForm: ReactNode;
  guestPending?: boolean;
  error?: string;
  aboutHref?: string;
  isConfigured: boolean;
  showDevAuth: boolean;
  googleAction: (formData: FormData) => void | Promise<void>;
  passwordAction: (
    previousState: DevAuthState,
    formData: FormData,
  ) => Promise<DevAuthState>;
};

const startButtonClassName =
  "w-full min-h-11 flex items-center justify-center gap-2 py-3 border border-slate-200 rounded-xl text-sm font-semibold hover:bg-slate-50 transition-colors focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer";

export function LoginCard({
  guestForm,
  guestPending = false,
  error,
  aboutHref = "/about",
  isConfigured,
  showDevAuth,
  googleAction,
  passwordAction,
}: LoginCardProps) {
  const [step, setStep] = useState<"choice" | "guest">("choice");
  const previousStep = useRef(step);
  const guestHeadingId = useId();
  const guestHeadingRef = useRef<HTMLHeadingElement>(null);
  const guestButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (previousStep.current === step) return;
    previousStep.current = step;
    if (step === "guest") {
      guestHeadingRef.current?.focus();
    } else {
      guestButtonRef.current?.focus();
    }
  }, [step]);

  const [state, devAction, pending] = useActionState(passwordAction, {});
  const [email, setEmail] = useState(DEV_AUTH_DEFAULT_EMAIL);
  const [password, setPassword] = useState(DEV_AUTH_DEFAULT_PASSWORD);
  const loginError = state.error ?? error;

  return (
    <main className="flex h-full min-h-0 flex-1 flex-col overflow-y-auto bg-slate-50 p-4 text-slate-900">
      <div className="mx-auto my-auto w-full max-w-md space-y-6 bg-white p-8 shadow-sm rounded-2xl border border-slate-200">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-black text-indigo-600">Idea Boost</h1>
          <p className="text-sm text-slate-500">
            アイデア出しをスマートに、スムーズに。
          </p>
        </div>

        <Link
          href={aboutHref}
          className="flex min-h-11 items-center justify-center text-sm text-indigo-700 underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-4"
        >
          {loginAboutLabel}
        </Link>

        {loginError && (
          <div
            role="alert"
            className="p-3 text-sm bg-red-50 text-red-700 rounded-xl border border-red-100"
          >
            <span className="font-bold">エラー: </span>
            {loginError}
            <p className="mt-1">{loginRetryLabel}</p>
          </div>
        )}

        {!isConfigured && (
          <div className="p-3 text-xs bg-amber-50 text-amber-800 rounded-xl border border-amber-100 flex gap-2">
            <ShieldAlert className="h-4 w-4 shrink-0" />
            <span>
              認証の環境設定が必要です。.env.local を確認してください。
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
                  className="h-5 w-5 text-indigo-600"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path d="M12.24 10.285V14.4h6.887c-.648 2.41-2.519 4.114-5.136 4.114-3.535 0-6.4-2.865-6.4-6.4s2.865-6.4 6.4-6.4c1.554 0 2.973.55 4.077 1.458L20.89 4.09C18.57 1.92 15.43 1 12 1 5.925 1 1 5.925 1 12s4.925 11 11 11c6.28 0 11-4.42 11-11 0-.74-.08-1.285-.2-1.715H12.24z" />
                </svg>
                {googleStartLabel}
              </button>
            </form>
            <div className="flex items-center gap-3 text-sm text-slate-400">
              <span aria-hidden="true" className="h-px flex-1 bg-slate-200" />
              <span>{loginChoiceDivider}</span>
              <span aria-hidden="true" className="h-px flex-1 bg-slate-200" />
            </div>
            <button
              type="button"
              disabled={!isConfigured}
              className={startButtonClassName}
              ref={guestButtonRef}
              onClick={() => setStep("guest")}
            >
              <UserRound
                aria-hidden="true"
                className="h-5 w-5 text-indigo-600"
              />
              {guestStartLabel}
            </button>
          </div>
        ) : (
          <section className="space-y-4" aria-labelledby={guestHeadingId}>
            <h2
              id={guestHeadingId}
              ref={guestHeadingRef}
              tabIndex={-1}
              className="text-lg font-semibold focus:outline-none"
            >
              {guestStartLabel}
            </h2>
            {guestForm}
            <button
              type="button"
              disabled={guestPending}
              onClick={() => setStep("choice")}
              className="flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-indigo-600"
            >
              <ArrowLeft aria-hidden="true" className="h-4 w-4" />
              {loginBackLabel}
            </button>
          </section>
        )}

        {showDevAuth && (
          <div className="space-y-4 pt-4 border-t border-slate-100">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-400 justify-center">
              <KeyRound className="h-4 w-4" />
              <span>開発用ログイン</span>
            </div>
            <form action={devAction} className="space-y-3">
              <label
                htmlFor="dev-auth-email"
                className="block text-sm font-medium"
              >
                メールアドレス
              </label>
              <input
                id="dev-auth-email"
                name="email"
                type="email"
                placeholder="メールアドレス"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-indigo-500 bg-slate-50/50"
              />
              <label
                htmlFor="dev-auth-password"
                className="block text-sm font-medium"
              >
                パスワード
              </label>
              <input
                id="dev-auth-password"
                name="password"
                type="password"
                placeholder="パスワード"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-indigo-500 bg-slate-50/50"
              />
              <button
                type="submit"
                disabled={!isConfigured || pending}
                className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                {pending ? "ログイン中…" : "開発用ユーザーでログイン"}
              </button>
            </form>
          </div>
        )}
      </div>
    </main>
  );
}
