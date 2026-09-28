import type { z } from "zod";
import { Button } from "@/components/ui/button";
import type { AccessUserSchema } from "@/contracts/access";

type AccessUser = z.infer<typeof AccessUserSchema>;
export type AccessViewProps = {
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
  users,
  email,
  loading,
  pending,
  error,
  onEmailChange,
  onAdd,
  onRemove,
  onRetry,
}: AccessViewProps) {
  return (
    <main className="min-h-0 flex-1 overflow-y-auto bg-muted/20 p-6">
      <div className="mx-auto max-w-3xl space-y-8 rounded-xl border bg-card p-6 sm:p-10">
        <header className="space-y-2">
          <p className="text-sm text-muted-foreground">Idea Boost</p>
          <h1 className="text-2xl font-semibold">成果閲覧権限</h1>
          <p className="text-sm text-muted-foreground">
            共有成果を閲覧できるユーザーを管理します。
          </p>
        </header>
        {error && (
          <div
            role="alert"
            className="flex flex-wrap items-center gap-3 text-sm text-destructive"
          >
            {error}
            <Button variant="outline" onClick={onRetry}>
              再試行
            </Button>
          </div>
        )}
        <section className="space-y-3">
          <h2 className="font-semibold">成果を閲覧できるユーザー</h2>
          {loading ? (
            <p role="status">読み込み中…</p>
          ) : users.length === 0 ? (
            <p className="text-sm text-muted-foreground">閲覧者はいません。</p>
          ) : (
            <ul className="divide-y">
              {users.map((user) => (
                <li
                  key={user.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-3"
                >
                  <div className="min-w-0">
                    <p className="font-medium">{user.name || "名前未設定"}</p>
                    <p className="break-all text-sm text-muted-foreground">
                      {user.email}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={pending}
                    aria-label={`${user.email} の閲覧権限を削除`}
                    onClick={() => onRemove(user.email)}
                  >
                    削除
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
          <h2 className="font-semibold">閲覧者を追加</h2>
          <label className="block space-y-1 text-sm">
            <span>メールアドレス</span>
            <input
              type="email"
              required
              value={email}
              onChange={(event) => onEmailChange(event.target.value)}
              className="block min-h-11 w-full rounded-md border bg-background px-3"
              placeholder="email@example.com"
            />
          </label>
          <Button type="submit" disabled={pending || !email.trim()}>
            追加
          </Button>
        </form>
      </div>
    </main>
  );
}
