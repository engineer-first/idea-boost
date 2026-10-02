import { type JSX, useId } from "react";
import type { z } from "zod";
import { Button } from "@/components/ui/button";
import {
  type AccessUserSchema,
  type ManagedReadPermission,
  PERMISSIONS,
} from "@/contracts/access";

type AccessUser = z.infer<typeof AccessUserSchema>;
export type AccessViewProps = {
  permission?: ManagedReadPermission;
  users: AccessUser[];
  email: string;
  loading: boolean;
  pending: boolean;
  error: string | null;
  onEmailChange(value: string): void;
  onAdd(): void;
  onRemove(email: string): void;
  onRetry(): void;
};
export function AccessView({
  permission = PERMISSIONS.readSharedOutcomes,
  users,
  email,
  loading,
  pending,
  error,
  onEmailChange,
  onAdd,
  onRemove,
  onRetry,
}: AccessViewProps): JSX.Element {
  const helpId = useId();
  const headingId = useId();
  const feedback = permission === PERMISSIONS.readFeedback;
  return (
    <section aria-labelledby={headingId} className="bg-muted/20 p-4 sm:p-6">
      <div className="mx-auto max-w-3xl space-y-8 rounded-xl border bg-card p-6 sm:p-10">
        <header className="space-y-2">
          <h2 id={headingId} className="text-2xl font-semibold">
            {feedback ? "意見閲覧権限" : "成果閲覧権限"}
          </h2>
          <p className="text-sm text-muted-foreground">
            {feedback
              ? "意見の閲覧権限を追加・取消します。共有成果の閲覧権限や管理権限は変更されません。"
              : "共有成果の閲覧権限を追加・取消します。意見の閲覧権限や管理権限は変更されません。"}
          </p>
        </header>
        {error && (
          <div
            role="alert"
            className="flex flex-wrap items-center gap-3 break-all text-sm text-destructive"
          >
            {error}
            <Button
              variant="outline"
              className="min-h-11 focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              disabled={loading || pending}
              onClick={onRetry}
            >
              再試行
            </Button>
          </div>
        )}
        <section
          className="space-y-3"
          aria-busy={loading || pending}
          aria-live="polite"
        >
          <h3 className="font-semibold">
            {feedback ? "意見を閲覧できるユーザー" : "成果を閲覧できるユーザー"}
          </h3>
          {pending && (
            <p role="status" className="text-sm text-muted-foreground">
              閲覧権限を反映中…
            </p>
          )}
          {loading ? (
            <p role="status">読み込み中…</p>
          ) : users.length === 0 ? (
            !error && (
              <p className="text-sm text-muted-foreground">
                閲覧者はいません。
              </p>
            )
          ) : (
            <ul className="divide-y">
              {users.map((user) => (
                <li
                  key={user.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-3"
                >
                  <div className="min-w-0">
                    <p className="break-all font-medium">
                      {user.name || "名前未設定"}
                    </p>
                    <p className="break-all text-sm text-muted-foreground">
                      {user.email}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    className="min-h-11 focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                    disabled={pending || loading}
                    aria-label={`${user.email} の閲覧権限を取り消す`}
                    onClick={() => onRemove(user.email)}
                  >
                    権限を取り消す
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </section>
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            onAdd();
          }}
        >
          <h3 className="font-semibold">閲覧者を追加</h3>
          <p id={helpId} className="text-sm text-muted-foreground">
            Idea Boost に Google
            ログイン済みのメールアドレスを入力してください。
          </p>
          <label className="block space-y-1 text-sm">
            <span>メールアドレス</span>
            <input
              type="email"
              required
              disabled={pending || loading}
              aria-describedby={helpId}
              autoComplete="email"
              value={email}
              onChange={(event) => onEmailChange(event.target.value)}
              className="block min-h-11 w-full rounded-md border bg-background px-3 text-base placeholder:text-muted-foreground focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50"
              placeholder="email@example.com"
            />
          </label>
          <Button
            className="min-h-11 focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            type="submit"
            disabled={pending || loading || !email.trim()}
          >
            追加
          </Button>
        </form>
      </div>
    </section>
  );
}

export function AccessDeniedView({
  permission = PERMISSIONS.readSharedOutcomes,
  unauthenticated,
  error,
  loading,
  onRetry,
}: {
  permission?: ManagedReadPermission;
  unauthenticated: boolean;
  error: string | null;
  loading: boolean;
  onRetry(): void;
}): JSX.Element {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="bg-muted/20 p-4 sm:p-6">
      <div className="mx-auto max-w-3xl space-y-4 rounded-xl border bg-card p-6 sm:p-10">
        <h2 id={headingId} className="text-2xl font-semibold">
          {permission === PERMISSIONS.readFeedback
            ? "意見閲覧権限"
            : "成果閲覧権限"}
        </h2>
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
        {loading && <p role="status">管理権限を確認中…</p>}
        <div className="flex flex-wrap items-center gap-4">
          {unauthenticated && (
            <a
              className="text-sm underline underline-offset-4"
              href="/login?next=%2Fadmin%2Faccess"
            >
              ログインする
            </a>
          )}
          <Button
            className="min-h-11 focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            variant="outline"
            disabled={loading}
            onClick={onRetry}
          >
            再試行
          </Button>
        </div>
      </div>
    </section>
  );
}
