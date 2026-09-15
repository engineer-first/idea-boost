// ルート `/` はホームへ寄せる。実体は app/home/page.tsx。
import { headers } from "next/headers";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function RootPage() {
  await headers(); // OpenNext で redirect() をエラーバウンダリに捕捉させないための workaround
  redirect("/home");
}
