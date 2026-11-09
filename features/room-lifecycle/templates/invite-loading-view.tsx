import { Card, CardHeader } from "@/components/ui/card";
import { inviteCopy } from "../logic/invite-copy";

export function InviteLoadingView() {
  return (
    <main className="flex h-full min-h-0 flex-1 flex-col items-center overflow-y-auto p-4 sm:p-6">
      <Card
        className="my-auto w-full max-w-md shrink-0"
        role="status"
        aria-busy="true"
      >
        <CardHeader>
          <h1 className="text-xl font-semibold leading-snug text-balance">
            {inviteCopy.loadingHeading}
          </h1>
        </CardHeader>
      </Card>
    </main>
  );
}
