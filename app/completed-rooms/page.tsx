import type { Metadata } from "next";
import { ACCOUNT_LINK_RESULT_PARAM } from "@/contracts/account-link";
import {
  AccountLinkSection,
  getLoginPath,
  parseAccountLinkResult,
} from "@/features/auth";
import {
  CompletedRooms,
  CompletedRoomsUnavailableView,
} from "@/features/completed-rooms";
import { getCurrentUser } from "@/lib/session/current-user";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "過去の成果 | Idea Boost" };
export default async function CompletedRoomsPage({
  searchParams,
}: {
  searchParams: Promise<{ account_link?: string | string[] }>;
}) {
  const user = await getCurrentUser();
  if (!user)
    return (
      <div lang="ja" className="contents">
        <CompletedRoomsUnavailableView
          loginHref={getLoginPath("/completed-rooms", "/home")}
        />
      </div>
    );
  const query = await searchParams;
  return (
    // 一覧はまだ翻訳していない。英語として読み上げないよう、この範囲だけ日本語と示す。
    <div lang="ja" className="contents">
      <CompletedRooms
        key={user.sub}
        accountLink={
          <AccountLinkSection
            status={user.kind === "guest" ? "guest" : "linked"}
            next="/completed-rooms"
            result={parseAccountLinkResult(query[ACCOUNT_LINK_RESULT_PARAM])}
          />
        }
      />
    </div>
  );
}
