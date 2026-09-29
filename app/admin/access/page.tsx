import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AccessConsole } from "@/features/access";
import { apiFetch } from "@/lib/api-client";
import { getCurrentUser } from "@/lib/session/current-user";

export const metadata: Metadata = {
  title: "成果閲覧権限 | Idea Boost",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

export default async function AccessPage() {
  if (!(await getCurrentUser())) redirect("/login?next=%2Fadmin%2Faccess");
  let status = 503;
  try {
    status = (await apiFetch("/api/admin/access", { cache: "no-store" }))
      .status;
  } catch {
    /* 接続エラーを表示する */
  }
  if (status !== 200)
    return (
      <main className="mx-auto max-w-3xl p-6">
        <h1 className="text-2xl font-semibold">成果閲覧権限</h1>
        <p role="alert" className="mt-4">
          {status === 403
            ? "この画面の管理権限がありません。"
            : "権限情報を取得できませんでした。"}
        </p>
      </main>
    );
  return <AccessConsole />;
}
