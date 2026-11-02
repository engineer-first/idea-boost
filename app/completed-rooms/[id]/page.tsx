import { notFound } from "next/navigation";
import { ACCOUNT_LINK_RESULT_PARAM } from "@/contracts/account-link";
import { isUuid } from "@/contracts/ids";
import {
  AccountLinkSection,
  getLoginPath,
  parseAccountLinkResult,
} from "@/features/auth";
import {
  CompletedRoomDetail,
  CompletedRoomsUnavailableView,
} from "@/features/completed-rooms";
import { getCurrentUser } from "@/lib/session/current-user";
export const dynamic = "force-dynamic";
export default async function CompletedRoomPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ account_link?: string | string[] }>;
}) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const user = await getCurrentUser();
  if (!user)
    return (
      <CompletedRoomsUnavailableView
        loginHref={getLoginPath(`/completed-rooms/${id}`, "/home")}
      />
    );
  const query = await searchParams;
  return (
    <CompletedRoomDetail
      key={`${user.sub}:${id}`}
      roomId={id}
      accountLink={
        <AccountLinkSection
          status={user.kind === "guest" ? "guest" : "linked"}
          next={`/completed-rooms/${id}`}
          result={parseAccountLinkResult(query[ACCOUNT_LINK_RESULT_PARAM])}
        />
      }
    />
  );
}
