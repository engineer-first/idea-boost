"use client";

import { useRef, useState } from "react";
import { RoomDisplayNameSchema } from "@/contracts/room-protocol";
import {
  type PreparedPrincipal,
  prepareGuestIdentity,
} from "../logic/guest-identity-actions";
import { guestIdentityFailure } from "../logic/guest-identity-copy";
import { GuestNameFormView } from "./guest-name-form-view";

export type GuestNameFormProps = {
  /** 成功した本人情報を通知する。遷移・router.refresh() は呼出元で行う。 */
  onPrepared: (principal: PreparedPrincipal) => void;
  submitLabel?: string;
  onPendingChange?: (pending: boolean) => void;
};

export function GuestNameForm({
  onPrepared,
  submitLabel,
  onPendingChange,
}: GuestNameFormProps) {
  const [name, setName] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  function submit(): void {
    if (inFlight.current) return;
    const parsed = RoomDisplayNameSchema.safeParse(name);
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }
    setPending(true);
    onPendingChange?.(true);
    setError(null);
    inFlight.current = true;
    void prepareGuestIdentity({ name: parsed.data })
      .then((result) => {
        if (result.ok) {
          onPrepared(result.principal);
        } else {
          inFlight.current = false;
          setPending(false);
          onPendingChange?.(false);
          setError(result.error);
        }
      })
      .catch(() => {
        inFlight.current = false;
        setPending(false);
        onPendingChange?.(false);
        setError(guestIdentityFailure);
      });
  }

  return (
    <GuestNameFormView
      name={name}
      pending={pending}
      error={error}
      submitLabel={submitLabel}
      onNameChange={(value) => {
        setName(value);
        setError(null);
      }}
      onSubmit={submit}
    />
  );
}
