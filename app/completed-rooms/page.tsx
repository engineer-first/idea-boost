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
export default async function CompletedRoomsPage({
  searchParams,
}: {
  searchParams: Promise<{ account_link?: string | string[] }>;
}) {
  const user = await getCurrentUser();
  if (!user)
    return (
      <CompletedRoomsUnavailableView
        loginHref={getLoginPath("/completed-rooms", "/home")}
      />
    );
  const query = await searchParams;
  return (
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
  );
}
