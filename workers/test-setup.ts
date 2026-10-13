// workers テストの前処理: D1 に migration を適用する。
// TEST_MIGRATIONS は vitest.workers.config.mts の readD1Migrations で注入される
// テスト専用バインディングのため、生成された Env 型をここで拡張する。
import {
  applyD1Migrations,
  type D1Migration,
  env,
  runInDurableObject,
} from "cloudflare:test";
import { beforeEach } from "vitest";

declare global {
  namespace Cloudflare {
    interface Env {
      // テスト実行時のみ存在する（optional にしないと本番 Env 型が汚染される）
      TEST_MIGRATIONS?: D1Migration[];
    }
  }
}

await applyD1Migrations(env.DB, env.TEST_MIGRATIONS ?? []);

// 各ケースの旧ルームが同じfixtureアカウントの次ケースを制限しないよう、
// directoryとアカウント操作を分離する。migrationとユーザー設定は保つ。
beforeEach(async () => {
  const users = await env.DB.prepare("SELECT id FROM users").all<{
    id: string;
  }>();
  for (const user of users.results)
    await runInDurableObject(
      env.ACCOUNT_DO.get(env.ACCOUNT_DO.idFromName(user.id)),
      async (_account, state) => state.storage.deleteAll(),
    );
  await env.DB.prepare("DELETE FROM rooms").run();
  await env.DB.prepare(
    "UPDATE room_creation_policy SET retired_before=0 WHERE id=1",
  ).run();
});
