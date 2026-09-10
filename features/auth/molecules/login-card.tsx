"use client";

import { KeyRound, ShieldAlert } from "lucide-react";
import {
  DEV_AUTH_DEFAULT_EMAIL,
  DEV_AUTH_DEFAULT_PASSWORD,
} from "../logic/dev-auth-defaults";

export type LoginCardProps = {
  error?: string;
  isConfigured: boolean;
  showDevAuth: boolean;
  googleAction: (formData: FormData) => void | Promise<void>;
  passwordAction: (formData: FormData) => void | Promise<void>;
};

export function LoginCard({
  error,
  isConfigured,
  showDevAuth,
  googleAction,
  passwordAction,
}: LoginCardProps) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-4 text-slate-900">
      <div className="w-full max-w-md space-y-6 bg-white p-8 shadow-sm rounded-2xl border border-slate-200">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-black text-indigo-600">Idea Boost</h1>
          <p className="text-sm text-slate-500">
            アイデア出しをスマートに、スムーズに。
          </p>
        </div>

        {error && (
          <div className="p-3 text-xs bg-red-50 text-red-600 rounded-xl border border-red-100">
            <span className="font-bold">エラー: </span>
            {error}
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

        <form action={googleAction}>
          <button
            type="submit"
            disabled={!isConfigured}
            className="w-full flex items-center justify-center gap-2 py-3 border border-slate-200 rounded-xl text-sm font-semibold hover:bg-slate-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            <svg
              className="h-5 w-5 text-indigo-600"
              viewBox="0 0 24 24"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M12.24 10.285V14.4h6.887c-.648 2.41-2.519 4.114-5.136 4.114-3.535 0-6.4-2.865-6.4-6.4s2.865-6.4 6.4-6.4c1.554 0 2.973.55 4.077 1.458L20.89 4.09C18.57 1.92 15.43 1 12 1 5.925 1 1 5.925 1 12s4.925 11 11 11c6.28 0 11-4.42 11-11 0-.74-.08-1.285-.2-1.715H12.24z" />
            </svg>
            Googleでログイン
          </button>
        </form>

        {showDevAuth && (
          <div className="space-y-4 pt-4 border-t border-slate-100">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-400 justify-center">
              <KeyRound className="h-4 w-4" />
              <span>開発用ログイン</span>
            </div>
            <form action={passwordAction} className="space-y-3">
              <input
                name="email"
                type="email"
                placeholder="メールアドレス"
                defaultValue={DEV_AUTH_DEFAULT_EMAIL}
                required
                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-indigo-500 bg-slate-50/50"
              />
              <input
                name="password"
                type="password"
                placeholder="パスワード"
                defaultValue={DEV_AUTH_DEFAULT_PASSWORD}
                required
                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-indigo-500 bg-slate-50/50"
              />
              <button
                type="submit"
                disabled={!isConfigured}
                className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                開発用ユーザーでログイン
              </button>
            </form>
          </div>
        )}
      </div>
    </main>
  );
}
