import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  COMPLETED_ROOMS_HOME_LABEL,
  COMPLETED_ROOMS_IDENTITY_ERROR,
  COMPLETED_ROOMS_LOGIN_LABEL,
  COMPLETED_ROOMS_UNAVAILABLE_TITLE,
} from "./completed-rooms-content";

export type CompletedRoomsUnavailableViewProps = {
  returnPath: string;
};

export function CompletedRoomsUnavailableView({
  returnPath,
}: CompletedRoomsUnavailableViewProps) {
  return (
    <main className="h-full min-h-0 overflow-y-auto bg-background px-4 py-8 sm:px-8 sm:py-12">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-3xl font-bold">
          {COMPLETED_ROOMS_UNAVAILABLE_TITLE}
        </h1>
        <p className="mt-4 max-w-prose leading-7">
          {COMPLETED_ROOMS_IDENTITY_ERROR}
        </p>
        <Button asChild className="mt-6 min-h-11">
          <Link href="/home">{COMPLETED_ROOMS_HOME_LABEL}</Link>
        </Button>
        <p className="mt-6 text-sm text-muted-foreground">
          <Button asChild variant="link" className="min-h-11">
            <Link href={`/login?next=${encodeURIComponent(returnPath)}`}>
              {COMPLETED_ROOMS_LOGIN_LABEL}
            </Link>
          </Button>
        </p>
      </div>
    </main>
  );
}
