// ホーム（/home）の Server Component。
// 認証・searchParams・Server Action 配線のみ。UI は同ディレクトリの home-view。
import { redirect } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getCurrentUser } from "@/lib/session/current-user";
import { isAuthConfigured } from "@/lib/session/env";
import { HomeView } from "./home-view";

export const dynamic = "force-dynamic";

type HomePageProps = {
  searchParams: Promise<{ error?: string }>;
};

export default async function HomePage({ searchParams }: HomePageProps) {
  if (!isAuthConfigured()) {
    return (
      <main className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
        <div className="flex h-full flex-1 items-center justify-center overflow-hidden p-4">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle className="text-lg">認証の設定が必要です</CardTitle>
              <CardDescription>
                認証の環境変数を設定してください。
              </CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              <p>
                <code className="font-mono text-xs">.env.example</code>
                を参考に
                <code className="font-mono text-xs">.env.local</code>
                を作成します。
              </p>
            </CardContent>
          </Card>
        </div>
      </main>
    );
  }

  const params = await searchParams;
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <main className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      <HomeView error={params.error} currentUserId={user.sub} />
    </main>
  );
}
