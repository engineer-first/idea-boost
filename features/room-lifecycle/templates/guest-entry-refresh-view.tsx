import { Button } from "@/components/ui/button";
import { GuestIdentityUnavailable } from "../molecules/guest-identity-unavailable";

export type GuestEntryRefreshViewProps = {
  state: "checking" | "retry" | "identity_unavailable";
  onRetry: () => void;
};

export function GuestEntryRefreshView({
  state,
  onRetry,
}: GuestEntryRefreshViewProps) {
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-background/80 p-4">
      {state === "identity_unavailable" ? (
        <GuestIdentityUnavailable />
      ) : (
        <section className="relative mx-auto my-8 w-full max-w-md space-y-4 rounded-xl border bg-background p-6">
          <p role="status" className="leading-relaxed">
            {state === "checking"
              ? "ルームを確認しています…"
              : "通信を確認して、もう一度お試しください。"}
          </p>
          {state === "retry" && (
            <Button className="min-h-11" onClick={onRetry}>
              もう一度試す
            </Button>
          )}
        </section>
      )}
    </div>
  );
}
